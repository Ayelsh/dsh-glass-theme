// packages/host/src/workspace.ts
//
// Host half of the "工作空间" panel: a thin, fenced executor for the two CLIs
// the panel integrates (tapd — studyzy/tapd-ai-cli, and wecom-cli — the
// official WeCom CLI). The client never spawns anything itself; it POSTs a
// command descriptor here and this module runs it with the same loopback +
// same-origin fence every other mutating route in this package uses.
//
// Scope is deliberately narrow:
//   - only two CLI names are accepted, mapped to fixed commands (overridable
//     via plugin config `tapdCommand` / `wecomCommand` or the env vars
//     DSH_GLASS_TAPD_CMD / DSH_GLASS_WECOM_CMD);
//   - the first non-flag argument must belong to that CLI's subcommand
//     whitelist, so the route can never be turned into an arbitrary runner;
//   - nothing is ever passed through a shell: `spawn` is called with
//     `shell: false` and arguments as an argv array, so metacharacters are
//     inert by construction;
//   - wall-clock timeout, output caps and argument size caps are enforced on
//     every run.
//
// Routes (both registered as exact paths, like every other route here — the
// router prefers an exact match over the package's catch-all prefix):
//
//   GET  /dsh-glass-theme/ws/status
//        → { ok, clis: { tapd: {…}, wecom: {…} } }
//          Probes both CLIs (binary resolution + `--version`) and reports
//          tapd's credential file hint. The client uses this to decide
//          between live mode and the clearly-marked demo mode.
//
//   POST /dsh-glass-theme/ws/run   body { cli, args, timeoutMs? }
//        → { ok, cli, args, exitCode, timedOut, durationMs,
//            stdout: { json: true, value } | string, stderr }
//
//   POST /dsh-glass-theme/ws/install body { cli }
//        → { ok, cli, command, durationMs, log: string[], clis: {…} }
//          Managed one-click install for a missing CLI. wecom is installed
//          with `npm install -g @wecom/cli`; tapd is downloaded from the
//          studyzy/tapd-ai-cli GitHub release (asset name derived from the
//          OS/arch, sha256 verified against checksums.txt), extracted into
//          ~/.dsh/bin/tapd/<version>/ and remembered in a small state file.
//          Nothing from the request ever reaches a command line.
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

var PACKAGE_NAME = "dsh-glass-theme";
var STATUS_PATH = "/dsh-glass-theme/ws/status";
var RUN_PATH = "/dsh-glass-theme/ws/run";
var INSTALL_PATH = "/dsh-glass-theme/ws/install";
var DIAG_PATH = "/dsh-glass-theme/ws/diag";
var LOGIN_PATH = "/dsh-glass-theme/ws/login";
var LOGIN_STATE_PATH = "/dsh-glass-theme/ws/login-state";
var LOGIN_QR_PATH = "/dsh-glass-theme/ws/login-qr";
var OPEN_URL_PATH = "/dsh-glass-theme/ws/open-url";
var IMAGE_PATH = "/dsh-glass-theme/ws/image";
var RUN_BODY_MAX = 256 * 1024;
var LOGIN_BODY_MAX = 64 * 1024;

var DEFAULT_TIMEOUT_MS = 25_000;
var MAX_TIMEOUT_MS = 120_000;
var MIN_TIMEOUT_MS = 1_000;
var MAX_ARGS = 40;
var MAX_ARG_CHARS = 4_096;
var MAX_STREAM_BYTES = 2_000_000;

/** Subcommand whitelists. First non-flag argument of every run must be here. */
var SUBCOMMANDS = {
  tapd: new Set([
    "workspace", "story", "task", "bug", "wiki", "iteration", "workflow",
    "workitem-type",
    "url", "auth", "version", "help", "config", "me",
  ]),
  wecom: new Set([
    "message", "mail", "doc", "sheet", "smartsheet", "smartpage", "calendar",
    "meeting", "todo", "disk", "contact", "media", "identity", "auth",
    "version", "help",
  ]),
};

/**
 * Flags that are a complete invocation on their own. `tapd version` is a
 * command that does not exist in tapd-ai-cli 1.0 (it exits 1 silently); the
 * binary answers `--version`, so the console must accept that form.
 */
var LONE_FLAGS = {
  tapd: new Set(["--version", "-v", "--help", "-h"]),
  wecom: new Set(["--version", "-v", "--help", "-h"]),
};

var DEFAULT_COMMANDS = { tapd: "tapd", wecom: "wecom-cli" };

/** Login probing / child-process limits (see the Login section below). */
var WECOM_LOGIN_TIMEOUT_MS = 300_000;
var TAPD_LOGIN_TIMEOUT_MS = 10_000;
var LOGIN_STATUS_TIMEOUT_MS = 3_000;
var TAPD_WORKSPACE_LIST_TIMEOUT_MS = 20_000;
var TAPD_WORKSPACE_SWITCH_TIMEOUT_MS = 15_000;
/* `workspace info` after a switch is a local read of ~/.tapd.json plus one
 * request; keep it short so a stalled API still answers the panel quickly. */
var TAPD_LOGIN_STATUS_TIMEOUT_MS = 10_000;
var MAX_LOGIN_LINES = 60;
var MAX_LOGIN_LINE_CHARS = 300;

var INSTALL_TIMEOUT_MS = 300_000;
var TAPD_REPO = "studyzy/tapd-ai-cli";
var MAX_DOWNLOAD_BYTES = 60 * 1024 * 1024;
var DOWNLOAD_TIMEOUT_MS = 120_000;
var WS_STATE_FILE = "dsh-glass-theme-ws.json";

/* ------------------------------------------------------------------ *
 * HTTP helpers (same contract as routes.js; kept local so this module
 * stays independently loadable).
 * ------------------------------------------------------------------ */

/**
 * Write a JSON response at most once. Returns whether the bytes were handed to
 * the socket. This never throws: the client may have aborted while a long
 * install was running, or the response may already be finished. A throw here
 * used to happen inside a route's `catch`, which turned into an unhandled
 * rejection and terminated the whole host process.
 */
function sendJson(res, status, payload) {
  if (res === null || res === undefined) return false;
  if (res.writableEnded === true || res.destroyed === true) return false;
  let body;
  try {
    body = Buffer.from(JSON.stringify(payload));
  } catch {
    return false;
  }
  try {
    // Re-check: `writableEnded` can flip while the body is being serialised.
    if (res.writableEnded === true || res.destroyed === true) return false;
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "content-length": String(body.byteLength),
      "cache-control": "no-store",
    });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

/**
 * Track a client that walks away while a long-running route is still working.
 *
 * Node fires `close` on the request object for every completed POST (right
 * after the body has been consumed), so completion alone is not an abort: only
 * an incomplete request, an `aborted` event, or the response closing before we
 * wrote it counts. `{ cancelled: true }` means "do not send a response"; the
 * background work may still finish (or be killed by its own timeout).
 */
function watchRequest(req, res) {
  const state = { cancelled: false, reason: "" };
  const mark = (reason) => {
    if (state.cancelled) return;
    state.cancelled = true;
    state.reason = reason;
  };
  req.on?.("aborted", () => mark("request aborted"));
  req.on?.("close", () => {
    if (req.complete !== true) mark("request closed before the body completed");
  });
  res.on?.("close", () => {
    if (res.writableEnded !== true) mark("response closed before it was written");
  });
  return state;
}

function methodRefused(req, res, methods) {
  if (req.method !== undefined && methods.includes(req.method)) return false;
  res.writeHead(405, { allow: methods.join(", ") });
  res.end();
  return true;
}

function isLoopbackPeer(address) {
  if (address === undefined) return false;
  const plain = address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
  return plain === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(plain);
}

function refusalOf(ctx, req) {
  const connection = ctx.get("connection");
  if (typeof connection?.requestRejection === "function") return connection.requestRejection(req);
  if (!isLoopbackPeer(req.socket?.remoteAddress)) return 403;
  const host = req.headers.host;
  if (host !== undefined) {
    if (!URL.canParse(`http://${host}`)) return 403;
    const name = new URL(`http://${host}`).hostname;
    if (name !== "localhost" && name !== "[::1]" && !/^127\.\d+\.\d+\.\d+$/.test(name)) return 403;
  }
  const site = req.headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin" && site !== "none") return 403;
  const origin = req.headers.origin;
  if (origin === undefined) return undefined;
  if (!URL.canParse(origin)) return 403;
  return new URL(origin).host === host ? undefined : 403;
}

function fenceRefused(ctx, req, res) {
  const refused = refusalOf(ctx, req);
  if (refused === undefined) return false;
  sendJson(res, refused, { ok: false, error: refused === 401 ? "unauthorized" : "forbidden" });
  return true;
}

function readRequestBody(req, limit) {
  return new Promise((settle) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      settle(value);
    };
    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        finish(null);
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on("end", () => finish(Buffer.concat(chunks)));
    req.on("error", () => finish(null));
    // An aborted upload never emits "end"; without this the handler promise
    // would hang forever and keep its request object alive.
    req.on("close", () => finish(null));
  });
}

/* ------------------------------------------------------------------ *
 * Opening an external page (TAPD token page, WeCom admin console, …)
 * ------------------------------------------------------------------ */

/* The panel is allowed to send the browser to these hosts and nowhere else:
 * a route that opened arbitrary URLs would be a phishing gadget the moment a
 * page could reach the loopback port. */
const EXTERNAL_HOSTS = new Set([
  "www.tapd.cn",
  "tapd.cn",
  "open.tapd.cn",
  "open.weixin.qq.com",
  "work.weixin.qq.com",
]);

/** null when the url may be opened, else the reason it may not. */
function validateExternalUrl(url) {
  if (typeof url !== "string" || url.trim() === "") return "url must be a non-empty string";
  const value = url.trim();
  if (value.length > 2048) return "url is longer than 2048 characters";
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return "url is not absolute";
  }
  if (parsed.protocol !== "https:") return "only https urls may be opened";
  if (parsed.username !== "" || parsed.password !== "") return "url must not carry credentials";
  if (!EXTERNAL_HOSTS.has(parsed.hostname)) return `${parsed.hostname} is not an allow-listed host`;
  // Belt and braces: no whitespace, quotes, backslashes or shell metachars.
  if (/[\s"'`<>\\^|]/.test(value)) return "url contains characters this route refuses";
  return null;
}

/* ------------------------------------------------------------------ *
 * TAPD 描述图片的同源代理
 *
 * TAPD 富文本里的图片是站内相对路径（`/tfl/captures/…`），www.tapd.cn
 * 的登录 cookie 是 SameSite=Lax：浏览器直接打开能带上，应用内 <img> 的
 * 跨站子资源请求带不上，于是全部裂图。这里把图片换到应用自己的 origin：
 * `tapd image get --image-path <路径>` 用已配置的凭据换一枚预签名下载
 * 地址（file.tapd.cn，带 salt 和时效），宿主取回字节后原样回给页面。
 * ------------------------------------------------------------------ */

var IMAGE_QUERY_MAX = 512;
var IMAGE_FETCH_TIMEOUT_MS = 20_000;
var IMAGE_MAX_BYTES = 20 * 1024 * 1024;
/** `tapd image get` 的下载地址只落在这台主机上；换成别的 host 一律拒绝。 */
var IMAGE_DOWNLOAD_HOSTS = new Set(["file.tapd.cn"]);

/** null when the path may be handed to `tapd image get`, else the reason. */
function validateImagePath(value) {
  if (typeof value !== "string" || value.trim() === "") return "path must be a non-empty string";
  const text = value.trim();
  if (text.length > IMAGE_QUERY_MAX) return "path is too long";
  if (!text.startsWith("/")) return "path must be the site-relative path from the description";
  if (!/^\/[A-Za-z0-9._\-/]+$/.test(text)) return "path contains characters this route refuses";
  if (text.includes("..")) return "path must not contain ..";
  return null;
}

/** The content type an <img> can paint, from the header or the magic bytes. */
function sniffImageType(bytes, header) {
  const type = String(header ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (type.startsWith("image/")) return type;
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length > 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes.length > 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

/**
 * Turn a description image path into the bytes: `tapd image get` for the
 * signed url, then one GET. The CLI also writes the file next to its own
 * working directory (its `value` field reports where); that copy is removed
 * again, best effort — the signed url is the transport this route trusts,
 * because its bytes are verified against the image sniffers above.
 */
async function fetchTapdImage(resolvedPath, imagePath) {
  const run = await runResolved(resolvedPath, ["image", "get", "--image-path", imagePath, "--json"], {
    timeoutMs: 20_000,
  });
  if (run.timedOut) throw new Error("tapd image get timed out");
  if (run.exitCode !== 0) {
    throw new Error(`tapd image get failed (exit ${run.exitCode}): ${String(run.stderr ?? "").trim().slice(0, 300)}`);
  }
  const parsed = packageOutput(run.stdout);
  const value = parsed.json && parsed.value !== null && typeof parsed.value === "object" ? parsed.value : null;
  const downloadUrl = String(value?.download_url ?? "");
  const localCopy = String(value?.value ?? "");
  if (localCopy.startsWith(homedir().replace(/\\/g, "/")) && !localCopy.includes("..")) {
    try {
      rmSync(localCopy, { force: true });
    } catch {
      /* the stray CLI download is best-effort to clean up */
    }
  }
  if (downloadUrl === "" || !URL.canParse(downloadUrl)) {
    throw new Error("tapd image get returned no download url");
  }
  const target = new URL(downloadUrl);
  if (!IMAGE_DOWNLOAD_HOSTS.has(target.hostname)) {
    throw new Error(`${target.hostname} is not an allow-listed image host`);
  }
  const response = await fetch(target, {
    signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    headers: { accept: "image/*" },
  });
  if (!response.ok) throw new Error(`image download answered HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > IMAGE_MAX_BYTES) throw new Error("image exceeds the size this route proxies");
  const type = sniffImageType(bytes, response.headers.get("content-type"));
  if (type === null) throw new Error("the download url did not answer with an image");
  return { type, bytes };
}

/**
 * Hand the url to the OS. `spawn` is used with an argv array and no shell, so
 * nothing in the string is ever parsed as a command — the validation above is
 * about intent (which page), not about escaping.
 */
function openExternal(url) {
  if (IS_WINDOWS) {
    // rundll32 never involves cmd.exe, so no quoting rules apply.
    spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return;
  }
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(opener, [url], { detached: true, stdio: "ignore" }).unref();
}

/* ------------------------------------------------------------------ *
 * Process running
 * ------------------------------------------------------------------ */

const IS_WINDOWS = process.platform === "win32";

/** Resolved-command cache: command name → { path } | { miss: reason }. */
const resolutionCache = new Map();
const RESOLUTION_TTL_MS = 10 * 60_000;

function whereLookup(name) {
  return new Promise((settle) => {
    // `where` prints every PATH hit, one per line; the first is the one a
    // shell would run. Pattern misses exit non-zero.
    execFile("where.exe", [name], { windowsHide: true, timeout: 8_000 }, (error, stdout) => {
      if (error) {
        settle(null);
        return;
      }
      const line = String(stdout).split(/\r?\n/, 1)[0]?.trim();
      settle(line ? { path: line } : null);
    });
  });
}

/** Extensions CreateProcess can launch directly (no shell required). */
const WINDOWS_LAUNCHABLE = /\.(?:exe|cmd|bat|com)$/i;

/**
 * Resolve a bare command to an executable path. On Windows `spawn` without a
 * shell only launches executables directly — .cmd/.bat shims (which is what
 * npm installs) need an interpreter, and the extensionless `npm` shim that
 * Node ships is a POSIX shell script, so it must be skipped in favour of
 * `npm.cmd`. On POSIX the runtime PATH lookup is enough.
 */
async function resolveCommand(name) {
  if (!IS_WINDOWS) return { path: name };
  const cached = resolutionCache.get(name);
  if (cached && Date.now() - cached.at < RESOLUTION_TTL_MS) return cached.value;
  let value = null;
  if (/[\\/]/.test(name)) {
    if (existsSync(name)) value = { path: name };
  } else if (WINDOWS_LAUNCHABLE.test(name)) {
    // An explicit `npm.cmd` / `tapd.exe`: look it up on PATH as written.
    const hit = await whereLookup(name);
    if (hit && WINDOWS_LAUNCHABLE.test(hit.path)) value = hit;
  } else {
    // Try the launchable extensions first: `where npm` reports the
    // extensionless shell shim first on a standard Node install, and that
    // path cannot be spawned (`spawn` throws EINVAL).
    for (const candidate of [`${name}.exe`, `${name}.cmd`, `${name}.bat`, name]) {
      const hit = await whereLookup(candidate);
      if (hit && WINDOWS_LAUNCHABLE.test(hit.path)) {
        value = hit;
        break;
      }
    }
  }
  if (value === null) value = { miss: `no ${name} on PATH` };
  resolutionCache.set(name, { at: Date.now(), value });
  return value;
}

/** True when a path names a Node runtime rather than the desktop app binary. */
const NODE_BINARY = /(?:^|[\\/])node(?:\.exe)?$/i;

/** Resolved Node interpreter: { at, value: string | null } | null. */
let nodeRuntimeCache = null;

/**
 * The interpreter used to run a shim's JS entry point.
 *
 * `process.execPath` is Node in a plain Node process, but inside the desktop
 * host it is `DeepSeek Harness.exe` — an Electron GUI-subsystem executable
 * with no console. Running the wrapper script with it still works
 * (ELECTRON_RUN_AS_NODE is inherited), but the wrapper then starts the native
 * CLI — `@wecom/cli/bin/wecom.js` does
 * `execFileSync(binary, args, { stdio: 'inherit' })` — and Windows sees a
 * console program whose parent owns no console. It allocates a fresh console
 * for that child, and Windows 11 hands the new console to Windows Terminal:
 * a terminal window flashes open and disappears ~2 s later. The workspace
 * panel refreshes `wecom todo list` on every poll, so *every* button looked
 * like it opened a cmd window even though only the wecom path flashed.
 *
 * A real node.exe is a console program: `windowsHide` gives it a hidden
 * console that its inherited-stdio children inherit, so the CLI runs silently
 * — the same reason the TAPD path (a direct tapd.exe spawn) never flashed.
 * `null` means no Node was found; launchPlan then takes the cmd.exe fallback
 * (also a console program, also hidden) rather than the windowed Electron
 * binary.
 */
async function nodeRuntime() {
  if (NODE_BINARY.test(process.execPath)) return process.execPath;
  if (nodeRuntimeCache !== null && Date.now() - nodeRuntimeCache.at < RESOLUTION_TTL_MS) {
    return nodeRuntimeCache.value;
  }
  // npm puts the interpreter it used in the environment; otherwise ask PATH.
  const fromNpm = process.env.npm_node_execpath;
  let value =
    typeof fromNpm === "string" && NODE_BINARY.test(fromNpm) && existsSync(fromNpm) ? fromNpm : null;
  if (value === null) {
    const hit = await whereLookup("node.exe");
    if (hit !== null && NODE_BINARY.test(hit.path)) value = hit.path;
  }
  nodeRuntimeCache = { at: Date.now(), value };
  return value;
}

function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (IS_WINDOWS) {
    // A .cmd shim wraps the real binary; killing only the wrapper orphans the
    // child. `taskkill /T` takes the whole tree. The error listener matters:
    // an unhandled `error` event on this helper would crash the host.
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, shell: false }).on?.(
      "error",
      () => {}
    );
  } else {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

/**
 * The `<nodeDir>/node_modules/npm/bin/npm-cli.js` that sits next to the
 * `npm.cmd` shim on a standard Node install (official installer and
 * nvm-windows both use this layout). Running it with the Node interpreter from
 * nodeRuntime() avoids `.cmd` shims entirely, so spawn no longer throws EINVAL.
 */
function npmCliSibling(shimPath) {
  const candidate = join(dirname(shimPath), "node_modules", "npm", "bin", "npm-cli.js");
  return existsSync(candidate) ? candidate : null;
}

/**
 * The JS entry point an npm-installed `.cmd`/`.bat` shim wraps. Every npm
 * global install writes the same shape:
 *
 *   endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  \
 *     "%dp0%\node_modules\@wecom\cli\bin\wecom.js" %*
 *
 * Running that script with the Node interpreter from nodeRuntime() skips
 * `cmd.exe` completely, so arguments containing `"`, `%`, `&` or newlines
 * reach the CLI verbatim instead of being refused by the cmd quoting fallback.
 */
function nodeShimEntry(shimPath) {
  let text;
  try {
    if (!existsSync(shimPath)) return null;
    const stat = statSync(shimPath);
    if (stat.size > 64 * 1024) return null;
    text = readFileSync(shimPath, "utf8");
  } catch {
    return null;
  }
  if (!text.includes(".js") && !text.includes(".cjs") && !text.includes(".mjs")) return null;
  const shimDir = dirname(shimPath);
  // `%dp0%\node_modules\…\cli.js` (the standard npm template) first, then any
  // quoted `.js` path, resolved next to the shim.
  const patterns = [/%dp0%\\([^"\r\n]+\.(?:js|cjs|mjs))/i, /%~dp0\\([^"\r\n]+\.(?:js|cjs|mjs))/i, /"([^"\r\n]+\.(?:js|cjs|mjs))"/i];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match === null) continue;
    const relative = match[1].replace(/\\/g, "/").replace(/^\.[/\\]/, "");
    const candidate = relative.startsWith("/") ? relative : join(shimDir, relative);
    if (existsSync(candidate)) return candidate;
  }
  // Third-party shims (`pnpm`, scoop, vendor installers) spell the entry
  // differently: `$basedir/…`, `%APPDATA%\…`, or a bare `C:\…`. Fall back to
  // every `.js`-looking token in the file, stripping the variable prefix and
  // resolving whatever is left against the shim's directory.
  const tokens = text.match(/[^\s"'(]*\.(?:js|cjs|mjs)/gi) ?? [];
  for (const token of tokens) {
    const cleaned = token
      .replace(/^\$basedir[\\/]*/i, "")
      .replace(/^%[^%]+%[\\/]*/g, "")
      .replace(/^\.[\\/]/, "")
      .replace(/\\/g, "/");
    if (cleaned === "" || cleaned.includes("://")) continue;
    const candidate = /^[A-Za-z]:\//.test(cleaned) || cleaned.startsWith("/") ? cleaned : join(shimDir, cleaned);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Quote one argument for a `cmd.exe /d /s /c` command line. */
function quoteCmdArgument(value) {
  let text = String(value);
  if (!/[ "\\&\^|<>]/.test(text)) return text;
  // Trail the argument with the right number of backslashes so the quotes we
  // add below survive the CreateProcess/MSVC parsing rules.
  text = text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1");
  return `"${text}"`;
}

/**
 * Decide how to start a resolved executable. `.cmd`/`.bat` shims cannot be
 * spawned directly on Windows (EINVAL); npm gets its JS entry point run by the
 * Node interpreter (`nodePath`, see nodeRuntime), and any other shim falls back
 * to `cmd.exe /d /s /c`. The fallback is best-effort quoted and refuses
 * arguments that cmd cannot round-trip safely, so it can never turn an argument
 * into a command. `nodePath` defaults to `process.execPath` so the exported
 * helper keeps working under a plain Node process (tools/ws-check.mjs); the
 * host always passes nodeRuntime()'s answer.
 */
function launchPlan(path, args, nodePath = process.execPath) {
  if (!IS_WINDOWS || !/\.(?:cmd|bat)$/i.test(path)) {
    return { command: path, args, verbatim: false };
  }
  // `null` = no Node interpreter found (see nodeRuntime): never fall back to
  // the windowed Electron binary, because that is what makes the CLI's own
  // child allocate a visible console. The cmd.exe path below is a console
  // program, hidden by windowsHide, so its children inherit a hidden console.
  const interpreter = nodePath === null ? null : nodePath;
  if (interpreter !== null && /^npm(?:\.cmd|\.bat)?$/i.test(basename(path))) {
    const cli = npmCliSibling(path);
    if (cli !== null) return { command: interpreter, args: [cli, ...args], verbatim: false };
  }
  // Any other npm shim (`wecom-cli.cmd`, …): run the script it wraps. This is
  // the difference between "搜索 100% 覆盖" reaching the CLI intact and the
  // cmd.exe fallback refusing the argument outright.
  const entry = interpreter === null ? null : nodeShimEntry(path);
  if (entry !== null) return { command: interpreter, args: [entry, ...args], verbatim: false };
  if (/["%\r\n]/.test(path)) {
    throw new Error(`cannot safely launch ${path} through cmd.exe`);
  }
  for (const arg of args) {
    if (/["%\r\n]/.test(arg)) {
      throw new Error(
        `无法把参数 ${JSON.stringify(String(arg)).slice(0, 80)} 安全传给 ${basename(path)}：它是 .cmd 包装脚本，` +
          `没有找到可直跑的 JS 入口，只能退回 cmd.exe，而 cmd.exe 会改写参数里的引号/%` +
          `（指向的文件：${path}）。临时绕过：把参数里的引号/% 去掉重试；长期修法：重装 CLI（npm i -g @wecom/cli）让垫片回到标准 npm 模板。`
      );
    }
  }
  const commandLine = [path, ...args.map(quoteCmdArgument)].join(" ");
  return {
    // cmd.exe /s strips the outer pair of quotes; wrapping the whole line is
    // what makes a quoted executable path with spaces work.
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", `"${commandLine}"`],
    verbatim: true,
  };
}

/**
 * Run a resolved command with argv semantics (never a shell). Resolves with
 * the captured output; rejects only on spawn-level failure (ENOENT…).
 */
async function runResolved(path, args, { timeoutMs }) {
  let plan;
  try {
    plan = launchPlan(path, args, await nodeRuntime());
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((settle, reject) => {
    let child;
    try {
      child = spawn(plan.command, plan.args, {
        shell: false,
        windowsHide: true,
        windowsVerbatimArguments: plan.verbatim,
        env: process.env,
        cwd: homedir(),
        // stdin must be a closed/null handle. A piped stdin that nobody ever
        // writes or ends makes commands that read it (`tapd bug update`,
        // `tapd story update`) block until the timeout — the panel then shows
        // "退出码 1" with empty output. Measured: 0.5 s with stdin=ignore vs
        // never returning with the default pipe.
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      reject(error);
      return;
    }
    if (child.pid === undefined) {
      reject(new Error("could not start the process"));
      return;
    }
    let stdout = "";
    let stderr = "";
    let stdoutOver = false;
    let stderrOver = false;
    let timedOut = false;
    let settledFlag = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    const finish = (code, signal) => {
      if (settledFlag) return;
      settledFlag = true;
      clearTimeout(timer);
      settle({
        exitCode: code,
        signal: signal ?? null,
        timedOut,
        stdout: stdoutOver ? `${stdout}\n…(truncated)` : stdout,
        stderr: stderrOver ? `${stderr}\n…(truncated)` : stderr,
      });
    };
    child.stdout?.on("data", (chunk) => {
      if (!stdoutOver) {
        stdout += String(chunk);
        if (Buffer.byteLength(stdout) > MAX_STREAM_BYTES) {
          stdoutOver = true;
          killTree(child);
        }
      }
    });
    child.stderr?.on("data", (chunk) => {
      if (!stderrOver) {
        stderr += String(chunk);
        if (Buffer.byteLength(stderr) > MAX_STREAM_BYTES) {
          stderrOver = true;
          killTree(child);
        }
      }
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settledFlag) {
        settledFlag = true;
        reject(error);
      }
    });
    child.on("close", (code, signal) => finish(code, signal));
  });
}

/** Parse captured stdout: JSON when the CLI emitted JSON, text otherwise. */
function packageOutput(text) {
  const trimmed = String(text ?? "").trim();
  if (trimmed === "") return { json: false, value: "" };
  try {
    return { json: true, value: JSON.parse(trimmed) };
  } catch {
    return { json: false, value: trimmed };
  }
}

/* ------------------------------------------------------------------ *
 * Login children
 *
 * The QR flow needs a process that outlives the HTTP response, so it cannot
 * go through runResolved (which buffers and settles). Every background child
 * is kept in a plain record; the route handler answers immediately and the
 * panel polls LOGIN_STATE_PATH.
 *
 * Crash isolation is the whole point of this section: a spawn throw, an
 * asynchronous `error` event, a stream error or a timeout must all land in
 * `finishLogin`, never in the event loop. The reported crash (wecom install
 * taking the whole host down) happened because a child error had no listener.
 * ------------------------------------------------------------------ */

/**
 * Singleton QR-login state. `state` is one of:
 *   "idle"    — never started in this host process
 *   "running" — child alive, waiting for a scan
 *   "exited"  — child finished; LOGIN_STATE_PATH asks the CLI for the result
 *   "failed"  — spawn error / timeout / non-zero exit; the panel shows `log`
 */
var wecomLogin = {
  state: "idle",
  child: null,
  lines: [],
  message: "",
  startedAt: 0,
  exitCode: null,
  finished: true,
  timedOut: false,
  timerId: null,
};

/** Where `auth init --output-qrcode` writes the PNG. */
function wecomLoginQrFile() {
  return join(tmpdir(), "dsh-glass-theme-wecom-login.png");
}

function resetWecomLogin() {
  const record = wecomLogin;
  if (record.timerId !== null) {
    try {
      clearTimeout(record.timerId);
    } catch {
      /* already fired */
    }
  }
  record.state = "idle";
  record.child = null;
  record.lines = [];
  record.message = "";
  record.startedAt = 0;
  record.exitCode = null;
  record.finished = true;
  record.timedOut = false;
  record.timerId = null;
}

/** Append a chunk to the record's capped log tail (one line per entry). */
function pushLoginOutput(record, chunk) {
  const text = String(chunk ?? "");
  if (text === "") return;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\r$/, "").slice(0, MAX_LOGIN_LINE_CHARS);
    if (line.trim() === "") continue;
    record.lines.push(line);
  }
  if (record.lines.length > MAX_LOGIN_LINES) {
    record.lines.splice(0, record.lines.length - MAX_LOGIN_LINES);
  }
}

/**
 * Mark a login child as finished. Idempotent: `error` and `close` both fire
 * for the same child, and a timeout may race the exit.
 */
function finishLogin(record, exitCode, message) {
  if (record === null) return;
  if (record.finished === true) return;
  record.finished = true;
  if (record.timerId !== null) {
    try {
      clearTimeout(record.timerId);
    } catch {
      /* already fired */
    }
    record.timerId = null;
  }
  record.child = null;
  if (typeof exitCode === "number") record.exitCode = exitCode;
  if (record.timedOut === true) {
    record.state = "failed";
    record.message = message || "登录超时";
  } else if (message !== undefined && message !== "") {
    record.state = "failed";
    record.message = String(message).slice(0, 300);
    pushLoginOutput(record, record.message);
  } else {
    // The outcome itself is decided by `auth show --status`, not by the exit
    // code; LOGIN_STATE_PATH re-probes after any exit.
    record.state = "exited";
  }
}

/**
 * Start a background login child. Returns the record (not a promise): a
 * synchronous spawn failure is recorded as `failed`, an asynchronous one
 * arrives through the `error` listener. Never throws.
 *
 * Exported for tools/ws-check.mjs, which exercises the spawn-failure path
 * with a non-existent executable instead of a real CLI.
 */
function startLoginChild(record, command, args, nodePath = process.execPath) {
  let plan;
  try {
    plan = launchPlan(command, args, nodePath);
  } catch (error) {
    record.state = "failed";
    record.message = `无法启动登录进程：${String(error?.message ?? error).slice(0, 260)}`;
    record.finished = true;
    return record;
  }
  let child;
  try {
    child = spawn(plan.command, plan.args, {
      shell: false,
      windowsHide: true,
      windowsVerbatimArguments: plan.verbatim,
      env: process.env,
      cwd: homedir(),
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    record.state = "failed";
    record.message = `无法启动登录进程：${String(error?.message ?? error).slice(0, 260)}`;
    record.finished = true;
    return record;
  }
  record.child = child;
  record.state = "running";
  record.finished = false;
  record.timedOut = false;
  record.exitCode = null;
  record.startedAt = Date.now();
  // `.on` handlers must be attached before anything can be emitted, and they
  // must be attached even when `pid` is undefined: that is exactly the
  // ENOENT case, where the child object still emits `error` on the next tick.
  // (Skipping them here is what lets a failed spawn crash the host.)
  child.stdout?.on("data", (chunk) => pushLoginOutput(record, chunk));
  child.stderr?.on("data", (chunk) => pushLoginOutput(record, chunk));
  child.stdout?.on("error", () => {});
  child.stderr?.on("error", () => {});
  child.on("error", (error) => {
    finishLogin(record, null, `登录进程出错：${String(error?.message ?? error).slice(0, 240)}`);
  });
  child.on("close", (code) => {
    // Whatever the exit code, the outcome of a QR login is what the CLI's own
    // status says; LOGIN_STATE_PATH asks it once the process is gone.
    finishLogin(record, typeof code === "number" ? code : null, undefined);
  });
  if (child.pid === undefined) {
    // A child that never got a pid cannot run; record the failure now so a
    // caller gets an answer even before the `error` event arrives.
    finishLogin(record, null, "无法启动登录进程");
    return record;
  }
  const timer = setTimeout(() => {
    if (record.child === null || record.finished === true) return;
    record.timedOut = true;
    try {
      killTree(record.child);
    } catch {
      /* already gone */
    }
    finishLogin(record, null, "登录超时（超过 5 分钟）");
  }, WECOM_LOGIN_TIMEOUT_MS);
  // A pending timer must not keep a short-lived process (the test suite, a
  // CLI one-off) alive for five minutes.
  timer.unref?.();
  record.timerId = timer;
  return record;
}

/** Kill a running QR login and remove its image. Called from dispose. */
function stopWecomLogin() {
  const child = wecomLogin.child;
  if (child !== null) {
    try {
      killTree(child);
    } catch {
      /* already gone */
    }
  }
  wecomLogin.child = null;
  wecomLogin.finished = true;
  try {
    rmSync(wecomLoginQrFile(), { force: true });
  } catch {
    /* nothing to remove */
  }
  resetWecomLogin();
}

/* ------------------------------------------------------------------ *
 * CLI façade
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Managed-install state
 *
 * One-click installs (see INSTALL_PATH) record the tapd binary they placed
 * in ~/.dsh/bin. The state file is advisory: env vars and the plugin config
 * always win, and a missing file simply falls back to the PATH lookup.
 * ------------------------------------------------------------------ */

function wsStatePath() {
  return join(homedir(), ".dsh", WS_STATE_FILE);
}

function readWsState() {
  try {
    const raw = JSON.parse(readFileSync(wsStatePath(), "utf8"));
    return raw !== null && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function writeWsState(state) {
  try {
    mkdirSync(dirname(wsStatePath()), { recursive: true });
    writeFileSync(wsStatePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
  } catch {
    /* a read-only home degrades to PATH lookup; not fatal */
  }
}

function commandFor(ctx, config, cli) {
  const envKey = cli === "tapd" ? "DSH_GLASS_TAPD_CMD" : "DSH_GLASS_WECOM_CMD";
  const configKey = cli === "tapd" ? "tapdCommand" : "wecomCommand";
  const fromEnv = process.env[envKey];
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") return fromEnv.trim();
  // NOTE: `ctx.config` must NOT be read here. Cordis contexts throw on
  // property access for services not declared via inject ("cannot get
  // property 'config' without inject"), and optional chaining does not
  // shield against a throwing getter. Plugin config arrives as the plain
  // `config` argument of apply(ctx, config) instead.
  const fromConfig = config?.[configKey];
  if (typeof fromConfig === "string" && fromConfig.trim() !== "") return fromConfig.trim();
  const fromState = readWsState()[configKey];
  if (typeof fromState === "string" && fromState.trim() !== "") return fromState.trim();
  return DEFAULT_COMMANDS[cli];
}

function validateRun(body) {
  if (body === null || typeof body !== "object") return "body must be an object";
  if (body.cli !== "tapd" && body.cli !== "wecom") return "cli must be 'tapd' or 'wecom'";
  if (!Array.isArray(body.args)) return "args must be an array";
  if (body.args.length === 0) return "args must not be empty";
  if (body.args.length > MAX_ARGS) return `args must hold at most ${MAX_ARGS} entries`;
  let sawSubcommand = false;
  for (const arg of body.args) {
    if (typeof arg !== "string") return "every arg must be a string";
    if (arg.includes("\0")) return "args must not contain NUL";
    if (arg.length > MAX_ARG_CHARS) return `arg longer than ${MAX_ARG_CHARS} characters`;
    if (arg.startsWith("-")) continue;
    if (!sawSubcommand) {
      sawSubcommand = true;
      if (!SUBCOMMANDS[body.cli].has(arg)) {
        return `'${arg}' is not a ${body.cli} subcommand this route may run`;
      }
    }
  }
  if (!sawSubcommand) {
    if (body.args.every((arg) => LONE_FLAGS[body.cli].has(arg))) return null;
    return "args must include a subcommand";
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Probe
 * ------------------------------------------------------------------ */

const probeCache = new Map(); // cli → { at, report }

/**
 * tapd has no `auth show --status` subcommand: credentials live in
 * TAPD_ACCESS_TOKEN or ~/.tapd.json. Deliberately synchronous — no process,
 * no network.
 */
function readTapdConfig() {
  try {
    const parsed = JSON.parse(readFileSync(join(homedir(), ".tapd.json"), "utf8"));
    return parsed !== null && typeof parsed === "object" && Array.isArray(parsed) === false ? parsed : null;
  } catch {
    return null;
  }
}

function textField(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Credentials and the active workspace both live in `~/.tapd.json`
 * (`access_token` / `api_user` + `api_password` / `workspace_id`), with
 * `TAPD_*` environment variables winning over the file. `tapd-ai-cli` refuses
 * to run any list command without a workspace id (`workspace_required`), so the
 * report carries that state too — otherwise the panel says "已登录" and every
 * fetch still fails.
 */
function tapdAuthReport() {
  const config = readTapdConfig();
  const envToken = textField(process.env.TAPD_ACCESS_TOKEN);
  const fileToken = textField(config?.access_token);
  const fileUser = textField(config?.api_user);
  const filePassword = typeof config?.api_password === "string" ? config.api_password : "";
  const workspaceId = textField(process.env.TAPD_WORKSPACE_ID) !== "" ? textField(process.env.TAPD_WORKSPACE_ID) : textField(config?.workspace_id);
  let detail = "缺少 Access Token";
  if (envToken !== "") detail = "环境变量 TAPD_ACCESS_TOKEN";
  else if (fileToken !== "") detail = "凭据文件 ~/.tapd.json（Access Token）";
  else if (fileUser !== "" && filePassword !== "") detail = "凭据文件 ~/.tapd.json（API 账号）";
  const authorized = detail !== "缺少 Access Token";
  return {
    state: authorized ? "authorized" : "unauthorized",
    detail,
    method: "token",
    // Unknown until we have credentials, configured/missing afterwards.
    workspace: authorized
      ? { state: workspaceId === "" ? "missing" : "configured", id: workspaceId }
      : { state: "unknown", id: "" },
  };
}

/**
 * `tapd workspace list` answers `{ items: [{ id, name, … }], total }`; anything
 * unparsable degrades to "no workspaces" instead of guessing.
 */
async function tapdWorkspaceList(resolved) {
  const run = await runResolved(resolved.path, ["workspace", "list"], {
    timeoutMs: TAPD_WORKSPACE_LIST_TIMEOUT_MS,
  });
  const stdout = String(run.stdout ?? "").trim();
  const problem = String(run.stderr ?? "").trim().split(/\r?\n/, 1)[0] ?? "";
  let parsed = null;
  try {
    parsed = stdout === "" ? null : JSON.parse(stdout);
  } catch {
    parsed = null;
  }
  const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
  const workspaces = [];
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const id = textField(item.id ?? item.workspace_id);
    if (id === "") continue;
    workspaces.push({ id, name: textField(item.name ?? item.workspace_name) });
  }
  return {
    workspaces,
    message: workspaces.length === 0 ? problem.slice(0, 200) || (run.timedOut ? "workspace list timed out" : "workspace list 没有返回项目") : "",
  };
}

/**
 * `workspace switch` persists to `./.tapd.json`; every CLI call runs in the
 * home directory, so this lands in `~/.tapd.json`.
 *
 * The CLI answers `{"success":true}` for *any* id — including one the token
 * cannot reach — and leaves that id in the config, which breaks every later
 * call with HTTP 403. So the switch is confirmed against `workspace info` and
 * a bad id is rolled back to the previous project.
 */
async function switchTapdWorkspace(resolved, workspaceId) {
  const previous = tapdAuthReport().workspace.id;
  const restore = async () => {
    if (previous === "") return;
    try {
      await runResolved(resolved.path, ["workspace", "switch", previous], {
        timeoutMs: TAPD_WORKSPACE_SWITCH_TIMEOUT_MS,
      });
    } catch {
      /* best effort: the panel reports the failure anyway */
    }
  };
  const run = await runResolved(resolved.path, ["workspace", "switch", workspaceId], {
    timeoutMs: TAPD_WORKSPACE_SWITCH_TIMEOUT_MS,
  });
  if (run.exitCode !== 0 || run.timedOut === true) {
    await restore();
    return false;
  }
  let landed = "";
  try {
    const info = await runResolved(resolved.path, ["workspace", "info"], {
      timeoutMs: TAPD_LOGIN_STATUS_TIMEOUT_MS,
    });
    if (info.exitCode === 0 && info.timedOut !== true) {
      landed = textField(JSON.parse(String(info.stdout ?? "").trim())?.id);
    }
  } catch {
    landed = "";
  }
  if (landed === workspaceId) return true;
  await restore();
  return false;
}

/**
 * After a successful credential login TAPD still needs a workspace. Exactly one
 * project → switch to it silently; several → hand the list to the panel so the
 * user picks one.
 */
async function tapdWorkspaceAssist(resolved, { auto }) {
  const report = tapdAuthReport();
  /* A configured workspace needs no list: the picker only exists to fill a
   * gap. The toolbar switcher reads `workspace list` through the run route
   * instead, so it never depends on this short-circuit. */
  if (report.workspace.state === "configured") {
    return { state: "configured", id: report.workspace.id, workspaces: [], message: "" };
  }
  let listed;
  try {
    listed = await tapdWorkspaceList(resolved);
  } catch (error) {
    return {
      state: "missing",
      id: "",
      workspaces: [],
      message: `无法列出 TAPD 项目：${String(error?.message ?? error).slice(0, 200)}`,
    };
  }
  if (listed.workspaces.length === 1 && auto) {
    const only = listed.workspaces[0];
    try {
      if (await switchTapdWorkspace(resolved, only.id)) {
        probeCache.delete("tapd");
        return { state: "configured", id: only.id, workspaces: listed.workspaces, message: "" };
      }
    } catch {
      /* fall through to the picker */
    }
  }
  return {
    state: listed.workspaces.length === 0 ? "missing" : "pick",
    id: "",
    workspaces: listed.workspaces,
    message: listed.message,
  };
}

/**
 * wecom answers `auth show --status` with a single word (`authorized` /
 * `unauthorized`). Anything else — a timeout, a crash, a future output format
 * — is reported as `unknown` rather than guessed.
 */
async function wecomAuthReport(resolved) {
  const report = { state: "unknown", detail: "", method: "qr" };
  try {
    const run = await runResolved(resolved.path, ["auth", "show", "--status"], {
      timeoutMs: LOGIN_STATUS_TIMEOUT_MS,
    });
    const stdout = String(run.stdout ?? "");
    const firstOut = (stdout.split(/\r?\n/, 1)[0] ?? "").trim();
    const firstErr = (String(run.stderr ?? "").split(/\r?\n/, 1)[0] ?? "").trim();
    report.detail = (firstOut || firstErr).slice(0, 200);
    if (report.detail === "") {
      report.detail = run.timedOut ? "status probe timed out" : "no status output";
    }
    const token = stdout.trim().toLowerCase();
    if (token === "authorized") report.state = "authorized";
    else if (token === "unauthorized") report.state = "unauthorized";
  } catch (error) {
    report.detail = String(error?.message ?? error).slice(0, 200);
  }
  return report;
}

async function cliAuthReport(cli, resolved, available) {
  const method = cli === "wecom" ? "qr" : "token";
  if (!available || resolved === null || resolved === undefined || resolved.miss !== undefined) {
    return { state: "unavailable", detail: "", method };
  }
  return cli === "tapd" ? tapdAuthReport() : wecomAuthReport(resolved);
}

async function probeCli(ctx, config, cli) {
  const cached = probeCache.get(cli);
  if (cached && Date.now() - cached.at < 60_000) return cached.report;
  const command = commandFor(ctx, config, cli);
  const report = { command, available: false, detail: "", installable: true };
  report.installHint =
    cli === "tapd"
      ? "一键安装会从 GitHub Releases 下载并校验 sha256，装入 ~/.dsh/bin"
      : "一键安装执行 npm install -g @wecom/cli";
  const resolved = await resolveCommand(command);
  if (resolved.miss !== undefined) {
    report.detail = resolved.miss;
  } else {
    report.available = true;
    try {
      const run = await runResolved(resolved.path, ["--version"], { timeoutMs: 8_000 });
      const first = (run.stdout || run.stderr || "").split(/\r?\n/, 1)[0] ?? "";
      report.detail = first.slice(0, 200);
      if (report.detail === "") {
        report.detail = run.timedOut ? "installed (version probe timed out)" : "installed";
      }
    } catch (error) {
      report.detail = `installed (probe failed: ${String(error?.message ?? error).slice(0, 120)})`;
    }
  }
  if (cli === "tapd") {
    report.credentialsHint = existsSync(join(homedir(), ".tapd.json"))
      ? "credentials file ~/.tapd.json present"
      : "no ~/.tapd.json — run `tapd auth login` (or set TAPD_ACCESS_TOKEN)";
  }
  try {
    report.auth = await cliAuthReport(cli, resolved, report.available);
  } catch (error) {
    report.auth = {
      state: report.available ? "unknown" : "unavailable",
      detail: String(error?.message ?? error).slice(0, 200),
      method: cli === "wecom" ? "qr" : "token",
    };
  }
  probeCache.set(cli, { at: Date.now(), report });
  return report;
}

/* ------------------------------------------------------------------ *
 * Managed install
 * ------------------------------------------------------------------ */

function platformAsset() {
  const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "x64" ? "amd64" : process.arch === "arm64" ? "arm64" : process.arch;
  const ext = process.platform === "win32" ? "zip" : "tar.gz";
  return { os, arch, ext };
}

async function fetchWithTimeout(url, options = {}) {
  const response = await fetch(url, {
    redirect: "follow",
    ...options,
    headers: { "user-agent": "dsh-glass-theme", ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response;
}

/** Latest release tag ("v1.2.3"): the API when allowed, else the redirect. */
async function latestTapdTag(log) {
  try {
    const response = await fetchWithTimeout(`https://api.github.com/repos/${TAPD_REPO}/releases/latest`, {
      headers: { accept: "application/vnd.github+json" },
    });
    const tag = (await response.json())?.tag_name;
    if (typeof tag === "string" && tag !== "") return tag;
  } catch {
    /* fall through to the redirect probe */
  }
  const probe = await fetch(`https://github.com/${TAPD_REPO}/releases/latest`, {
    redirect: "manual",
    headers: { "user-agent": "dsh-glass-theme" },
    signal: AbortSignal.timeout(20_000),
  });
  const location = probe.headers.get("location") ?? "";
  const match = location.match(/\/tag\/(v[\w.-]+)$/);
  if (match !== null) return match[1];
  throw new Error("could not resolve the latest release tag");
}

function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Parse the release's `checksums.txt` into `{ hash, name }` entries, one per
 * recognised line. Accepted formats:
 *
 *   <64 hex>  <name>            # sha256sum output (what tapd-ai-cli ships)
 *   <64 hex> *<name>            # sha256sum --binary marker
 *   sha256:<64 hex>  <name>     # prefixed variant
 *   SHA256 (<name>) = <64 hex>  # BSD / `shasum -a 256`
 *
 * Names are reduced to their basename (checksum files are flat, but this
 * tolerates `./name` and path prefixes), a UTF-8 BOM / CRLF / the `*` marker
 * are stripped, and malformed lines are skipped instead of thrown. Exported
 * for the regression tests in tools/ws-check.mjs.
 */
function parseChecksums(text) {
  const entries = [];
  if (typeof text !== "string") return entries;
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    let hash;
    let name;
    const bsd = line.match(/^SHA256\s*\((.+)\)\s*=\s*([0-9a-f]{64})$/i);
    if (bsd !== null) {
      hash = bsd[2];
      name = bsd[1];
    } else {
      const sum = line.match(/^(?:sha256:)?([0-9a-f]{64})\s+\*?(.+)$/i);
      if (sum === null) continue;
      hash = sum[1];
      name = sum[2];
    }
    const normalized = basename(name.trim().replace(/^\.\//, ""));
    if (normalized === "" || normalized === "." || normalized === "..") continue;
    entries.push({ hash: hash.toLowerCase(), name: normalized });
  }
  return entries;
}

async function installTapd(log) {
  const { os, arch, ext } = platformAsset();
  const tag = await latestTapdTag(log);
  const version = tag.replace(/^v/, "");
  const assetName = `tapd_${version}_${os}_${arch}.${ext}`;
  if (!/^tapd_[\w.-]+_(windows|darwin|linux)_(amd64|arm64|\w+)\.(zip|tar\.gz)$/.test(assetName)) {
    throw new Error(`unexpected asset name ${assetName}`);
  }
  log(`最新版本 ${tag} → ${assetName}`);
  const base = `https://github.com/${TAPD_REPO}/releases/download/${tag}/`;
  const checksumResponse = await fetchWithTimeout(`${base}checksums.txt`);
  const checksumText = await checksumResponse.text();
  const entries = parseChecksums(checksumText);
  const wantedName = basename(assetName);
  const expected = entries.find((entry) => entry.name === wantedName)?.hash;
  if (expected === undefined) {
    const available = [...new Set(entries.map((entry) => entry.name))];
    const listed = available.slice(0, 5).join("、");
    const suffix =
      listed === ""
        ? "（checksums.txt 为空或格式无法识别）"
        : `（checksums.txt 中的文件名：${listed}${available.length > 5 ? " 等" : ""}）`;
    throw new Error(`${assetName} 未出现在 checksums.txt 中${suffix}`);
  }

  const download = await fetchWithTimeout(`${base}${assetName}`);
  const bytes = Buffer.from(await download.arrayBuffer());
  if (bytes.byteLength < 512 * 1024 || bytes.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(`下载的 ${assetName} 大小异常（${bytes.byteLength} 字节）`);
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== expected) throw new Error(`${assetName} sha256 校验失败`);

  const binDir = join(homedir(), ".dsh", "bin", "tapd", version);
  rmSync(binDir, { recursive: true, force: true });
  mkdirSync(binDir, { recursive: true });
  const archivePath = join(binDir, assetName);
  writeFileSync(archivePath, bytes);
  const tarPath =
    process.platform === "win32"
      ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
      : "tar";
  const tarArgs = ext === "zip" ? ["-xf", archivePath, "-C", binDir] : ["-xzf", archivePath, "-C", binDir];
  const extract = await runResolved(tarPath, tarArgs, { timeoutMs: 30_000 });
  if (extract.exitCode !== 0) {
    throw new Error(`tar 退出码 ${extract.exitCode}: ${String(extract.stderr).trim().slice(0, 300)}`);
  }
  const wanted = process.platform === "win32" ? "tapd.exe" : "tapd";
  const found = walkFiles(binDir).find((file) => basename(file) === wanted);
  if (found === undefined) throw new Error(`压缩包中没有找到 ${wanted}`);
  rmSync(archivePath, { force: true });
  const state = readWsState();
  state.tapdCommand = found;
  writeWsState(state);
  resolutionCache.delete("tapd");
  probeCache.delete("tapd");
  log(`已安装 ${found}`);
  return found;
}

async function installWecom(log) {
  const resolved = await resolveCommand("npm");
  if (resolved.miss !== undefined) throw new Error(`未找到 npm（${resolved.miss}）— 请先安装 Node.js`);
  log("npm install -g @wecom/cli …");
  const run = await runResolved(resolved.path, ["install", "-g", "@wecom/cli"], {
    timeoutMs: INSTALL_TIMEOUT_MS,
  });
  const tail = `${run.stdout}\n${run.stderr}`.trim().split(/\r?\n/).filter((line) => line !== "");
  for (const line of tail.slice(-3)) log(line);
  if (run.exitCode !== 0) throw new Error(`npm 退出码 ${run.exitCode}: ${tail.slice(-2).join(" / ").slice(0, 400)}`);
  resolutionCache.delete("wecom");
  probeCache.delete("wecom");
  return DEFAULT_COMMANDS.wecom;
}

/* ------------------------------------------------------------------ *
 * Login routes (LOGIN_PATH / LOGIN_STATE_PATH / LOGIN_QR_PATH)
 * ------------------------------------------------------------------ */

function loginQuery(req) {
  try {
    return new URL(String(req.url ?? ""), "http://127.0.0.1").searchParams;
  } catch {
    return null;
  }
}

/** The `cli` query parameter, or null when it is missing / not one of ours. */
function cliFromQuery(req) {
  const query = loginQuery(req);
  if (query === null) return null;
  const cli = query.get("cli");
  return cli === "tapd" || cli === "wecom" ? cli : null;
}

function loginQrUrl() {
  return `${LOGIN_QR_PATH}?cli=wecom&t=${Date.now()}`;
}

function runningWecomPayload(message) {
  return {
    ok: true,
    cli: "wecom",
    state: "running",
    method: "qr",
    qr: loginQrUrl(),
    message: message ?? "请使用企业微信扫码登录",
  };
}

/** Secrets must never appear in a response body or a log line. */
function redactToken(lines, secrets) {
  const list = (Array.isArray(secrets) ? secrets : [secrets]).filter(
    (value) => typeof value === "string" && value !== "",
  );
  if (list.length === 0) return lines;
  return lines.map((line) => {
    let out = line;
    for (const secret of list) out = out.split(secret).join("[redacted]");
    return out;
  });
}

/**
 * Start (or join) the QR login. Returns `{ payload }`: the exact JSON body the
 * route answers with. Repeated calls while a child is alive never start a
 * second one.
 */
async function ensureWecomLogin(ctx, config) {
  if (wecomLogin.state === "running" && wecomLogin.child !== null) {
    return { payload: runningWecomPayload("登录已在进行中，请使用企业微信扫码") };
  }
  try {
    rmSync(wecomLoginQrFile(), { force: true });
  } catch {
    /* stale image, best effort */
  }
  resetWecomLogin();
  const command = commandFor(ctx, config, "wecom");
  const resolved = await resolveCommand(command);
  if (resolved.miss !== undefined) {
    return {
      payload: {
        ok: false,
        cli: "wecom",
        state: "unavailable",
        method: "qr",
        message: `wecom-cli 未安装（${resolved.miss}）`,
      },
    };
  }
  startLoginChild(
    wecomLogin,
    resolved.path,
    ["auth", "init", "--noninteractive", "--output-qrcode", wecomLoginQrFile()],
    await nodeRuntime()
  );
  if (wecomLogin.state !== "running") {
    return {
      payload: {
        ok: false,
        cli: "wecom",
        state: "failed",
        method: "qr",
        message: wecomLogin.message || "无法启动登录进程",
      },
    };
  }
  return { payload: runningWecomPayload() };
}

/**
 * Current QR-login snapshot. While the child runs the answer is `running`;
 * once it exits the CLI itself is asked for the outcome, so a scan that
 * happened inside the child is never second-guessed by an exit code.
 */
async function wecomLoginSnapshot(ctx, config) {
  const log = wecomLogin.lines.slice(-MAX_LOGIN_LINES);
  if (wecomLogin.state === "running" && wecomLogin.child !== null) {
    return { state: "running", log, qr: loginQrUrl(), message: "等待企业微信扫码确认" };
  }
  if (wecomLogin.state === "idle") {
    return { state: "idle", log: [], message: "尚未开始登录" };
  }
  if (wecomLogin.state === "failed") {
    return { state: "failed", log, message: wecomLogin.message || "登录失败" };
  }
  const command = commandFor(ctx, config, "wecom");
  const resolved = await resolveCommand(command);
  if (resolved.miss !== undefined) {
    return { state: "failed", log, message: `wecom-cli 未安装（${resolved.miss}）` };
  }
  const auth = await wecomAuthReport(resolved);
  if (auth.state === "authorized" || auth.state === "unauthorized") {
    return { state: auth.state, log, message: auth.detail };
  }
  return { state: "failed", log, message: auth.detail || "无法确认登录状态" };
}

/** tapd has no background login process: the probe is the single truth. */
async function tapdLoginSnapshot(ctx, config) {
  const report = await probeCli(ctx, config, "tapd");
  const auth = report?.auth ?? { state: "unknown", detail: "" };
  return { state: auth.state, log: [], message: auth.detail };
}

/**
 * `tapd auth login --access-token <token>` or
 * `tapd auth login --api-user <user> --api-password <password>`.
 *
 * TAPD hands out two kinds of credentials and both are common in the wild: an
 * OAuth Access Token from the open platform, and the API 账号/口令 a company
 * admin generates under 公司管理 → 开放平台. Accepting only the former left
 * every enterprise user stuck at the login row. Every secret travels as one
 * argv entry (never through a shell, never into a log line) and every
 * occurrence the CLI echoes back is redacted.
 */
async function runTapdLogin(ctx, config, credentials) {
  const token = credentials.token === undefined ? "" : String(credentials.token);
  const apiUser = credentials.apiUser === undefined ? "" : String(credentials.apiUser);
  const apiPassword = credentials.apiPassword === undefined ? "" : String(credentials.apiPassword);
  const method = token !== "" ? "token" : "password";
  const command = commandFor(ctx, config, "tapd");
  const resolved = await resolveCommand(command);
  if (resolved.miss !== undefined) {
    return {
      status: 200,
      payload: {
        ok: false,
        cli: "tapd",
        state: "failed",
        method,
        log: [],
        message: `tapd 未安装（${resolved.miss}）`,
      },
    };
  }
  const argv =
    token !== ""
      ? ["auth", "login", "--access-token", token]
      : ["auth", "login", "--api-user", apiUser, "--api-password", apiPassword];
  const secrets = [token, apiPassword].filter((value) => value !== "");
  let run;
  try {
    run = await runResolved(resolved.path, argv, {
      timeoutMs: TAPD_LOGIN_TIMEOUT_MS,
    });
  } catch (error) {
    return {
      status: 200,
      payload: {
        ok: false,
        cli: "tapd",
        state: "failed",
        method: "token",
        log: [],
        message: `无法运行 tapd auth login：${String(error?.message ?? error).slice(0, 220)}`,
      },
    };
  }
  const lines = [];
  for (const raw of `${run.stdout ?? ""}\n${run.stderr ?? ""}`.split(/\r?\n/)) {
    const line = raw.replace(/\r$/, "").slice(0, MAX_LOGIN_LINE_CHARS);
    if (line.trim() === "") continue;
    lines.push(line);
  }
  const log = redactToken(lines.slice(-MAX_LOGIN_LINES), secrets);
  if (run.exitCode === 0 && run.timedOut !== true) {
    probeCache.delete("tapd");
    return { status: 200, payload: { ok: true, cli: "tapd", state: "authorized", method, log } };
  }
  return {
    status: 200,
    payload: {
      ok: false,
      cli: "tapd",
      state: "failed",
      method,
      log,
      message: run.timedOut ? "tapd auth login 超时（10 秒）" : `tapd auth login 退出码 ${run.exitCode}`,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Route registration
 * ------------------------------------------------------------------ */

function registerWorkspaceRoutes(ctx, scope, config) {
  scope.effect(() => {
    const disposers = [];
    const report = (message, error) =>
      ctx.logger?.warn?.(`${PACKAGE_NAME}: ${message}: ${error?.message ?? String(error)}`);
    const server = scope.webServer;
    if (server === undefined || server === null) {
      report("web server unavailable", new Error("no webServer service, workspace routes not registered"));
      return;
    }
    const register = (label, route) => {
      try {
        const dispose = server.register(route);
        if (typeof dispose === "function") disposers.push(dispose);
      } catch (error) {
        report(`${label} route unavailable`, error);
      }
    };

    register("workspace status", {
      kind: "exact",
      path: STATUS_PATH,
      handler: (req, res) => {
        if (methodRefused(req, res, ["GET"])) return;
        if (fenceRefused(ctx, req, res)) return;
        void Promise.all([probeCli(ctx, config, "tapd"), probeCli(ctx, config, "wecom")])
          .then(([tapd, wecom]) => sendJson(res, 200, { ok: true, clis: { tapd, wecom } }))
          .catch((error) =>
            sendJson(res, 500, { ok: false, error: String(error?.message ?? String(error)) })
          );
      },
    });

    register("workspace diag", {
      kind: "exact",
      path: DIAG_PATH,
      handler: (req, res) => {
        if (methodRefused(req, res, ["POST"])) return;
        if (fenceRefused(ctx, req, res)) return;
        void (async () => {
          const raw = await readRequestBody(req, 64 * 1024);
          if (raw === null) {
            sendJson(res, 413, { ok: false, error: "request body too large" });
            return;
          }
          let body = null;
          try {
            body = JSON.parse(String(raw, "utf8"));
          } catch {
            body = null;
          }
          if (body === null || typeof body !== "object" || Array.isArray(body)) {
            sendJson(res, 400, { ok: false, error: "body must be a JSON object" });
            return;
          }
          const file = join(tmpdir(), "dsh-glass-theme-diag.json");
          try {
            writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), body }, null, 2));
          } catch (error) {
            sendJson(res, 500, { ok: false, error: String(error?.message ?? String(error)) });
            return;
          }
          sendJson(res, 200, { ok: true, file });
        })();
      },
    });

    register("workspace open url", {
      kind: "exact",
      path: OPEN_URL_PATH,
      handler: (req, res) => {
        if (methodRefused(req, res, ["POST"])) return;
        if (fenceRefused(ctx, req, res)) return;
        void (async () => {
          const raw = await readRequestBody(req, 8 * 1024);
          if (raw === null) {
            sendJson(res, 413, { ok: false, error: "request body too large" });
            return;
          }
          let body = null;
          try {
            body = JSON.parse(String(raw, "utf8"));
          } catch {
            body = null;
          }
          const url = body !== null && typeof body === "object" ? body.url : undefined;
          const problem = validateExternalUrl(url);
          if (problem !== null) {
            sendJson(res, 400, { ok: false, error: problem });
            return;
          }
          openExternal(String(url).trim());
          sendJson(res, 200, { ok: true, opened: true, url: String(url).trim() });
        })().catch((error) =>
          sendJson(res, 500, { ok: false, error: String(error?.message ?? String(error)) })
        );
      },
    });

    register("workspace run", {
      kind: "exact",
      path: RUN_PATH,
      handler: (req, res) => {
        if (methodRefused(req, res, ["POST"])) return;
        if (fenceRefused(ctx, req, res)) return;
        const watch = watchRequest(req, res);
        void (async () => {
          const raw = await readRequestBody(req, RUN_BODY_MAX);
          if (watch.cancelled) return;
          if (raw === null) {
            sendJson(res, 413, { ok: false, error: "request body too large" });
            return;
          }
          let body = null;
          try {
            body = JSON.parse(String(raw, "utf8"));
          } catch {
            sendJson(res, 400, { ok: false, error: "body must be JSON" });
            return;
          }
          const problem = validateRun(body);
          if (problem !== null) {
            sendJson(res, 400, { ok: false, error: problem });
            return;
          }
          const timeoutMs = Math.min(
            MAX_TIMEOUT_MS,
            Math.max(MIN_TIMEOUT_MS, Number(body.timeoutMs) || DEFAULT_TIMEOUT_MS)
          );
          const command = commandFor(ctx, config, body.cli);
          const resolved = await resolveCommand(command);
          if (watch.cancelled) return;
          if (resolved.miss !== undefined) {
            sendJson(res, 503, {
              ok: false,
              error: `${command} is not installed (${resolved.miss}). ${
                body.cli === "tapd"
                  ? "Install tapd-ai-cli from github.com/studyzy/tapd-ai-cli/releases"
                  : "Install with npm i -g @wecom/cli"
              }`,
            });
            return;
          }
          const started = Date.now();
          try {
            const run = await runResolved(resolved.path, body.args, { timeoutMs });
            // The client went away while the CLI was running: the work is
            // done, but there is nobody to answer — writing would raise
            // ERR_STREAM_WRITE_AFTER_END.
            if (watch.cancelled) return;
            sendJson(res, 200, {
              ok: true,
              cli: body.cli,
              args: body.args,
              exitCode: run.exitCode,
              timedOut: run.timedOut,
              durationMs: Date.now() - started,
              stdout: packageOutput(run.stdout),
              stderr: String(run.stderr ?? "").trim().slice(0, 8_000),
            });
          } catch (error) {
            if (watch.cancelled) {
              report(`workspace run response dropped (${watch.reason})`, error);
              return;
            }
            sendJson(res, 500, {
              ok: false,
              error: String(error?.message ?? String(error)),
              // Where the CLI actually came from, so a shim/quoting failure is
              // diagnosable without opening a console.
              resolved: resolved.path,
            });
          }
        })().catch((error) => {
          // Last-resort guard: without it a throw here (or inside the catch
          // above) becomes an unhandled rejection and kills the host process.
          if (watch.cancelled) {
            report(`workspace run aborted (${watch.reason})`, error);
            return;
          }
          sendJson(res, 500, { ok: false, error: String(error?.message ?? String(error)) });
        });
      },
    });

    register("workspace image", {
      kind: "exact",
      path: IMAGE_PATH,
      handler: (req, res) => {
        if (methodRefused(req, res, ["GET"])) return;
        if (fenceRefused(ctx, req, res)) return;
        void (async () => {
          let query = null;
          try {
            query = new URL(req.url ?? "/", "http://localhost");
          } catch {
            query = null;
          }
          const imagePath = query?.searchParams?.get("path") ?? "";
          const problem = validateImagePath(imagePath);
          if (problem !== null) {
            sendJson(res, 400, { ok: false, error: problem });
            return;
          }
          const command = commandFor(ctx, config, "tapd");
          const resolved = await resolveCommand(command);
          if (resolved.miss !== undefined) {
            sendJson(res, 503, { ok: false, error: `${command} is not installed (${resolved.miss})` });
            return;
          }
          const { type, bytes } = await fetchTapdImage(resolved.path, imagePath.trim());
          res.writeHead(200, {
            "content-type": type,
            "content-length": String(bytes.byteLength),
            /* 描述不常变：同一枚签名地址在浏览器里缓存十分钟，翻回旧详情不再打宿主 */
            "cache-control": "private, max-age=600",
          });
          res.end(bytes);
        })().catch((error) => {
          if (!res.headersSent) {
            sendJson(res, 502, { ok: false, error: String(error?.message ?? String(error)) });
          } else {
            res.end();
          }
        });
      },
    });

    register("workspace install", {
      kind: "exact",
      path: INSTALL_PATH,
      handler: (req, res) => {
        if (methodRefused(req, res, ["POST"])) return;
        if (fenceRefused(ctx, req, res)) return;
        const watch = watchRequest(req, res);
        void (async () => {
          const raw = await readRequestBody(req, RUN_BODY_MAX);
          if (watch.cancelled) return;
          if (raw === null) {
            sendJson(res, 413, { ok: false, error: "request body too large" });
            return;
          }
          let body = null;
          try {
            body = JSON.parse(String(raw, "utf8"));
          } catch {
            sendJson(res, 400, { ok: false, error: "body must be JSON" });
            return;
          }
          if (body === null || typeof body !== "object" || (body.cli !== "tapd" && body.cli !== "wecom")) {
            sendJson(res, 400, { ok: false, error: "cli must be 'tapd' or 'wecom'" });
            return;
          }
          const lines = [];
          const log = (line) => {
            if (lines.length < 60) lines.push(String(line).slice(0, 300));
          };
          const started = Date.now();
          try {
            const command = body.cli === "tapd" ? await installTapd(log) : await installWecom(log);
            // Do not spend another round of probing for a response nobody
            // will read; the log lines above were captured for nothing, but
            // the install itself stays applied.
            if (watch.cancelled) {
              report(`workspace install completed after the client left (${watch.reason})`, new Error("cancelled"));
              return;
            }
            const [tapd, wecom] = await Promise.all([
              probeCli(ctx, config, "tapd"),
              probeCli(ctx, config, "wecom"),
            ]);
            if (watch.cancelled) return;
            sendJson(res, 200, {
              ok: true,
              cli: body.cli,
              command,
              durationMs: Date.now() - started,
              log: lines,
              clis: { tapd, wecom },
            });
          } catch (error) {
            if (watch.cancelled) {
              report(`workspace install response dropped (${watch.reason})`, error);
              return;
            }
            sendJson(res, 500, {
              ok: false,
              cli: body.cli,
              error: String(error?.message ?? String(error)),
              log: lines,
            });
          }
        })().catch((error) => {
          if (watch.cancelled) {
            report(`workspace install aborted (${watch.reason})`, error);
            return;
          }
          sendJson(res, 500, { ok: false, error: String(error?.message ?? String(error)) });
        });
      },
    });

    register("workspace login", {
      kind: "exact",
      path: LOGIN_PATH,
      handler: (req, res) => {
        if (methodRefused(req, res, ["POST"])) return;
        if (fenceRefused(ctx, req, res)) return;
        const watch = watchRequest(req, res);
        void (async () => {
          const raw = await readRequestBody(req, LOGIN_BODY_MAX);
          if (watch.cancelled) return;
          if (raw === null) {
            sendJson(res, 413, { ok: false, error: "request body too large" });
            return;
          }
          let body = null;
          try {
            body = JSON.parse(String(raw, "utf8"));
          } catch {
            body = null;
          }
          if (body === null || typeof body !== "object" || Array.isArray(body)) {
            sendJson(res, 400, { ok: false, error: "body must be a JSON object" });
            return;
          }
          if (body.cli !== "tapd" && body.cli !== "wecom") {
            sendJson(res, 400, { ok: false, error: "cli must be 'tapd' or 'wecom'" });
            return;
          }
          if (body.cli === "wecom") {
            const result = await ensureWecomLogin(ctx, config);
            if (watch.cancelled) return;
            sendJson(res, 200, result.payload);
            return;
          }
          const token = typeof body.token === "string" ? body.token.trim() : "";
          const apiUser = typeof body.apiUser === "string" ? body.apiUser.trim() : "";
          const apiPassword = typeof body.apiPassword === "string" ? body.apiPassword : "";
          const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
          if (workspaceId !== "") {
            const resolved = await resolveCommand(commandFor(ctx, config, "tapd"));
            if (watch.cancelled) return;
            if (resolved.miss !== undefined) {
              sendJson(res, 200, { ok: false, cli: "tapd", state: "failed", message: `tapd 未安装（${resolved.miss}）` });
              return;
            }
            let switched = false;
            try {
              switched = await switchTapdWorkspace(resolved, workspaceId);
            } catch (error) {
              sendJson(res, 200, {
                ok: false,
                cli: "tapd",
                state: "failed",
                message: `无法切换 TAPD 项目：${String(error?.message ?? error).slice(0, 200)}`,
              });
              return;
            }
            if (watch.cancelled) return;
            if (switched === false) {
              sendJson(res, 200, { ok: false, cli: "tapd", state: "failed", message: "tapd workspace switch 未成功" });
              return;
            }
            probeCache.delete("tapd");
            sendJson(res, 200, {
              ok: true,
              cli: "tapd",
              state: "authorized",
              method: "token",
              workspaceId,
              workspace: { state: "configured", id: workspaceId },
            });
            return;
          }
          if (body.action === "list-workspaces") {
            const resolved = await resolveCommand(commandFor(ctx, config, "tapd"));
            if (watch.cancelled) return;
            if (resolved.miss !== undefined) {
              sendJson(res, 200, { ok: false, cli: "tapd", state: "failed", workspaces: [], message: `tapd 未安装（${resolved.miss}）` });
              return;
            }
            let assist;
            try {
              assist = await tapdWorkspaceAssist(resolved, { auto: true });
            } catch (error) {
              sendJson(res, 200, {
                ok: false,
                cli: "tapd",
                state: "failed",
                workspaces: [],
                message: String(error?.message ?? error).slice(0, 200),
              });
              return;
            }
            if (watch.cancelled) return;
            sendJson(res, 200, {
              ok: true,
              cli: "tapd",
              state: assist.state === "configured" ? "authorized" : "needsWorkspace",
              workspaces: assist.workspaces,
              workspace: { state: assist.state === "configured" ? "configured" : "missing", id: assist.id },
              message: assist.message,
            });
            return;
          }
          if (token === "" && (apiUser === "" || apiPassword === "")) {
            // HTTP 200 on purpose: the panel renders the credential inputs from this.
            sendJson(res, 200, {
              ok: false,
              cli: "tapd",
              needsToken: true,
              method: "token",
              message: "需要 TAPD Access Token，或 API 账号 + 口令",
            });
            return;
          }
          const result = await runTapdLogin(ctx, config, { token, apiUser, apiPassword });
          if (watch.cancelled) return;
          // A fresh login usually still lacks a workspace id; resolve it now so
          // the panel does not report "已登录" while every list call fails.
          if (result.payload?.ok === true) {
            try {
              const resolved = await resolveCommand(commandFor(ctx, config, "tapd"));
              if (resolved.miss === undefined) {
                const assist = await tapdWorkspaceAssist(resolved, { auto: true });
                result.payload.workspaces = assist.workspaces;
                result.payload.workspace = { state: assist.state === "configured" ? "configured" : "missing", id: assist.id };
                if (assist.state === "configured") result.payload.workspaceId = assist.id;
                if (assist.message !== "") result.payload.workspaceMessage = assist.message;
              }
            } catch (error) {
              result.payload.workspaceMessage = String(error?.message ?? error).slice(0, 200);
            }
            if (watch.cancelled) return;
          }
          sendJson(res, result.status, result.payload);
        })().catch((error) => {
          if (watch.cancelled) {
            report(`workspace login aborted (${watch.reason})`, error);
            return;
          }
          sendJson(res, 500, { ok: false, error: String(error?.message ?? String(error)) });
        });
      },
    });

    register("workspace login state", {
      kind: "exact",
      path: LOGIN_STATE_PATH,
      handler: (req, res) => {
        if (methodRefused(req, res, ["GET"])) return;
        if (fenceRefused(ctx, req, res)) return;
        void (async () => {
          const cli = cliFromQuery(req);
          if (cli === null) {
            sendJson(res, 400, { ok: false, error: "cli must be 'tapd' or 'wecom'" });
            return;
          }
          const snapshot =
            cli === "wecom" ? await wecomLoginSnapshot(ctx, config) : await tapdLoginSnapshot(ctx, config);
          const payload = { ok: true, cli, state: snapshot.state, log: snapshot.log };
          if (snapshot.qr !== undefined) payload.qr = snapshot.qr;
          if (snapshot.message !== undefined && snapshot.message !== "") payload.message = snapshot.message;
          sendJson(res, 200, payload);
        })().catch((error) =>
          sendJson(res, 500, { ok: false, error: String(error?.message ?? String(error)) })
        );
      },
    });

    register("workspace login qr", {
      kind: "exact",
      path: LOGIN_QR_PATH,
      handler: (req, res) => {
        if (methodRefused(req, res, ["GET"])) return;
        if (fenceRefused(ctx, req, res)) return;
        void (async () => {
          if (cliFromQuery(req) !== "wecom") {
            sendJson(res, 400, { ok: false, error: "cli must be 'wecom'" });
            return;
          }
          let bytes;
          try {
            bytes = readFileSync(wecomLoginQrFile());
          } catch {
            sendJson(res, 404, { ok: false, error: "no qr yet" });
            return;
          }
          if (res.writableEnded === true || res.destroyed === true) return;
          try {
            res.writeHead(200, {
              "content-type": "image/png",
              "content-length": String(bytes.byteLength),
              "cache-control": "no-store",
            });
            res.end(bytes);
          } catch {
            /* client went away between the check and the write */
          }
        })().catch((error) => sendJson(res, 500, { ok: false, error: String(error?.message ?? String(error)) }));
      },
    });

    return () => {
      // A login child must not outlive the plugin: kill it and drop the image.
      try {
        stopWecomLogin();
      } catch {
        /* never let cleanup break dispose */
      }
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
          /* already disposed */
        }
      }
    };
  }, `${PACKAGE_NAME}: workspace routes`);
}

export {
  launchPlan,
  parseChecksums,
  registerWorkspaceRoutes,
  startLoginChild,
  validateExternalUrl,
  validateImagePath,
  wecomLoginQrFile,
};
