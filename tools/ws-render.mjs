// First-render smoke test for the 工作空间 panel: loads src/workspace.js with a
// minimal React hooks shim, renders the panel, runs mount effects against a
// stubbed fetch, flushes microtasks, then re-renders with the updated state.
// A crash here is exactly what blanks the main area in the real app (no error
// boundary around slot content).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'src', 'workspace.js'), 'utf8');
const factory = new Function(`${src}\nreturn createWorkspace;`)();

/* ---- minimal React: element objects + ordered hooks, no scheduling ---- */
let hookIndex = 0;
let hooks = [];
function resetHooks(keep = false) {
	if (!keep) hooks = [];
	hookIndex = 0;
}
const React = {
	createElement(type, props, ...children) {
		return { type, props: { ...(props || {}), children } };
	},
	/* Class components (WorkspaceErrorBoundary) need a real base class. */
	Component: class {
		constructor(props) {
			this.props = props || {};
			this.state = this.state || null;
		}
		setState(partial) {
			this.state = { ...(this.state || {}), ...(typeof partial === 'function' ? partial(this.state || {}) : partial) };
		}
	},
	useState(init) {
		const i = hookIndex++;
		if (!(i in hooks)) hooks[i] = { v: typeof init === 'function' ? init() : init };
		return [hooks[i].v, (v) => { hooks[i].v = typeof v === 'function' ? v(hooks[i].v) : v; }];
	},
	useEffect(fn) { const i = hookIndex++; if (!(i in hooks)) hooks[i] = { effect: fn }; },
	useLayoutEffect(fn) { const i = hookIndex++; if (!(i in hooks)) hooks[i] = { layout: fn }; },
	useRef(init) { const i = hookIndex++; if (!(i in hooks)) hooks[i] = { current: init }; return hooks[i]; },
	useCallback(fn) { const i = hookIndex++; if (!(i in hooks)) hooks[i] = { cb: fn }; return hooks[i].cb; },
	useMemo(fn) { const i = hookIndex++; hooks[i] = { v: fn() }; return hooks[i].v; },
};

/* ---- browser globals the panel touches at mount ---- */
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.AbortSignal = { timeout: () => ({}) };
globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };
const fetchLog = [];
globalThis.fetch = (url, options) => {
	fetchLog.push(String(url));
	const body = {
		ok: true,
		json: async () => {
			const u = String(url);
			if (u.endsWith('/ws/status')) {
				return { ok: true, clis: {
					tapd: { command: 'tapd', available: false, detail: 'not found', installHint: 'GitHub Releases' },
					wecom: { command: 'wecom-cli', available: false, detail: 'not found', installHint: 'npm i -g @wecom/cli' },
				} };
			}
			return { ok: true, exitCode: 0, timedOut: false, durationMs: 3, stdout: { json: true, value: [] }, stderr: '' };
		},
	};
	return Promise.resolve(body);
};

const ctx = { get: () => { throw new Error('no service'); } };
const mod = factory((name) => (name === 'react' ? React : null), ctx, null);

let failures = 0;
const check = async (name, fn) => {
	try {
		await fn();
		console.log(`ok   ${name}`);
	} catch (error) {
		failures += 1;
		console.error(`FAIL ${name}: ${error && error.stack ? error.stack : error}`);
	}
};

await check('Icon renders an svg element tree', () => {
	resetHooks();
	const el = mod.Icon({});
	if (el.type !== 'svg') throw new Error(`root is ${String(el.type)}`);
});

await check('Panel first render (loading phase) survives', () => {
	resetHooks();
	const el = mod.Panel({});
	if (!el || typeof el.type !== 'function') throw new Error(`guarded root is ${String(el && el.type)}`);
	if (String(el.type.name || '') !== 'WorkspaceErrorBoundary') {
		throw new Error(`guarded root is ${el.type.name || '(anon)'}, expected WorkspaceErrorBoundary`);
	}
});

await check('Panel mount effects + state flush + second render survive', async () => {
	resetHooks();
	mod.RawPanel({});
	for (const h of hooks) { if (h.layout) h.layout(); }
	for (const h of hooks) { if (h.effect) h.effect(); }
	await new Promise((r) => setTimeout(r, 20)); // let fetch stubs resolve + setStates run
	resetHooks(true); // keep updated hook values, replay with them
	mod.RawPanel({});
	for (const h of hooks) { if (h.layout) h.layout(); }
	for (const h of hooks) { if (h.effect) h.effect(); }
	await new Promise((r) => setTimeout(r, 20));
});

await check('rows open the in-page detail instead of the browser', () => {
	// A row is a door: it carries exactly one action, and that action is the
	// in-page inspector. Every browser handoff lives inside the detail.
	const rowOpen = (src.match(/onClick: \(\) => onOpen\(item\)/g) ?? []).length;
	if (rowOpen !== 2) throw new Error(`expected the row body and its 查看详情 button to open the detail, found ${rowOpen}`);
	if (!/function SpaceRow\(\{ item, statusLabel, selected, onOpen \}\)/.test(src)) {
		throw new Error('no SpaceRow component');
	}
	if (!/h\(SpaceRow, \{/.test(src)) throw new Error('rows never mount SpaceRow');
	if (!/onClick: \(\) => void openCase\(selectedItem\)/.test(src)) {
		throw new Error('the inspector does not offer 在此开会话');
	}
});

await check('tapd workspace picker keeps the login row visible', () => {
	// Once the credentials are in, tapd still needs a project id; the row must
	// stay on screen (as a picker) instead of folding away and leaving every
	// list call broken with `workspace_required`.
	if (!/entry\.auth\?\.workspace\?\.state === 'missing'/.test(src)) {
		throw new Error('authRowVisible does not account for a missing TAPD workspace');
	}
	if (!/lgws-wsSelect/.test(src)) throw new Error('no workspace <select> in the auth row');
	if (!/action: 'list-workspaces'/.test(src)) throw new Error('the client never asks for the project list');
});

await check('a refused CLI run explains itself instead of printing an exit code', () => {
	// `wecom-cli doc search` prints {errcode, errmsg, help_message} on stdout with
	// exit 1, and the host parses that into an object — so the string-only check
	// saw "no output" and the reason vanished into 退出码 1.
	if (!/run\.exitCode !== 0\) \{[\s\S]{0,200}cliFailureHint\(/.test(src)) {
		throw new Error('attempt() decides failure without reading the parsed envelope');
	}
	if (!/命令行：\$\{consoleResult\.command\}/.test(src)) {
		throw new Error('the console fallback does not show the command it ran');
	}
});

await check('focus cards navigate instead of swallowing the click', () => {
	// Four large buttons with a hover state and an empty handler read as broken.
	const targets = (src.match(/target: '(overview|bugs|stories|docs)'/g) ?? []).length;
	if (targets !== 4) throw new Error(`expected four focus cards with a destination, found ${targets}`);
	if (!/setTab\(card\.target\)/.test(src)) throw new Error('focus cards do not switch tabs');
	if (!/count: counts\.(bugs|stories|wecom|attention)/.test(src)) throw new Error('focus cards lost their counts');
});

await check('the project spaces are switchable from the rail and from the toolbar', () => {
	// The banner folds away once a project is configured, so a picker that only
	// lived there disappeared exactly when switching became interesting.
	if (!/className: 'lgwsp-space-rail'/.test(src)) throw new Error('no project rail');
	if (!/className: 'lgwsp-project-trigger'/.test(src)) throw new Error('no toolbar project control');
	if (!/id: 'projectTrigger'/.test(src)) throw new Error('the toolbar control has no stable id');
	if (!/void chooseTapdWorkspace\(id\)/.test(src)) throw new Error('picking a project does not switch');
	// One action, two surfaces: the rail and the menu both go through
	// selectSpace, so switching cannot behave differently depending on where
	// the user clicked.
	const viaSelect = (src.match(/onClick: \(\) => selectSpace\(item\.id\)/g) ?? []).length;
	if (viaSelect !== 2) throw new Error(`expected rail + menu to share selectSpace, found ${viaSelect}`);
});

await check('the project menu closes on Escape and on an outside click', () => {
	// A menu that only closes by picking something is a trap: Escape and a
	// click anywhere else must put the page back the way it was.
	if (!/document\.addEventListener\('keydown', onKey\)/.test(src)) throw new Error('Escape does not close the menu');
	if (!/document\.addEventListener\('pointerdown', onDown, true\)/.test(src)) {
		throw new Error('an outside click does not close the menu');
	}
	if (!/placeholder: '按名称或 ID 过滤'/.test(src)) throw new Error('the menu has no search field');
});

await check('workspace_required from a list call becomes the picker, not raw JSON', () => {
	// A logged-in tapd without a project id answers every list with
	// `{"error":"workspace_required", …}`. That is a setup step: the panel must
	// fold it into the workspace picker and keep the envelope off the screen.
	if (!/WORKSPACE_FAILURE_PATTERN/.test(src)) throw new Error('no workspace failure pattern');
	if (!/workspaceBlockedTapd =[\s\S]{0,200}workspaceFailure\(/.test(src)) {
		throw new Error('load() never inspects list errors for workspace_required');
	}
	if (!/workspace: \{ state: 'missing', id: '' \}/.test(src)) {
		throw new Error('load() does not lift workspace_required into auth.workspace');
	}
	if (!/data\.workspaceBlocked\?\.tapd === true/.test(src)) {
		throw new Error('the bug list renders even when the workspace is missing');
	}
	if (!/TAPD 项目未选择/.test(src)) throw new Error('no friendly note for a missing workspace');
});

await check('a logged-out tapd row offers the token page', () => {
	// First run: no token, no api user. The row must link to the personal
	// token page (and the host must be the one opening it — a sandboxed
	// webview turns window.open into a no-op).
	if (!src.includes("https://www.tapd.cn/personal_settings/index?tab=personal_token")) {
		throw new Error('the token page is not linked from the panel');
	}
	if (!src.includes("/dsh-glass-theme/ws/open-url")) throw new Error('no open-url route in the client');
	if (!/lgws-authLink/.test(src)) throw new Error('the token page is not a button');
	if (!/needsTapdToken\(cli\)/.test(src)) throw new Error('clicking 登录 with an empty token does not open the page');
	if (!/phase: 'needsToken'/.test(src)) throw new Error('the row never explains what to do after opening the page');
});

await check('row actions speak the CLI 1.0 command line', () => {
	// tapd 1.0 takes the work item id positionally and wants the workflow
	// lookup keyed by --system/--workitem-type-id; the pre-0.3.2 argv shapes
	// (`status-map <type>`, `update --id X`) fail with missing_parameter.
	if (!/--system=\$\{system\}/.test(src)) throw new Error('status-map lost --system');
	if (!/--workitem-type-id=\$\{typeId\}/.test(src)) throw new Error('status-map lost --workitem-type-id');
	if (!/\[type, 'update', String\(item\.id\), '--status'/.test(src)) throw new Error('status update is not positional');
	if (!/\[type, 'update', String\(item\.id\), '--owner'/.test(src)) throw new Error('owner update is not positional');
	if (src.includes("'--id'")) throw new Error('a stray --id crept back into an update call');
	if (!/tapdItemUrl\(workspaceId, kind, item\.id\)/.test(src)) throw new Error('rows never build a TAPD deep link');
	if (!/statusLabel\(item\.kind, item\.status\)/.test(src)) throw new Error('rows render raw status codes');
});

await check('owner fields are normalised before they reach the UI', () => {
	// `current_owner` arrives TAPD-shaped: "叶凯佳;刘运辉2;" — the trailing
	// separator used to survive into the row meta and into the 转派 prefill,
	// and the CLI wrote it back as the owner.
	if (!/function normOwner\(/.test(src)) throw new Error('no owner normaliser');
	if (!/owner: normOwner\(/.test(src)) throw new Error('mapped items bypass the owner normaliser');
	if ((src.match(/owner: normOwner\(/g) ?? []).length < 2) throw new Error('not every mapper normalises the owner');
	// Display normalisation must not reach the write path: TAPD stores multiple
	// owners as `甲;乙`, and sending `甲, 乙` makes it one owner with a comma.
	if (!/ownerRaw: rawOwner/.test(src)) throw new Error('the raw owner string is not kept for 转派');
	if (!/useState\(String\(item\.ownerRaw/.test(src)) throw new Error('转派 prefills the display form instead of what TAPD holds');
	if (!/names\.join\(';'\)/.test(src)) throw new Error('转派 does not put owners back in TAPD’s separator');
});

await check('status endpoint hit; run calls only when a CLI is available', () => {
	if (!fetchLog.some((u) => u.endsWith('/ws/status'))) throw new Error(`no status call: ${fetchLog.join(',')}`);
	// the stub reports both CLIs unavailable → demo mode → /ws/run must NOT be called
	if (fetchLog.some((u) => u.endsWith('/ws/run'))) throw new Error('run called despite unavailable CLIs');
});

await check('the workbench keeps the hooks its tests and screenshots drive', () => {
	// These attributes are how tools/ws-live-shots.mjs and ws-live.mjs reach a
	// state without guessing at class names; renaming one silently breaks the
	// only end-to-end proof the page has.
	if (!/'data-tab-id': entry\.id/.test(src)) throw new Error('segmented tabs lost data-tab-id');
	if (!/'data-tab-id': card\.target/.test(src)) throw new Error('focus cards lost data-tab-id');
	if (!/'data-sync-bugs': 'true'/.test(src)) throw new Error('the refresh button lost data-sync-bugs');
	if (!/id: 'refreshButton'/.test(src)) throw new Error('the top-bar reload lost its id');
});

await check('the embedded detail renders sanitized rich HTML, not raw TAPD HTML', () => {
	// TAPD bodies arrive as HTML or as the CLI's markdown conversion. They must
	// go through the whitelist sanitizer before dangerouslySetInnerHTML — raw
	// HTML put literal tags in the panel and scripts in the app's origin.
	if (!/const descriptionToRichHtml = \(value\)/.test(src)) throw new Error('no rich renderer entry');
	if (!/descriptionToRichHtml\(firstOf\(raw, \['description'/.test(src)) throw new Error('the description bypasses descriptionToRichHtml');
	if (!/dangerouslySetInnerHTML: \{ __html: descriptionHtml \}/.test(src)) throw new Error('the rich container is not fed the sanitized html');
	if (!/detailNote/.test(src)) throw new Error('the empty/loading description lost its note');
	if (!/priorityLabel\(selectedItem\.severity\)/.test(src)) throw new Error('priority codes reach the chip untranslated');
});

await check('overview never lists the same item twice', () => {
	if (!/attentionKeys/.test(src)) throw new Error('今日待办 does not exclude 需要关注 items');
	if (!/!attentionKeys\.has\(/.test(src)) throw new Error('the exclusion is not applied');
});

await check('secondary detail actions carry the class the stylesheet expects', () => {
	if (/lgwsp-detail-action secondary/.test(src)) throw new Error('a bare `secondary` class is dead CSS');
	if (!/lgwsp-detail-action lgwsp-secondary/.test(src)) throw new Error('secondary actions lost their style');
});

await check('a todo list never inherits the CLI default page size of ten', () => {
	const names = (re) => [...src.matchAll(re)].map((match) => match[1]);
	const bare = names(/attempt\('tapd', \['(bug|story|task)', 'todo'\]/g);
	if (bare.length > 0) throw new Error(`the ${bare[0]} list still asks the CLI for its default ten rows`);
	const paged = names(/todoAll\('tapd', '(bug|story|task)'/g);
	for (const kind of ['bug', 'story', 'task']) {
		if (!paged.includes(kind)) throw new Error(`the ${kind} list no longer goes through todoAll`);
	}
	if (!/const TODO_PAGE_SIZE = 100;/.test(src)) throw new Error('the page size went back to the CLI default');
	if (!/\[kind, 'todo', '--limit', String\(TODO_PAGE_SIZE\), '--page'/.test(src)) throw new Error('todoAll stopped passing --limit/--page');
	if (!/TODO_MAX_PAGES/.test(src)) throw new Error('a server ignoring --page would spin forever');
});

if (failures > 0) { console.error(`${failures} render check(s) failed`); process.exit(1); }
console.log('all workspace render checks pass');
