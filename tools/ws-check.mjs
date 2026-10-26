// tools/ws-check.mjs
//
// Smoke test for the workspace host routes (src/host/workspace.js) against a
// mock server — no running app required. Exercises the fence, the validator,
// the status probe, the missing-CLI path, checksum parsing and the Windows
// npm/abort regressions. Run: node tools/ws-check.mjs
//
// The import points at `src/` (the readable source). `lib/host/workspace.js`
// is a verbatim build copy, so testing the source keeps this suite runnable
// before `node tools/build.mjs`.
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  launchPlan,
  parseChecksums,
  registerWorkspaceRoutes,
  startLoginChild,
  validateExternalUrl,
  validateImagePath,
  wecomLoginQrFile,
} from "../src/host/workspace.js";

const unhandled = [];
process.on("unhandledRejection", (reason) => unhandled.push(reason));

const routes = new Map();
const server = {
  register(route) {
    routes.set(route.path, route);
    return () => routes.delete(route.path);
  },
};

let disposeWorkspace = null;
const scope = {
  effect(fn) {
    disposeWorkspace = fn();
  },
  webServer: server,
};
const ctx = {
  get(name) {
    if (name === "connection") return undefined; // fence falls back to socket check
    return undefined;
  },
  logger: console,
};
// Cordis throws on property access for services that were not injected. The
// regression this guards against: commandFor once read `ctx?.config`, and the
// optional chaining did not shield against the throwing getter — it 500'd
// every /ws/status request ("cannot get property \"config\" without inject").
Object.defineProperty(ctx, "config", {
  get() {
    throw new Error('cannot get property "config" without inject');
  },
  configurable: true,
});

registerWorkspaceRoutes(ctx, scope, { tapdCommand: "", wecomCommand: "" });

let failures = 0;
const check = (name, condition, detail) => {
  if (condition) console.log(`ok    ${name}`);
  else {
    failures += 1;
    console.error(`FAIL  ${name}${detail === undefined ? "" : ` — ${detail}`}`);
  }
};

const makeRes = () => {
  const res = {
    status: 0,
    headers: null,
    body: null,
    finished: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body === undefined ? "" : String(body);
      if (this.finished) this.finished();
    },
  };
  return res;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const newEventRequest = (method, url, remoteAddress = "127.0.0.1") => {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = {};
  req.socket = { remoteAddress };
  return req;
};

const request = async (method, path, body, remoteAddress = "127.0.0.1") => {
  const req = newEventRequest(method, path, remoteAddress);
  const res = makeRes();
  const settled = new Promise((resolve) => {
    res.finished = resolve;
  });
  // Routes are registered by exact path; the query string is not part of it.
  routes.get(path.split("?")[0]).handler(req, res);
  if (body !== undefined) {
    const buffer = Buffer.from(body);
    await new Promise((resolve) => setImmediate(resolve));
    req.emit("data", buffer);
    req.emit("end");
  }
  await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 30_000))]);
  let json = null;
  try {
    json = res.body === "" ? null : JSON.parse(res.body);
  } catch {
    json = null;
  }
  return { res, json };
};

// 1. status probe — both CLIs are absent on a clean machine; report shape matters
{
  const { res, json } = await request("GET", "/dsh-glass-theme/ws/status");
  check("status: 200", res.status === 200, `got ${res.status}`);
  check("status: ok true", json?.ok === true);
  check("status: tapd report", json?.clis?.tapd && typeof json.clis.tapd.available === "boolean");
  check("status: tapd credentials hint", typeof json?.clis?.tapd?.credentialsHint === "string");
  check("status: wecom report", json?.clis?.wecom && typeof json.clis.wecom.available === "boolean");
  check(
    "status: tapd auth report",
    json?.clis?.tapd?.auth !== undefined &&
      typeof json.clis.tapd.auth.state === "string" &&
      json.clis.tapd.auth.method === "token",
    JSON.stringify(json?.clis?.tapd?.auth),
  );
  check(
    "status: wecom auth report",
    json?.clis?.wecom?.auth !== undefined &&
      typeof json.clis.wecom.auth.state === "string" &&
      json.clis.wecom.auth.method === "qr",
    JSON.stringify(json?.clis?.wecom?.auth),
  );
  check(
    "status: missing CLI reports auth unavailable",
    (json?.clis?.tapd?.available === false ? json.clis.tapd.auth.state === "unavailable" : true) &&
      (json?.clis?.wecom?.available === false ? json.clis.wecom.auth.state === "unavailable" : true),
    JSON.stringify({ tapd: json?.clis?.tapd, wecom: json?.clis?.wecom }),
  );
}

// 2. validator — the route must refuse anything outside the two CLIs
{
  const { res } = await request("POST", "/dsh-glass-theme/ws/run", JSON.stringify({ cli: "sh", args: ["bug", "list"] }));
  check("run: unknown cli refused", res.status === 400, `got ${res.status}`);
}
{
  const { res, json } = await request("POST", "/dsh-glass-theme/ws/run", JSON.stringify({ cli: "tapd", args: ["evil", "list"] }));
  check("run: non-whitelisted subcommand refused", res.status === 400, `got ${res.status} ${json?.error}`);
}
{
  const { res, json } = await request("POST", "/dsh-glass-theme/ws/run", JSON.stringify({ cli: "tapd", args: ["--help"] }));
  check("run: a lone --help is accepted (tapd answers it, `tapd help` does not)", res.status === 200, `got ${res.status} ${json?.error}`);
}
{
  const { res, json } = await request("POST", "/dsh-glass-theme/ws/run", JSON.stringify({ cli: "tapd", args: ["--nope"] }));
  check("run: an unknown lone flag is still refused", res.status === 400, `got ${res.status} ${json?.error}`);
}
{
  const { res, json } = await request("POST", "/dsh-glass-theme/ws/run", JSON.stringify({ cli: "tapd", args: ["workitem-type", "list"] }));
  check("run: workitem-type is runnable (status-map needs it)", res.status === 200, `got ${res.status} ${json?.error}`);
}
{
  const { res, json } = await request("POST", "/dsh-glass-theme/ws/run", "not json");
  check("run: non-JSON body refused", res.status === 400, `got ${res.status} ${json?.error}`);
}
{
  const big = JSON.stringify({ cli: "tapd", args: ["bug", "x".repeat(300 * 1024)] });
  const { res } = await request("POST", "/dsh-glass-theme/ws/run", big);
  check("run: oversized body refused", res.status === 413, `got ${res.status}`);
}

// 3. fence — a non-loopback peer is refused before anything runs
{
  const { res, json } = await request("GET", "/dsh-glass-theme/ws/status", undefined, "10.0.0.5");
  check("fence: non-loopback refused", res.status === 403, `got ${res.status} ${json?.error}`);
}

// 4. method guard
{
  const { res } = await request("GET", "/dsh-glass-theme/ws/run");
  check("run: GET refused with 405", res.status === 405, `got ${res.status}`);
}

// 5. missing CLI — a whitelisted run against an absent binary answers 503 with
//    an install hint rather than a raw spawn error
{
  const { res, json } = await request("POST", "/dsh-glass-theme/ws/run", JSON.stringify({ cli: "tapd", args: ["bug", "list"] }));
  if (res.status === 503) {
    check("run: missing CLI answered with hint", typeof json?.error === "string" && json.error.includes("not installed"), json?.error);
  } else if (res.status === 200) {
    // tapd IS installed on this machine — then a real run happened; accept it
    check("run: tapd present, command executed", json?.ok === true && typeof json?.exitCode === "number");
  } else {
    check("run: missing CLI answered with hint", false, `got ${res.status} ${json?.error}`);
  }
}

// 6. install route — validation surface only (the happy path performs real
//    network installs and is exercised manually, never here)
{
  const { res, json } = await request("POST", "/dsh-glass-theme/ws/install", JSON.stringify({ cli: "curl" }));
  check("install: unknown cli refused", res.status === 400, `got ${res.status} ${json?.error}`);
}
{
  const { res } = await request("POST", "/dsh-glass-theme/ws/install", "{}");
  check("install: missing cli refused", res.status === 400, `got ${res.status}`);
}
{
  const { res } = await request("GET", "/dsh-glass-theme/ws/install");
  check("install: GET refused with 405", res.status === 405, `got ${res.status}`);
}
{
  const { res, json } = await request("POST", "/dsh-glass-theme/ws/install", undefined, "10.0.0.5");
  check("install: non-loopback refused", res.status === 403, `got ${res.status} ${json?.error}`);
}

// 7. config regression — with a Cordis-style throwing `config` getter the
//    status probe must still answer 200 (see the note above the ctx mock)
{
  const { res, json } = await request("GET", "/dsh-glass-theme/ws/status");
  check("status: survives throwing ctx.config getter", res.status === 200 && json?.ok === true, `got ${res.status} ${json?.error}`);
  check("status: reports install hints", typeof json?.clis?.tapd?.installHint === "string", json?.clis?.tapd?.installHint);
}

// 8. checksums.txt parsing — upstream ships plain `sha256sum` output, so the
//    old `^sha256:` regex rejected every real install with "line is missing
//    sha256". The parser must accept all three published dialects and treat
//    malformed lines as "no match" rather than throwing.
{
  const sha = "1690dc4bef5d71ca7428221175493fd49b16b2ccdc901401a3fddd6e749024e7";
  const asset = "tapd_1.0.0_windows_amd64.zip";

  const gnu = parseChecksums(`${sha}  ${asset}\n`);
  check(
    "checksums: sha256sum format",
    gnu.length === 1 && gnu[0].hash === sha && gnu[0].name === asset,
    JSON.stringify(gnu),
  );

  const prefixed = parseChecksums(`sha256:${sha}  ${asset}`);
  check(
    "checksums: sha256: prefixed format",
    prefixed.length === 1 && prefixed[0].hash === sha && prefixed[0].name === asset,
    JSON.stringify(prefixed),
  );

  const bsd = parseChecksums(`SHA256 (${asset}) = ${sha}`);
  check(
    "checksums: BSD format",
    bsd.length === 1 && bsd[0].hash === sha && bsd[0].name === asset,
    JSON.stringify(bsd),
  );

  const mixed = parseChecksums(
    [`${sha}  ${asset}`, `sha256:${sha} *${asset}`, `SHA256 (${asset}) = ${sha}`, "# comment", ""].join("\r\n"),
  );
  check(
    "checksums: target asset resolvable",
    mixed.find((entry) => entry.name === asset)?.hash === sha,
    JSON.stringify(mixed),
  );

  const binary = parseChecksums(`${sha} *./${asset}\r\n`);
  check(
    "checksums: binary marker and ./ prefix stripped",
    binary.length === 1 && binary[0].name === asset,
    JSON.stringify(binary),
  );

  const malformed = parseChecksums(
    [
      `${sha.slice(0, 60)}  short.zip`, // 60 hex digits, not 64
      `${"g".repeat(64)}  nonhex.zip`, // 64 chars but not hex
      `${sha}`, // a hash without a file name
      "not a checksum line",
    ].join("\r\n"),
  );
  check("checksums: malformed lines ignored", malformed.length === 0, JSON.stringify(malformed));
  check(
    "checksums: garbage input does not throw",
    Array.isArray(parseChecksums("")) && parseChecksums(undefined).length === 0,
  );
}

// 9. Windows npm launch — `spawn("npm.cmd", …, { shell: false })` throws EINVAL
//    synchronously on Node 24, so the install route launches npm-cli.js with
//    the current Node binary instead of the .cmd shim.
if (process.platform === "win32") {
  const npmCmd = join(dirname(process.execPath), "npm.cmd");
  if (existsSync(npmCmd)) {
    const plan = launchPlan(npmCmd, ["--version"]);
    check(
      "launch: npm.cmd planned through node + npm-cli.js",
      plan.command === process.execPath &&
        /node_modules[\\/]npm[\\/]bin[\\/]npm-cli\.js$/i.test(plan.args[0]) &&
        plan.args[1] === "--version" &&
        plan.verbatim === false,
      JSON.stringify(plan),
    );

    const probe = await new Promise((resolve) => {
      let out = "";
      let err = "";
      let child;
      try {
        child = spawn(plan.command, plan.args, {
          shell: false,
          windowsHide: true,
          windowsVerbatimArguments: plan.verbatim,
        });
      } catch (error) {
        resolve({ code: -1, out, err: `${error?.code ?? ""} ${error?.message ?? error}` });
        return;
      }
      child.stdout.on("data", (chunk) => (out += chunk));
      child.stderr.on("data", (chunk) => (err += chunk));
      child.on("error", (error) => resolve({ code: -1, out, err: `${error?.code ?? ""} ${error?.message ?? error}` }));
      child.on("close", (code) => resolve({ code, out, err }));
    });
    check(
      "launch: npm --version runs without EINVAL",
      probe.code === 0 && /\d+\.\d+\.\d+/.test(probe.out),
      JSON.stringify(probe),
    );
  }
}

// 9b. Any other npm shim (wecom-cli.cmd…) must run through the JS entry the
//     shim wraps, not through `cmd.exe /c`: searching documents with a `%` or
//     a quote in the query used to be refused outright by the quoting guard.
if (process.platform === "win32") {
  const dir = join(tmpdir(), `lgws-shim-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const entry = join(dir, "cli.js");
  writeFileSync(entry, "process.stdout.write(JSON.stringify(process.argv.slice(2)));");
  const shim = join(dir, "tool.cmd");
  writeFileSync(
    shim,
    [
      "@ECHO off",
      "GOTO start",
      ":find_dp0",
      "SET dp0=%~dp0",
      "EXIT /b",
      ":start",
      "SETLOCAL",
      "CALL :find_dp0",
      '\"%_prog%\" \"%dp0%\\cli.js\" %*',
    ].join("\r\n"),
  );

  const tricky = ['doc', 'search', '覆盖率 100% "引号" & echo pwned'];
  const plan = launchPlan(shim, tricky);
  check(
    "launch: npm shim resolved to its js entry",
    plan.command === process.execPath && plan.args[0] === entry && plan.args.length === 1 + tricky.length,
    JSON.stringify(plan),
  );
  check(
    "launch: unsafe args pass through to the js entry verbatim",
    plan.args.slice(1).join("\u0000") === tricky.join("\u0000"),
    JSON.stringify(plan.args),
  );

  const probe = await new Promise((resolve) => {
    let out = "";
    const child = spawn(plan.command, plan.args, { shell: false, windowsHide: true });
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("error", (error) => resolve({ code: -1, out: String(error?.message ?? error) }));
    child.on("close", (code) => resolve({ code, out }));
  });
  check("launch: shim args arrive unchanged in the child", probe.code === 0 && JSON.parse(probe.out).length === 3, JSON.stringify(probe));

  const bare = join(dir, "bare.cmd");
  writeFileSync(bare, "@echo off\r\necho hi\r\n");
  let message = "";
  try {
    launchPlan(bare, ['a"b']);
  } catch (error) {
    message = String(error?.message ?? error);
  }
  check(
    "launch: shim without a js entry refuses unsafe args with a readable message",
    message !== "" && !message.includes("cmd.exe fallback") && message.includes("JS 入口"),
    message,
  );

  // 9c. The interpreter is a parameter, not `process.execPath` baked in. Inside
  //     the desktop host `process.execPath` is `DeepSeek Harness.exe` — an
  //     Electron GUI binary with no console, so the CLI's own
  //     `execFileSync(binary, args, { stdio: 'inherit' })` child made Windows
  //     allocate a visible console (the Windows Terminal window that flashed on
  //     every workspace refresh). node.exe under windowsHide is a console
  //     program and gives the child a hidden console to inherit.
  const electronish = join(dir, "DeepSeek Harness.exe");
  const shimPlan = launchPlan(shim, ["todo", "list"], electronish);
  check(
    "launch: the interpreter is whatever the host resolved, not the app binary",
    shimPlan.command === electronish && shimPlan.args[0] === entry,
    JSON.stringify(shimPlan),
  );
  const noNodePlan = launchPlan(shim, ["todo", "list"], null);
  check(
    "launch: without a node interpreter the shim goes through hidden cmd.exe",
    noNodePlan.command === (process.env.ComSpec || "cmd.exe") &&
      noNodePlan.verbatim === true &&
      noNodePlan.args.slice(0, 3).join(" ") === "/d /s /c",
    JSON.stringify(noNodePlan),
  );
  rmSync(dir, { recursive: true, force: true });
}

// 10. sendJson is idempotent — a response that already ended must be a no-op,
//     not a `writeHead` throw inside a route's catch (which used to become an
//     unhandled rejection and kill the host).
{
  const res = makeRes();
  res.writableEnded = true;
  res.writeHead = () => {
    throw Object.assign(new Error("write after end"), { code: "ERR_STREAM_WRITE_AFTER_END" });
  };
  const req = newEventRequest("POST", "/dsh-glass-theme/ws/install");
  let syncThrow = null;
  try {
    routes.get("/dsh-glass-theme/ws/install").handler(req, res);
  } catch (error) {
    syncThrow = error;
  }
  await sleep(5);
  req.emit("data", Buffer.from(JSON.stringify({ cli: "curl" })));
  req.emit("end");
  await sleep(100);
  check(
    "sendJson: finished response is not written twice",
    syncThrow === null && res.body === null && res.status === 0,
    JSON.stringify({ syncThrow: String(syncThrow), status: res.status, body: res.body }),
  );
}

// 11. client abort mid-install — the request is cancelled before the handler
//     reaches the network, so no response is attempted and nothing rejects.
{
  const before = unhandled.length;
  const res = makeRes();
  res.destroyed = true;
  res.writeHead = () => {
    throw Object.assign(new Error("write after end"), { code: "ERR_STREAM_WRITE_AFTER_END" });
  };
  const req = newEventRequest("POST", "/dsh-glass-theme/ws/install");
  routes.get("/dsh-glass-theme/ws/install").handler(req, res);
  await sleep(5);
  req.emit("data", Buffer.from(JSON.stringify({ cli: "tapd" })));
  req.emit("aborted");
  req.emit("close");
  await sleep(200);
  check("install: aborted client writes no response", res.body === null && res.status === 0);
  check(
    "install: aborted client causes no unhandled rejection",
    unhandled.length === before,
    String(unhandled.at(-1)?.message ?? unhandled.at(-1)),
  );
}

// 12. install failure after the client is gone — the catch block must not try
//     to write to a destroyed response (the reported crash path).
{
  const before = unhandled.length;
  const savedPath = process.env.PATH;
  const res = makeRes();
  res.destroyed = true;
  res.writeHead = () => {
    throw Object.assign(new Error("write after end"), { code: "ERR_STREAM_WRITE_AFTER_END" });
  };
  const req = newEventRequest("POST", "/dsh-glass-theme/ws/install");
  try {
    process.env.PATH = ""; // force `npm` resolution to miss, so installWecom throws
    routes.get("/dsh-glass-theme/ws/install").handler(req, res);
    await sleep(5);
    req.emit("data", Buffer.from(JSON.stringify({ cli: "wecom" })));
    req.emit("end");
    await sleep(1500);
  } finally {
    process.env.PATH = savedPath;
  }
  check("install: failed install on a destroyed client writes nothing", res.body === null && res.status === 0);
  check(
    "install: failed install on a destroyed client causes no unhandled rejection",
    unhandled.length === before,
    String(unhandled.at(-1)?.message ?? unhandled.at(-1)),
  );
}

// 13. login routes — all three sit behind the same method + fence guards.
{
  const { res } = await request("GET", "/dsh-glass-theme/ws/login");
  check("login: GET refused with 405", res.status === 405, `got ${res.status}`);
}
{
  const { res, json } = await request(
    "POST",
    "/dsh-glass-theme/ws/login",
    JSON.stringify({ cli: "tapd" }),
    "10.0.0.5",
  );
  check("login: non-loopback refused", res.status === 403, `got ${res.status} ${json?.error}`);
}
{
  const { res, json } = await request("POST", "/dsh-glass-theme/ws/login", JSON.stringify({ cli: "curl" }));
  check("login: unknown cli refused", res.status === 400, `got ${res.status} ${json?.error}`);
}
{
  const { res, json } = await request("POST", "/dsh-glass-theme/ws/login", "not json");
  check("login: non-JSON body refused", res.status === 400, `got ${res.status} ${json?.error}`);
}
{
  // HTTP 200 (not an error status): the panel renders the token input from it.
  const { res, json } = await request("POST", "/dsh-glass-theme/ws/login", JSON.stringify({ cli: "tapd", token: "   " }));
  check(
    "login: tapd without token asks for one",
    res.status === 200 && json?.ok === false && json?.needsToken === true && json?.method === "token",
    `got ${res.status} ${JSON.stringify(json)}`,
  );
  check(
    "login: the prompt names both credential kinds",
    typeof json?.message === "string" && json.message.includes("API") && json.message.includes("Token"),
    json?.message,
  );
}
{
  // The other TAPD credential pair (公司管理 → 开放集成 → API 账号) must reach
  // the CLI too — access tokens expire every two hours, API 账号/口令 do not.
  // This machine has no real tapd here, so the route reports the spawn
  // outcome instead of the argv; the argv itself is covered below.
  const { res, json } = await request(
    "POST",
    "/dsh-glass-theme/ws/login",
    JSON.stringify({ cli: "tapd", token: "", apiUser: "api_user", apiPassword: "api_password" }),
  );
  check(
    "login: tapd API 账号/口令 is accepted instead of a token",
    res.status === 200 && json?.ok === false && json?.needsToken !== true && json?.method === "password",
    `got ${res.status} ${JSON.stringify(json)}`,
  );
}
{
  // The expected state depends on what THIS machine has, so the check stays
  // green when the developer already has TAPD credentials configured.
  const envToken = process.env.TAPD_ACCESS_TOKEN;
  const hasCredentials =
    (typeof envToken === "string" && envToken.trim() !== "") || existsSync(join(homedir(), ".tapd.json"));
  const expected = hasCredentials ? "authorized" : "unauthorized";
  const { res, json } = await request("GET", "/dsh-glass-theme/ws/login-state?cli=tapd");
  check(
    "login-state: tapd reports its auth state",
    res.status === 200 && json?.ok === true && json?.cli === "tapd" && json?.state === expected,
    `got ${res.status} ${JSON.stringify(json)}, expected ${expected}`,
  );
  check(
    "login-state: tapd log is empty",
    Array.isArray(json?.log) && json.log.length === 0,
    JSON.stringify(json?.log),
  );
}
{
  const { res } = await request("GET", "/dsh-glass-theme/ws/login-state?cli=nope");
  check("login-state: unknown cli refused", res.status === 400, `got ${res.status}`);
}
{
  // TAPD needs a workspace id on top of the credentials. Both halves of that
  // answer live on the login route; with no CLI installed they must degrade to
  // a JSON failure instead of a 500 (or a crash).
  const { res, json } = await request(
    "POST",
    "/dsh-glass-theme/ws/login",
    JSON.stringify({ cli: "tapd", action: "list-workspaces" }),
  );
  check(
    "login: tapd workspace list degrades without the CLI",
    res.status === 200 && json?.cli === "tapd" && Array.isArray(json?.workspaces),
    `got ${res.status} ${JSON.stringify(json)}`,
  );
}
{
  // Deliberately not driven through the route: a real `tapd` on PATH would
  // write `workspace_id` into ~/.tapd.json as a side effect of the test.
  const source = readFileSync(new URL("../src/host/workspace.js", import.meta.url), "utf8");
  check(
    "login: tapd workspace switch is wired to `workspace switch <id>`",
    /switchTapdWorkspace\(resolved, workspaceId\)/.test(source) &&
      /\["workspace", "switch", workspaceId\]/.test(source),
  );
  check(
    "login: tapd reports a missing workspace instead of a bare 已登录",
    /workspace:\s*authorized\s*\n?\s*\?\s*\{\s*state:\s*workspaceId === "" \? "missing" : "configured"/.test(source) &&
      /tapdWorkspaceAssist\(resolved, \{ auto: true \}\)/.test(source),
  );
}
{
  // No login has been started in this process, so there is no image to serve.
  try {
    rmSync(wecomLoginQrFile(), { force: true });
  } catch {
    /* nothing to remove */
  }
  const { res, json } = await request("GET", "/dsh-glass-theme/ws/login-qr?cli=wecom");
  check(
    "login-qr: missing image answers 404",
    res.status === 404 && json?.ok === false && json?.error === "no qr yet",
    `got ${res.status} ${JSON.stringify(json)}`,
  );
}
{
  const { res } = await request("GET", "/dsh-glass-theme/ws/login-qr?cli=tapd");
  check("login-qr: non-wecom cli refused", res.status === 400, `got ${res.status}`);
}
{
  // Serve the image once the login child has written it — hand-written here
  // (a PNG signature is all the route looks at) so no real CLI is needed.
  const file = wecomLoginQrFile();
  try {
    writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const { res } = await request("GET", "/dsh-glass-theme/ws/login-qr?cli=wecom");
    check(
      "login-qr: serves the image with a no-store header",
      res.status === 200 && res.headers?.["content-type"] === "image/png" && res.headers?.["cache-control"] === "no-store",
      JSON.stringify({ status: res.status, headers: res.headers }),
    );
  } finally {
    rmSync(file, { force: true });
  }
}

// 14. a login child that cannot start must be recorded as failed and must not
//     reject on `error` — the "wecom install took the whole host down" crash
//     this section exists to prevent. No real CLI is involved.
{
  const before = unhandled.length;
  const record = {
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
  startLoginChild(record, join(tmpdir(), "dsh-glass-theme-no-such-login-binary"), ["auth", "init"]);
  await sleep(500);
  check(
    "login: spawn failure recorded as failed",
    record.state === "failed" && typeof record.message === "string" && record.message !== "" && record.child === null,
    JSON.stringify({ state: record.state, message: record.message }),
  );
  check(
    "login: spawn failure causes no unhandled rejection",
    unhandled.length === before,
    String(unhandled.at(-1)?.message ?? unhandled.at(-1)),
  );
}

{
  // The token page the panel links to must be openable; everything else is
  // refused before any process is spawned.
  check(
    "open-url: the TAPD token page is allow-listed",
    validateExternalUrl("https://www.tapd.cn/personal_settings/index?tab=personal_token") === null,
  );
  const refused = [
    ["http://www.tapd.cn/personal_settings", "plain http"],
    ["https://evil.example.com/personal_token", "foreign host"],
    ["https://www.tapd.cn.evil.example.com/x", "host suffix trick"],
    ["file:///C:/Windows/System32/calc.exe", "file scheme"],
    ["https://user:pw@www.tapd.cn/", "embedded credentials"],
    ["", "empty"],
    ["not a url", "relative"],
  ];
  for (const [url, label] of refused) {
    check(`open-url: refuses ${label}`, typeof validateExternalUrl(url) === "string", `${url} was accepted`);
  }
  const { res, json } = await request(
    "POST",
    "/dsh-glass-theme/ws/open-url",
    JSON.stringify({ url: "https://evil.example.com/x" }),
  );
  check(
    "open-url: route answers 400 for a foreign host",
    res.status === 400 && json?.ok === false && /allow-listed host/.test(String(json?.error)),
    `got ${res.status} ${JSON.stringify(json)}`,
  );
}

{
  // The image proxy feeds TAPD paths to the CLI, so the path is validated
  // before anything spawns; the refusal reasons must survive the wire.
  check(
    "image: a tfl capture path validates",
    validateImagePath("/tfl/captures/2026-10/tapd_1_base64_1_2.png") === null,
  );
  const refused = [
    ["", "empty"],
    ["tfl/captures/a.png", "not site-relative"],
    ["/tfl/../secrets", "traversal"],
    ["/tfl/a b.png", "space"],
    ["/tfl/a.png?x=1", "query smuggled in"],
    [`/${"a".repeat(600)}`, "too long"],
  ];
  for (const [path, label] of refused) {
    check(`image: refuses ${label}`, typeof validateImagePath(path) === "string", `${path} was accepted`);
  }
  {
    const { res } = await request("POST", "/dsh-glass-theme/ws/image?path=%2Ftfl%2Fa.png", JSON.stringify({}));
    check("image: route answers 405 for POST", res.status === 405, `got ${res.status}`);
  }
  {
    const { res, json } = await request("GET", "/dsh-glass-theme/ws/image?path=%2Ftfl%2F..%2Fx.png");
    check(
      "image: route answers 400 for a traversal path",
      res.status === 400 && json?.ok === false && /\.\./.test(String(json?.error)),
      `got ${res.status} ${JSON.stringify(json)}`,
    );
  }
  {
    const { res, json } = await request("GET", "/dsh-glass-theme/ws/image");
    check(
      "image: route answers 400 when path is missing",
      res.status === 400 && json?.ok === false,
      `got ${res.status} ${JSON.stringify(json)}`,
    );
  }
}

// 14b. The child must never inherit a piped stdin that nobody ends. `tapd bug
//      update` (and every other write command) reads stdin; with the default
//      `spawn` stdio the pipe stays open, the CLI blocks, the 25 s timeout
//      kills it and the panel reports "退出码 1" with empty output. Measured on
//      tapd 1.0.0: 0.5 s with stdin ignored, never returns with a pipe.
if (process.platform === "win32") {
  const dir = join(tmpdir(), `lgws-stdin-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const entry = join(dir, "wait-for-eof.js");
  // A CLI that behaves like a write command: it only answers after stdin ends.
  writeFileSync(
    entry,
    "let seen = '';\nprocess.stdin.setEncoding('utf8');\nprocess.stdin.on('data', (c) => (seen += c));\nprocess.stdin.on('end', () => process.stdout.write(JSON.stringify({ ok: true, seen })));\n",
  );
  const shim = join(dir, "write-cli.cmd");
  writeFileSync(
    shim,
    ["@ECHO off", "GOTO start", ":find_dp0", "SET dp0=%~dp0", "EXIT /b", ":start", "SETLOCAL", "CALL :find_dp0", '\"%_prog%\" \"%dp0%\\wait-for-eof.js\" %*'].join("\r\n"),
  );

  const stdinRoutes = new Map();
  const stdinServer = {
    register(route) {
      stdinRoutes.set(route.path, route);
      return () => stdinRoutes.delete(route.path);
    },
  };
  let disposeStdin = null;
  registerWorkspaceRoutes(ctx, { effect(fn) { disposeStdin = fn(); }, webServer: stdinServer }, { tapdCommand: shim, wecomCommand: "" });

  const stdinRequest = async (method, path, body) => {
    const req = newEventRequest(method, path);
    const res = makeRes();
    const settled = new Promise((resolve) => {
      res.finished = resolve;
    });
    stdinRoutes.get(path).handler(req, res);
    if (body !== undefined) {
      const buffer = Buffer.from(body);
      await new Promise((resolve) => setImmediate(resolve));
      req.emit("data", buffer);
      req.emit("end");
    }
    const guard = setTimeout(() => (res.finished = null, settled), 20_000);
    await settled;
    clearTimeout(guard);
    let json = null;
    try {
      json = res.body === "" ? null : JSON.parse(res.body);
    } catch {
      json = null;
    }
    return { res, json };
  };

  const started = Date.now();
  const { res, json } = await stdinRequest("POST", "/dsh-glass-theme/ws/run", JSON.stringify({ cli: "tapd", args: ["help"] }));
  const elapsed = Date.now() - started;
  check(
    "run: stdin is closed for the child (write commands must not block)",
    res.status === 200 && json?.timedOut === false && json?.stdout?.value?.ok === true,
    `${res.status} ${JSON.stringify({ timedOut: json?.timedOut, exitCode: json?.exitCode, stdout: json?.stdout })}`,
  );
  check("run: a stdin-reading child answers promptly", elapsed < 5000, `${elapsed} ms`);
  if (typeof disposeStdin === "function") disposeStdin();
}

// 14c. Switching a TAPD project must be verified, not trusted. The CLI answers
//      `{"success":true}` for any workspace id, including one the token cannot
//      read, and writes it into ~/.tapd.json — after which every command fails
//      "Personal token company does not match workspace". The route therefore
//      re-reads `workspace info` and rolls back. Regression this guards: the
//      timeout constant for that verification was referenced but never declared
//      (`TAPD_LOGIN_STATUS_TIMEOUT_MS`), the ReferenceError was swallowed by the
//      parse guard, `landed` stayed empty and every switch reported "未成功".
if (process.platform === "win32") {
  const dir = join(tmpdir(), `lgws-switch-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const landedFile = join(dir, "landed.txt");

  const writeFakeTapd = (name, infoId) => {
    const script = join(dir, `${name}.js`);
    writeFileSync(
      script,
      [
        "const fs = require('node:fs');",
        `const landed = ${JSON.stringify(landedFile)};`,
        "const a = process.argv.slice(2);",
        "if (a[0] === 'workspace' && a[1] === 'switch') {",
        "  if (a[2]) fs.writeFileSync(landed, a[2]);",
        "  process.stdout.write(JSON.stringify({ success: true, workspace_id: a[2] || '' }));",
        "} else if (a[0] === 'workspace' && a[1] === 'info') {",
        `  const id = ${JSON.stringify(infoId)};`,
        "  process.stdout.write(JSON.stringify({ id: id === null ? (fs.existsSync(landed) ? fs.readFileSync(landed, 'utf8') : '') : id }));",
        "} else {",
        "  process.stdout.write(JSON.stringify({ ok: true }));",
        "}",
      ].join("\n"),
    );
    const shim = join(dir, `${name}.cmd`);
    writeFileSync(
      shim,
      ["@ECHO off", "GOTO start", ":find_dp0", "SET dp0=%~dp0", "EXIT /b", ":start", "SETLOCAL", "CALL :find_dp0", `\"%_prog%\" \"%dp0%\\${name}.js\" %*`].join("\r\n"),
    );
    return shim;
  };

  const switchRequest = async (routesMap, body) => {
    const req = newEventRequest("POST", "/dsh-glass-theme/ws/login");
    const res = makeRes();
    const settled = new Promise((resolve) => {
      res.finished = resolve;
    });
    routesMap.get("/dsh-glass-theme/ws/login").handler(req, res);
    const buffer = Buffer.from(body);
    await new Promise((resolve) => setImmediate(resolve));
    req.emit("data", buffer);
    req.emit("end");
    const guard = setTimeout(() => (res.finished = null, settled), 20_000);
    await settled;
    clearTimeout(guard);
    let json = null;
    try {
      json = res.body === "" ? null : JSON.parse(res.body);
    } catch {
      json = null;
    }
    return { res, json };
  };

  const withCli = async (command, run) => {
    const map = new Map();
    const cliServer = {
      register(route) {
        map.set(route.path, route);
        return () => map.delete(route.path);
      },
    };
    let dispose = null;
    registerWorkspaceRoutes(ctx, { effect(fn) { dispose = fn(); }, webServer: cliServer }, { tapdCommand: command, wecomCommand: "" });
    try {
      return await run(map);
    } finally {
      if (typeof dispose === "function") dispose();
    }
  };

  const good = await withCli(writeFakeTapd("fake-tapd-good", null), (map) =>
    switchRequest(map, JSON.stringify({ cli: "tapd", workspaceId: "45368483" })),
  );
  check(
    "login: switching a project is confirmed by workspace info",
    good.json?.ok === true && good.json?.state === "authorized",
    JSON.stringify(good.json)?.slice(0, 240),
  );

  const bad = await withCli(writeFakeTapd("fake-tapd-bad", "99999999"), (map) =>
    switchRequest(map, JSON.stringify({ cli: "tapd", workspaceId: "45368483" })),
  );
  check(
    "login: a switch that did not land reports failure",
    bad.json?.ok === false && /未成功/.test(String(bad.json?.message ?? "")),
    JSON.stringify(bad.json)?.slice(0, 240),
  );

  rmSync(dir, { recursive: true, force: true });
}

// 15. nothing above (or anything the routes left running) may reject unhandled
await sleep(250);
check(
  "suite: no unhandled rejections",
  unhandled.length === 0,
  `${unhandled.length} rejection(s): ${String(unhandled[0]?.message ?? unhandled[0])}`,
);

if (typeof disposeWorkspace === "function") disposeWorkspace();
check("routes: disposers returned", routes.size === 0, `remaining ${routes.size}`);

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("all workspace-route checks pass");
