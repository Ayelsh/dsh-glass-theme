/**
 * 工作空间 — the Liquid Glass workbench panel.
 *
 * One page that answers "what needs me today" across the two CLIs this
 * machine's workflow lives in:
 *
 *   - tapd (studyzy/tapd-ai-cli): stories, tasks, bugs, workflow transitions,
 *     and the handlers they are assigned to;
 *   - wecom-cli (official @wecom/cli): todos and doc search.
 *
 * The panel never talks to a network service itself. Every CLI invocation goes
 * through this plugin's own host route (`/dsh-glass-theme/ws/run`), which
 * whitelists subcommands and spawns without a shell. When a CLI is missing the
 * panel stays fully usable against clearly-marked demo data, with the install
 * command one click away.
 *
 * Registration follows the host's own page idiom (the same one the WSL panel
 * uses): a `sidebar.panellist` entry selects a `main` slot keyed by the same
 * id, so the shell owns navigation and this module owns only the two
 * components it renders.
 *
 * Spliced into lib/client.js by tools/build.mjs; edit here, never there.
 */
function createWorkspace(require, ctx, catalog) {
	const React = require('react');
	const h = React.createElement;

	const PANEL_ID = 'lg-workspace';
	const PANEL_LABEL = '工作空间';
	const STATUS_PATH = '/dsh-glass-theme/ws/status';
	const RUN_PATH = '/dsh-glass-theme/ws/run';
	const INSTALL_PATH = '/dsh-glass-theme/ws/install';
	const LOGIN_PATH = '/dsh-glass-theme/ws/login';
	const LOGIN_STATE_PATH = '/dsh-glass-theme/ws/login-state';
	const LOGIN_QR_PATH = '/dsh-glass-theme/ws/login-qr';
	const OPEN_URL_PATH = '/dsh-glass-theme/ws/open-url';

	/* Where a TAPD personal access token is created. The panel links straight
	 * here instead of explaining, because the token page is the only place the
	 * user can act. */
	const TAPD_TOKEN_URL = 'https://www.tapd.cn/personal_settings/index?tab=personal_token';
	const TAPD_TOKEN_DOC_URL = 'https://open.tapd.cn/document/api-doc/API文档/授权凭证/用户态.html';

	const REFRESH_STALE_MS = 5 * 60 * 1000;
	/* Both CLIs authenticate out of band, so the panel always talks about
	 * "the two" in the same order: tapd (token) then wecom (QR). */
	const CLI_ORDER = ['tapd', 'wecom'];
	const LOGIN_POLL_MS = 2000;
	const LOGIN_DONE_HOLD_MS = 6000;

	/* ================================================================ *
	 * Host transport
	 * ================================================================ */

	async function callRun(cli, args, timeoutMs) {
		const response = await fetch(RUN_PATH, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify({ cli, args, timeoutMs }),
		});
		let payload = null;
		try {
			payload = await response.json();
		} catch (error) {
			throw new Error(`工作空间服务返回了无法解析的内容（HTTP ${response.status}）`);
		}
		if (!response.ok || payload.ok === false) {
			const failure = new Error(String(payload.error ?? `HTTP ${response.status}`));
			// The host names the executable it actually resolved; a shim that
			// could not be launched is then traceable from the message alone.
			if (typeof payload.resolved === 'string') failure.resolved = payload.resolved;
			throw failure;
		}
		return payload;
	}

	/**
	 * Send the browser to an allow-listed page (the TAPD token page, the WeCom
	 * admin console). The host owns the launch so a sandboxed webview — where
	 * `window.open` is a no-op — still behaves; when the route is unavailable
	 * (older host half) it falls back to `window.open`.
	 */
	async function openExternal(url) {
		try {
			const response = await fetch(OPEN_URL_PATH, {
				method: 'POST',
				headers: { 'content-type': 'application/json', accept: 'application/json' },
				body: JSON.stringify({ url }),
			});
			const payload = await response.json().catch(() => null);
			if (response.ok && payload?.opened === true) return true;
		} catch {
			/* fall through to window.open */
		}
		try {
			window.open(url, '_blank', 'noopener');
			return true;
		} catch {
			return false;
		}
	}

	async function callStatus() {
		const response = await fetch(STATUS_PATH, { headers: { accept: 'application/json' } });
		const payload = await response.json();
		if (!response.ok || payload.ok === false) {
			throw new Error(String(payload.error ?? `HTTP ${response.status}`));
		}
		return payload;
	}

	/**
	 * Managed one-click install. The host runs the whole procedure (npm or a
	 * checksum-verified GitHub download) — the client only names the CLI and
	 * renders the returned log lines.
	 */
	async function callInstall(cli) {
		/* Feature-detect: AbortSignal.timeout is baseline-2022; without it the
		 * install simply runs without a client-side deadline (the host route
		 * enforces its own 300s timeout either way). */
		const timeoutSignal =
			typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
				? AbortSignal.timeout(330_000)
				: undefined;
		const response = await fetch(INSTALL_PATH, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify({ cli }),
			signal: timeoutSignal,
		});
		let payload = null;
		try {
			payload = await response.json();
		} catch (error) {
			throw new Error(`安装请求失败（HTTP ${response.status}）`);
		}
		if (!response.ok || payload.ok === false) {
			const tail = Array.isArray(payload.log) && payload.log.length > 0 ? `（${payload.log[payload.log.length - 1]}）` : '';
			throw new Error(String(payload.error ?? `HTTP ${response.status}`) + tail);
		}
		return payload;
	}

	/**
	 * Start a login. The host never blocks on the interactive half: wecom
	 * answers immediately with a QR to poll, tapd either asks for an Access
	 * Token (`needsToken`) or reports the outcome of the attempt. Anything
	 * the route cannot answer for stays a plain object the caller can
	 * render, so a missing route degrades to text instead of a crash.
	 */
	async function callLogin(cli, credentials) {
		const body = { cli };
		const workspaceId = typeof credentials?.workspaceId === 'string' ? credentials.workspaceId.trim() : '';
		const token = typeof credentials?.token === 'string' ? credentials.token : '';
		const apiUser = typeof credentials?.apiUser === 'string' ? credentials.apiUser.trim() : '';
		const apiPassword = typeof credentials?.apiPassword === 'string' ? credentials.apiPassword : '';
		/* TAPD needs a project id on top of the credentials; the host answers
		 * both "which projects do I have" and "switch to this one" on the same
		 * route, so the panel never has to run the CLI itself. */
		if (workspaceId !== '') body.workspaceId = workspaceId;
		else if (credentials?.action === 'list-workspaces') body.action = 'list-workspaces';
		else if (token !== '') body.token = token;
		else if (apiUser !== '' && apiPassword !== '') {
			body.apiUser = apiUser;
			body.apiPassword = apiPassword;
		}
		const response = await fetch(LOGIN_PATH, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify(body),
		});
		let payload = null;
		try {
			payload = await response.json();
		} catch (error) {
			throw new Error(`登录请求失败（HTTP ${response.status}）`);
		}
		if (payload === null || typeof payload !== 'object') {
			throw new Error(`登录请求失败（HTTP ${response.status}）`);
		}
		return payload;
	}

	/** Poll one CLI's login state — wecom only, cheap and read-only. */
	async function callLoginState(cli) {
		const response = await fetch(`${LOGIN_STATE_PATH}?cli=${encodeURIComponent(cli)}`, {
			headers: { accept: 'application/json' },
		});
		let payload = null;
		try {
			payload = await response.json();
		} catch (error) {
			throw new Error(`登录状态查询失败（HTTP ${response.status}）`);
		}
		if (!response.ok || payload?.ok === false) {
			throw new Error(String(payload?.error ?? `HTTP ${response.status}`));
		}
		return payload;
	}

	/** Run one CLI; a failed run resolves to { error } instead of throwing. */
	async function attempt(cli, args, timeoutMs) {
		try {
			const run = await callRun(cli, args, timeoutMs);
			if (run.timedOut) return { error: '命令超时' };
			const raw = run.stdout?.value;
			const text = typeof raw === 'string' ? raw.trim() : '';
			/* A refusal can arrive as parsed JSON on stdout with exit code 1
			 * (`wecom-cli doc search` answers `{errcode:851008, help_message}`),
			 * so the hint is read from the value itself, not from the string
			 * form — which is empty once the host has parsed the JSON. */
			if (run.exitCode !== 0) {
				const hint = cliFailureHint(typeof raw === 'string' ? safeParse(raw) : raw);
				if (hint !== null) return { error: hint };
				/* tapd reports a refused call as `{error, message}` — those words
				 * drive the login/picker switch further down, so they must stay
				 * a value rather than becoming an opaque exit code. */
				if (raw !== null && typeof raw === 'object') return { value: raw };
				if (text === '') return { error: run.stderr || `退出码 ${run.exitCode}` };
			}
			return { value: run.stdout?.json ? raw : text };
		} catch (error) {
			const message = String(error?.message ?? error);
			return { error: error?.resolved ? `${message}（命令：${error.resolved}）` : message };
		}
	}

	/** JSON.parse without throwing; `null` when the text is not JSON. */
	function safeParse(text) {
		try {
			return JSON.parse(text);
		} catch (error) {
			return null;
		}
	}

	/**
	 * Both CLIs report a refused request as a JSON envelope on stdout with exit
	 * code 0 — `{ errcode, errmsg, help_message }`. wecom writes that
	 * `help_message` for the end user and its API asks for it verbatim
	 * (the bot lacking 「搜索与获取文档内容」 is exactly this case), so an
	 * empty result list must not hide it behind "没有命中".
	 */
	function cliFailureHint(value) {
		const code = firstOf(value, ['errcode', 'error_code', 'code']);
		if (code === undefined || Number(code) === 0) return null;
		const help = firstOf(value, ['help_message', 'helpMessage']) ?? firstOf(value, ['errmsg', 'message', 'error']);
		const text = help === undefined ? `CLI 返回错误码 ${String(code)}` : String(help);
		// The envelope escapes its line breaks and ships a markdown link.
		const flat = text
			.replace(/\\n/g, '\n')
			.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 $2')
			.split(/\n+/)
			.map((line) => line.trim())
			.filter((line) => line !== '')
			.join('  ');
		return flat === '' ? `CLI 返回错误码 ${String(code)}` : flat;
	}

	/* ================================================================ *
	 * Normalisation — both CLIs are versioned independently of this
	 * panel, so every field read is a best effort with fallbacks.
	 * ================================================================ */

	const firstOf = (value, names) => {
		if (value === null || typeof value !== 'object') return undefined;
		for (const name of names) {
			const hit = value[name];
			if (hit !== undefined && hit !== null && String(hit) !== '') return hit;
		}
		return undefined;
	};

	const asList = (value) => {
		if (Array.isArray(value)) return value;
		if (value === null || typeof value !== 'object') return [];
		if (Array.isArray(value.data)) return value.data;
		if (Array.isArray(value.list)) return value.list;
		if (Array.isArray(value.items)) return value.items;
		if (value.data !== undefined && value.data !== null) return asList(value.data);
		return [];
	};

	/* `tapd <type> todo` answers ten rows unless told otherwise — CLI 1.0's
	 * `--limit` defaults to 10. The panel used to call it bare, so an account
	 * with a dozen "my" defects was shown ten of them and nothing said the
	 * rest existed. Ask for a page the size of a real backlog and keep walking
	 * while a page comes back full; the page cap only bounds a server that
	 * would ignore `--page`. The first page is returned untouched when it is
	 * short, so the login / project detection that inspects this result keeps
	 * seeing exactly the envelope the CLI printed. */
	const TODO_PAGE_SIZE = 100;
	const TODO_MAX_PAGES = 10;

	async function todoAll(cli, kind, timeoutMs) {
		const args = (page) => [kind, 'todo', '--limit', String(TODO_PAGE_SIZE), '--page', String(page)];
		const first = await attempt(cli, args(1), timeoutMs);
		if (first.error !== undefined) return first;
		const items = asList(first.value);
		if (items.length < TODO_PAGE_SIZE) return first;
		const seen = new Set();
		const merged = [];
		const merge = (list) => {
			for (const item of list) {
				const key = String(firstOf(item, ['id', 'Id', 'ID']) ?? '');
				if (key !== '') {
					if (seen.has(key)) continue;
					seen.add(key);
				}
				merged.push(item);
			}
		};
		merge(items);
		for (let page = 2; page <= TODO_MAX_PAGES; page += 1) {
			const next = await attempt(cli, args(page), timeoutMs);
			/* Pages after the first are best effort: keeping what already
			 * arrived beats turning a partially read backlog into an error. */
			if (next.error !== undefined) break;
			const batch = asList(next.value);
			if (batch.length === 0) break;
			merge(batch);
			if (batch.length < TODO_PAGE_SIZE) break;
		}
		const envelope = first.value !== null && typeof first.value === 'object' && !Array.isArray(first.value) ? first.value : {};
		return { value: { ...envelope, items: merged } };
	}

	const SEVERITY_RANK = { 致命: 0, Fatal: 0, fatal: 0, 严重: 1, Serious: 1, serious: 1 };

	/**
	 * TAPD writes multi-owner fields TAPD-style: `叶凯佳;刘运辉2;` — trailing
	 * separator, sometimes full-width. Rendering it verbatim put a stray `;`
	 * in the row meta and prefilled the 转派 box with `叶凯佳;`, which the CLI
	 * then wrote back as the owner. Normalise to the CLI's documented shape
	 * (english commas, no empty entries) at the mapping boundary.
	 */
	function normOwner(value) {
		return String(value ?? '')
			.split(/[;,；，]/)
			.map((part) => part.trim())
			.filter((part) => part !== '')
			.join(', ');
	}

	function normTapdItem(raw, kind) {
		const id = String(firstOf(raw, ['id', 'Id', 'ID']) ?? '');
		const dueRaw = String(firstOf(raw, ['due', 'deadline', 'end', 'expected_delivery', 'due_date']) ?? '');
		let due = null;
		if (dueRaw !== '') {
			const parsed = Date.parse(dueRaw.length > 10 ? `${dueRaw.slice(0, 10)}T${dueRaw.slice(11, 19)}` : `${dueRaw}T00:00:00`);
			if (!Number.isNaN(parsed)) due = parsed;
		}
		const severity = String(firstOf(raw, ['severity', 'Severity', 'priority', 'Priority']) ?? '');
		/* TAPD writes owners back in its own shape (`刘运辉2;叶凯佳`), so the
		 * raw string is kept next to the display form: 转派 prefills what TAPD
		 * said, not what the row decided to show. */
		const rawOwner = String(firstOf(raw, ['owner', 'current_owner', 'fix_owner', 'owner_name', 'created_by']) ?? '');
		return {
			id,
			kind,
			title: String(firstOf(raw, ['title', 'name', 'Title', 'summary']) ?? (id !== '' ? `#${id}` : '（无标题）')),
			status: String(firstOf(raw, ['status', 'Status', 'status_display']) ?? ''),
			severity,
			owner: normOwner(rawOwner),
			ownerRaw: rawOwner,
			due,
			dueText: dueRaw.slice(0, 10),
			url: String(firstOf(raw, ['url', 'Url', 'link']) ?? ''),
			raw,
		};
	}

	function normWecomTodo(raw) {
		return {
			id: String(firstOf(raw, ['id', 'todo_id', 'taskId']) ?? ''),
			kind: 'wecom-todo',
			title: String(firstOf(raw, ['title', 'content', 'name', 'summary']) ?? '（无标题）'),
			status: String(firstOf(raw, ['status', 'state']) ?? ''),
			severity: '',
			owner: normOwner(firstOf(raw, ['owner', 'creator', 'assignee'])),
			due: null,
			dueText: String(firstOf(raw, ['due_time', 'deadline', 'dueDate', 'duedate']) ?? '').slice(0, 16),
			url: String(firstOf(raw, ['url', 'link', 'doc_url']) ?? ''),
			raw,
		};
	}

	function normDoc(raw) {
		return {
			id: String(firstOf(raw, ['docid', 'docId', 'id', 'url']) ?? ''),
			title: String(firstOf(raw, ['title', 'name', 'docname']) ?? '（无标题）'),
			owner: String(firstOf(raw, ['owner', 'creator', 'author']) ?? ''),
			url: String(firstOf(raw, ['url', 'link', 'doc_url']) ?? ''),
			raw,
		};
	}

	const severityIsHigh = (severity) => Object.prototype.hasOwnProperty.call(SEVERITY_RANK, severity);
	const isOverdue = (item) => item.due !== null && item.due < Date.now() - 86_400_000;
	const needsAttention = (item) => severityIsHigh(item.severity) || isOverdue(item);

	/* ================================================================ *
	 * Demo data — what the panel shows when a CLI is absent, so the
	 * page is never a dead end and its layout stays verifiable.
	 * ================================================================ */

	const DEMO = {
		tapd: {
			todos: [
				{ id: 'S20261101', kind: 'story', title: '工作台侧栏支持企微文档搜索', status: '开发中', severity: '一般', owner: '我', dueText: todayPlus(0), due: Date.now(), url: '' },
				{ id: 'T88112233', kind: 'task', title: '评审 Liquid Glass 视觉走查清单', status: '进行中', severity: '提示', owner: '我', dueText: todayPlus(1), due: Date.now() + 86_400_000, url: '' },
			],
			bugs: [
				{ id: 'B5501001', kind: 'bug', title: '深色模式下浮层文字对比度不足', status: '开发中', severity: '严重', owner: '我', dueText: todayPlus(-1), due: Date.now() - 2 * 86_400_000, url: '' },
				{ id: 'B5501002', kind: 'bug', title: '切换工作区时右侧面板残留旧状态', status: '待处理', severity: '一般', owner: '我', dueText: todayPlus(2), due: Date.now() + 2 * 86_400_000, url: '' },
				{ id: 'B5501003', kind: 'bug', title: '设置页滚动条在缩放 125% 时溢出', status: '已修复', severity: '致命', owner: '张三', dueText: '', due: null, url: '' },
			],
		},
		wecom: {
			todos: [
				{ id: 'w1', kind: 'wecom-todo', title: '回复「玻璃材质走查」文档评论', status: '', severity: '', owner: '', dueText: '今天 18:00', due: null, url: '' },
				{ id: 'w2', kind: 'wecom-todo', title: '确认发布会物料最终版', status: '', severity: '', owner: '', dueText: '明天 12:00', due: null, url: '' },
			],
			docs: [
				{ id: 'd1', title: '玻璃材质走查清单 v3', owner: '产品组', url: '' },
				{ id: 'd2', title: '工作台需求池（10月）', owner: '项目组', url: '' },
				{ id: 'd3', title: '发布节奏与窗口期', owner: 'PMO', url: '' },
			],
		},
	};

	function todayPlus(days) {
		const date = new Date(Date.now() + days * 86_400_000);
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${date.getFullYear()}-${month}-${day}`;
	}

	/* ================================================================ *
	 * Services — opening a session from a case.
	 * ================================================================ */

	function service(name) {
		try {
			const got = ctx.get?.(name);
			return got ?? null;
		} catch (error) {
			return null;
		}
	}

	/**
	 * Pick a directory, create a workspace for it, and start a session —
	 * the host's own flow, used feature-by-feature so an older shell still
	 * gets as far as it can.
	 */
	async function openCaseWorkspace() {
		const uiWorkspace = service('uiWorkspace');
		const workspaces = service('workspaces');
		if (uiWorkspace === null || typeof uiWorkspace.pickDirectory !== 'function') {
			throw new Error('当前宿主不支持选择目录');
		}
		const path = await uiWorkspace.pickDirectory();
		if (path === null || path === '') return null;
		if (workspaces === null || typeof workspaces.create !== 'function') {
			throw new Error('当前宿主不支持创建工作区');
		}
		const view = await workspaces.create({ path });
		const id = view?.id ?? view?.workspaceId;
		if (id === undefined || id === null || id === '') throw new Error('工作区已创建但未返回 id');
		if (typeof uiWorkspace.startSession === 'function') uiWorkspace.startSession(id);
		return { path, id };
	}

	/* ================================================================ *
	 * Shared UI atoms
	 * ================================================================ */

	const Spinner = () => h('span', { className: 'lgws-spinner', 'aria-label': '加载中' });

	const EmptyRow = ({ text }) => h('div', { className: 'lgws-empty' }, text);

	const ErrorNote = ({ error }) =>
		error === null ? null : h('div', { className: 'lgws-error' }, String(error));

	/* A CLI can fail with "credentials missing" rather than with a broken
	 * command. That is not an error to dump as raw JSON — it is the login
	 * state, and the panel answers it with the login action. */
	const AUTH_FAILURE_PATTERN = /authentication_required|no valid credentials|access token|api-user|未登录|未认证|unauthorized/i;
	const authFailure = (error) => typeof error === 'string' && AUTH_FAILURE_PATTERN.test(error);

	/* Credentials without a project is the next setup step, not a fetch
	 * failure: `tapd` refuses every list command with `workspace_required`
	 * until one is chosen. The panel answers that with the project picker
	 * rather than the CLI's JSON envelope. */
	const WORKSPACE_FAILURE_PATTERN = /workspace_required|no workspace id configured|--workspace-id|workspace switch/i;
	const workspaceFailure = (error) => typeof error === 'string' && WORKSPACE_FAILURE_PATTERN.test(error);

	/* TAPD web deep links. The CLI's todo payloads carry no `url`, so the
	 * panel builds the canonical detail page itself. `tapd url <url>` in
	 * tapd-ai-cli 1.0 accepts exactly these three path shapes. */
	const tapdItemUrl = (workspaceId, kind, id) => {
		if (workspaceId === '' || id === '') return '';
		const page = kind === 'bug' ? 'bug' : kind === 'story' ? 'story' : 'task';
		return `https://www.tapd.cn/tapd_fe/${workspaceId}/${page}/detail/${id}`;
	};

	/* `tapd workflow status-map` is keyed by work-item type, and
	 * `workitem-type list` (a bare array) is the only source of one. */
	const tapdWorkitemTypeId = async (system) => {
		const run = await attempt('tapd', ['workitem-type', 'list']);
		if (run.error !== undefined) return { id: '', error: run.error };
		const list = asList(run.value);
		const wanted = system === 'bug' ? ['bug', '缺陷'] : system === 'story' ? ['story', '需求'] : ['task', '任务'];
		const matches = (entry) => {
			const hay = [entry?.entity_type, entry?.english_name, entry?.name].map((value) => String(value ?? '').toLowerCase());
			return wanted.some((word) => hay.some((value) => value.includes(word.toLowerCase())));
		};
		const pick = (list ?? []).find(matches) ?? (list ?? [])[0];
		const id = String(pick?.id ?? '');
		return id === '' ? { id: '', error: 'TAPD 未返回工作项类型' } : { id, error: null };
	};

	/* The CLI hard-codes three task states and refuses anything else. */
	const TASK_STATUSES = [
		{ id: 'open', name: '未开始' },
		{ id: 'progressing', name: '进行中' },
		{ id: 'done', name: '已完成' },
	];

	const statusPairs = (raw) => {
		const pairs = [];
		for (const entry of asList(raw)) {
			if (entry !== null && typeof entry === 'object') {
				pairs.push({
					id: String(firstOf(entry, ['id', 'status', 'value', 'key']) ?? ''),
					name: String(firstOf(entry, ['name', 'label', 'display', 'chinese_name', 'value']) ?? ''),
				});
			}
		}
		if (pairs.length === 0 && raw !== null && typeof raw === 'object') {
			// `{ status_code: 中文名 }` is the shape 1.0 actually returns.
			for (const [id, name] of Object.entries(raw)) {
				if (typeof name === 'string') pairs.push({ id, name });
			}
		}
		return pairs.filter((pair) => pair.id !== '');
	};

	const tapdStatusMap = async (system, rawItem, fallbackTypeId) => {
		if (system === 'task') return { pairs: TASK_STATUSES, error: null };
		let typeId = String(rawItem?.workitem_type_id ?? '') || String(fallbackTypeId ?? '');
		if (typeId === '') {
			const resolved = await tapdWorkitemTypeId(system);
			if (resolved.error !== null) return { pairs: [], error: resolved.error };
			typeId = resolved.id;
		}
		const run = await attempt('tapd', [
			'workflow',
			'status-map',
			`--system=${system}`,
			`--workitem-type-id=${typeId}`,
		]);
		if (run.error !== undefined) return { pairs: [], error: run.error };
		const pairs = statusPairs(run.value);
		return pairs.length === 0
			? { pairs, error: '状态映射为空，可直接在「命令」页执行 workflow 命令' }
			: { pairs, error: null };
	};

	const tapdSuccess = (run) => {
		if (run.error !== undefined) return run.error;
		const value = run.value;
		if (value !== null && typeof value === 'object' && value.success === false) {
			return String(value.msg ?? value.message ?? 'TAPD 返回 success=false');
		}
		return null;
	};


	function copyText(text) {
		try {
			void navigator.clipboard?.writeText(text);
		} catch (error) {
			/* clipboard may be absent; the text stays selectable */
		}
	}

	/**
	 * The header instrument for one CLI. It stays the existing quiet pill;
	 * "unauthenticated" is only a modifier — the dot turns warn and a small
	 * 「未登录」 label appears, nothing else moves.
	 */
	/* ================================================================ *
	 * The TAPD project switcher
	 * ================================================================ */

	/* Switching projects used to live only in the login banner, and the banner
	 * folds away once a project is configured — so the one control that could
	 * change the project vanished exactly when it was first needed. It is a
	 * permanent instrument now: a glass pill in the toolbar that names the
	 * active project and opens a searchable list of every project the token can
	 * reach. */
	/* ================================================================ *
	 * Segmented tabs with a travelling selection plate.
	 * ================================================================ */

	/* ================================================================ *
	 * Dialog — the glass sheet every mutating action opens.
	 * ================================================================ */

	function Dialog({ title, onClose, children, wide }) {
		React.useEffect(() => {
			const onKey = (event) => {
				if (event.key === 'Escape') onClose();
			};
			document.addEventListener('keydown', onKey);
			return () => document.removeEventListener('keydown', onKey);
		}, [onClose]);
		return h(
			'div',
			{ className: 'lgws-dialogScrim', onPointerDown: (event) => {
				if (event.target === event.currentTarget) onClose();
			} },
			h(
				'div',
				{ className: `lgws-dialog${wide ? ' lgws-dialogWide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
				h(
					'div',
					{ className: 'lgws-dialogHead' },
					h('div', { className: 'lgws-dialogTitle' }, title),
					h('button', { className: 'lgws-dialogClose', onClick: onClose, 'aria-label': '关闭' }, '✕')
				),
				h('div', { className: 'lgws-dialogBody' }, children)
			)
		);
	}

	/* ================================================================ *
	 * Action dialogs
	 * ================================================================ */

	/** 流转状态: read the workflow, offer every reachable status. */
	function TransitionDialog({ item, live, onDone, onClose, workitemTypeId }) {
		const [statuses, setStatuses] = React.useState(null);
		const [error, setError] = React.useState(null);
		const [busyId, setBusyId] = React.useState(null);
		const [note, setNote] = React.useState(null);
		const type = item.kind === 'story' ? 'story' : item.kind === 'task' ? 'task' : 'bug';

		React.useEffect(() => {
			let alive = true;
			if (!live) {
				setStatuses(
					type === 'task'
						? TASK_STATUSES
						: [
								{ id: 'developing', name: '开发中' },
								{ id: 'testing', name: '测试中' },
								{ id: 'resolved', name: '已解决' },
								{ id: 'closed', name: '已关闭' },
							]
				);
				return undefined;
			}
			void (async () => {
				setError(null);
				const map = await tapdStatusMap(type, item.raw ?? null, workitemTypeId);
				if (!alive) return;
				setStatuses(map.pairs);
				if (map.error !== null) setError(map.error);
			})();
			return () => {
				alive = false;
			};
		}, [live, type, item, workitemTypeId]);

		const apply = async (statusId, statusName) => {
			setBusyId(statusId);
			setNote(null);
			const run = await attempt('tapd', [type, 'update', String(item.id), '--status', String(statusId)]);
			const failure = tapdSuccess(run);
			setBusyId(null);
			if (failure !== null) {
				setNote(`流转失败：${failure}`);
				return;
			}
			setNote(`已流转到「${statusName || statusId}」`);
			onDone();
		};

		return h(
			Dialog,
			{ title: `流转 ${type.toUpperCase()} #${item.id}`, onClose },
			h('div', { className: 'lgws-dialogIntro' }, item.title),
			statuses === null ? h(Spinner) : null,
			ErrorNote({ error }),
			h(
				'div',
				{ className: 'lgws-statusGrid' },
				(statuses ?? []).map((status) =>
					h(
						'button',
						{
							key: status.id,
							className: 'lgws-statusCell',
							disabled: busyId !== null,
							onClick: () => void apply(status.id, status.name),
						},
						status.name || status.id,
						busyId === status.id ? h(Spinner) : null
					)
				)
			),
			note === null ? null : h('div', { className: 'lgws-dialogNote' }, note),
			h(
				'div',
				{ className: 'lgws-dialogActions lgws-dialogActionsEnd' },
				h('div', { className: 'lgws-dialogHint' }, '点击状态即写入 TAPD'),
				h('button', { className: 'lgws-buttonSecondary', onClick: onClose, disabled: busyId !== null }, '取消')
			),
			!live ? h('div', { className: 'lgws-demoNote' }, '演示模式 — 点击不会真正修改 TAPD') : null
		);
	}

	/** 改处理人: write the owner field. */
	function OwnerDialog({ item, live, onDone, onClose }) {
		/* Prefill what TAPD actually holds: its multi-owner form is `甲;乙`, and
		 * submitting a space-joined display string made TAPD store one owner
		 * whose name was literally `甲, 乙`. */
		const [owner, setOwner] = React.useState(String(item.ownerRaw ?? item.owner ?? ''));
		const [busy, setBusy] = React.useState(false);
		const [note, setNote] = React.useState(null);
		const type = item.kind === 'story' ? 'story' : item.kind === 'task' ? 'task' : 'bug';
		const apply = async () => {
			const names = owner
				.split(/[;,；，]/)
				.map((part) => part.trim())
				.filter((part) => part !== '');
			if (names.length === 0) return;
			const value = names.join(';');
			setBusy(true);
			setNote(null);
			const run = live
				? await attempt('tapd', [type, 'update', String(item.id), '--owner', value])
				: { value: 'demo' };
			const failure = run.error === undefined && live ? tapdSuccess(run) : null;
			setBusy(false);
			setNote(failure !== null ? `失败：${failure}` : `处理人已改为 ${names.join(', ')}`);
			if (failure === null) onDone();
		};
		return h(
			Dialog,
			{ title: `转派 ${type.toUpperCase()} #${item.id}`, onClose },
			h('div', { className: 'lgws-dialogIntro' }, item.title),
			h('input', {
				className: 'lgws-input',
				value: owner,
				placeholder: 'TAPD 用户名（多人用分号或逗号分隔）',
				onChange: (event) => setOwner(event.target.value),
				onKeyDown: (event) => {
					if (event.key === 'Enter') void apply();
				},
			}),
			h(
				'div',
				{ className: 'lgws-dialogActions' },
				h('button', { className: 'lgws-buttonSecondary', onClick: onClose }, '取消'),
				h('button', { className: 'lgws-buttonPrimary', disabled: busy || owner.trim() === '', onClick: () => void apply() }, busy ? '提交中…' : '确认转派')
			),
			note === null ? null : h('div', { className: 'lgws-dialogNote' }, note),
			!live ? h('div', { className: 'lgws-demoNote' }, '演示模式 — 不会真正修改 TAPD') : null
		);
	}

	/* ================================================================ *
	 * Rows
	 * ================================================================ */

	/* One kind table feeds the row symbol, the detail's type line, and the
	 * chips. Colour is per-kind here, severity colour per-row: two loud
	 * accents in the same 34px cell would fight. */
	const KIND_META = {
		bug: { short: 'BUG', label: '缺陷', color: '#c0392b', bg: 'rgba(192, 57, 43, 0.12)' },
		story: { short: 'REQ', label: '需求', color: '#3d6fd4', bg: 'rgba(61, 111, 212, 0.12)' },
		task: { short: 'TASK', label: '任务', color: '#3f8f5f', bg: 'rgba(63, 143, 95, 0.12)' },
		'wecom-todo': { short: 'WX', label: '企微待办', color: '#12897f', bg: 'rgba(18, 137, 127, 0.12)' },
		doc: { short: 'DOC', label: '企微文档', color: '#8b6cd8', bg: 'rgba(139, 108, 216, 0.12)' },
	};

	/* TAPD 的描述有两种来源：网页编辑器写出的富文本 HTML，以及 tapd-ai-cli
	 * 在输出层转换出的 markdown（图片是 `![图](url)`）。详情面板是应用内的
	 * 阅读面，两种形态都收敛成同一小组安全 HTML：白名单标签、白名单属性、
	 * 绝对化的图片/链接地址。脚本与事件属性永远进不来。 */
	const escapeHtml = (value) =>
		String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');

	/* TAPD 页面引用资源既有协议相对（`//img.tapd.cn/…`）也有站内相对
	 * （`/images/…`）。面板运行在应用自己的 origin 上，两者都必须钉到
	 * https 才能加载。 */
	const absolutizeUrl = (value) => {
		const url = String(value ?? '').trim();
		if (url === '') return '';
		if (/^(https?:|data:image\/|mailto:)/i.test(url)) return url;
		if (url.startsWith('//')) return `https:${url}`;
		if (url.startsWith('/')) return `https://www.tapd.cn${url}`;
		return url;
	};

	/* 描述里的图片即使拼出绝对地址也加载不出来：www.tapd.cn 的登录 cookie
	 * 是 SameSite=Lax，应用内 <img> 的跨站子资源请求带不上它。站内图片一律
	 * 换成宿主的同源代理（`tapd image get` 换取预签名下载地址，宿主取回字
	 * 节）；外部图片和 data: 保持原样。 */
	const IMAGE_PROXY_PATH = '/dsh-glass-theme/ws/image';
	const IMAGE_PROXY_HOSTS = new Set(['www.tapd.cn', 'tapd.cn', 'img.tapd.cn']);
	const proxiedImageUrl = (value) => {
		const text = String(value ?? '').trim();
		if (text === '' || text.startsWith('data:image/')) return null;
		let path = '';
		if (text.startsWith('//')) {
			/* 协议相对地址当路径喂给 CLI 是垃圾；钉上 https 按域名判断。 */
			if (!URL.canParse(`https:${text}`)) return null;
			const parsed = new URL(`https:${text}`);
			if (!IMAGE_PROXY_HOSTS.has(parsed.hostname)) return null;
			path = parsed.pathname;
		} else if (text.startsWith('/')) {
			path = text;
		} else {
			if (!URL.canParse(text)) return null;
			const parsed = new URL(text);
			if (!IMAGE_PROXY_HOSTS.has(parsed.hostname)) return null;
			path = parsed.pathname;
		}
		if (!/^\/[A-Za-z0-9._\-/]+$/.test(path) || path.includes('..')) return null;
		return `${IMAGE_PROXY_PATH}?path=${encodeURIComponent(path)}`;
	};

	const RICH_VOID_TAGS = new Set(['br', 'hr', 'img']);
	/* 这些标签的*内容*是代码或元数据（`<script>` 的正文不是散文），连文带
	 * 内容一起丢；其余未知的标签只摘掉标签本身，文字保留。 */
	const RICH_DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'svg', 'math', 'head', 'title', 'meta', 'link', 'base', 'template']);
	const RICH_KEEP_TAGS = new Set([
		'p', 'br', 'hr', 'div', 'span', 'section', 'article', 'figure', 'figcaption',
		'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'sub', 'sup', 'code', 'pre', 'blockquote',
		'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
		'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
		'img', 'a', 'font',
	]);

	/* 属性白名单：逐标签列出可以留下的属性；返回 null 表示整个标签丢弃
	 * （没有合法 src 的 <img> 只会渲染成裂图占位，不如不放）。 */
	const sanitizeRichAttrs = (rawAttrs, tag) => {
		const attrs = [];
		const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
		let match;
		while ((match = pattern.exec(String(rawAttrs ?? ''))) !== null) {
			const name = match[1].toLowerCase();
			const value = match[2] ?? match[3] ?? match[4] ?? '';
			if (value === '') continue;
			if (tag === 'img') {
				if (name === 'src') {
					const src = absolutizeUrl(value);
					if (!/^(https?:|data:image\/)/i.test(src)) return null;
					const proxied = proxiedImageUrl(src);
					/* src 走同源代理；原图地址留给点击跳浏览器和裂图兜底。 */
					attrs.push(`src="${escapeHtml(proxied ?? src)}"`);
					if (proxied !== null) attrs.push(`data-rich-href="${escapeHtml(src)}"`);
				} else if (name === 'alt' || name === 'title') {
					attrs.push(`${name}="${escapeHtml(value)}"`);
				} else if (name === 'width' || name === 'height') {
					if (/^\d{1,4}$/.test(value)) attrs.push(`${name}="${value}"`);
				}
			} else if (tag === 'a') {
				if (name === 'href') {
					const href = absolutizeUrl(value);
					if (!/^(https?:|mailto:)/i.test(href)) continue;
					attrs.push(`href="${escapeHtml(href)}"`);
				} else if (name === 'title') {
					attrs.push(`title="${escapeHtml(value)}"`);
				}
			} else if ((tag === 'td' || tag === 'th') && (name === 'colspan' || name === 'rowspan')) {
				if (/^\d{1,3}$/.test(value)) attrs.push(`${name}="${value}"`);
			}
		}
		if (tag === 'img') attrs.push('loading="lazy"');
		/* 链接在 webview 里不允许带走页面本身；点击由容器统一接管（在
		 * 真实浏览器里打开），这两个属性是接管之外的兜底。 */
		if (tag === 'a') attrs.push('target="_blank"', 'rel="noreferrer noopener"');
		return attrs.length === 0 ? '' : ` ${attrs.join(' ')}`;
	};

	/** Reduce a TAPD rich-text body to the safe subset described above. */
	const sanitizeRichHtml = (html) => {
		const source = String(html ?? '');
		const pattern = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
		let out = '';
		let cursor = 0;
		const open = [];
		let match;
		while ((match = pattern.exec(source)) !== null) {
			out += escapeHtml(source.slice(cursor, match.index));
			cursor = pattern.lastIndex;
			const raw = match[0];
			if (raw.startsWith('<!--')) continue;
			const name = match[1].toLowerCase();
			const closing = raw.startsWith('</');
			if (RICH_DROP_WITH_CONTENT.has(name)) {
				/* 连文带内容一起丢：跳到对应的闭合标签为止。 */
				if (!closing && !RICH_VOID_TAGS.has(name)) {
					const closer = new RegExp(`</${name}\\s*>`, 'gi');
					closer.lastIndex = cursor;
					const stop = closer.exec(source);
					cursor = stop === null ? source.length : stop.index + stop[0].length;
					pattern.lastIndex = cursor;
				}
				continue;
			}
			if (!RICH_KEEP_TAGS.has(name)) continue;
			if (closing) {
				const at = open.lastIndexOf(name);
				if (at === -1) continue;
				while (open.length > at) out += `</${open.pop()}>`;
				continue;
			}
			const attrs = sanitizeRichAttrs(match[2] ?? '', name);
			if (attrs === null) continue;
			out += `<${name}${attrs}>`;
			if (!RICH_VOID_TAGS.has(name)) open.push(name);
		}
		out += escapeHtml(source.slice(cursor));
		while (open.length > 0) out += `</${open.pop()}>`;
		return out;
	};

	/* 行内 markdown：先整体转义再叠加替换，所以产物天然落在安全子集里。
	 * 标题文本（`[文字](地址 "标题")` 的标题部分）直接忽略——转义过的引号
	 * 让它不再值得单独解析。 */
	const inlineMarkdown = (text) =>
		escapeHtml(text)
			.replace(/`([^`]+)`/g, '<code>$1</code>')
			.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;.*&quot;)?\)/g, (_m, alt, src) => {
				/* 文本已转义过一遍，这里再交给 escapeHtml 属于双重转义；
				 * TAPD 的图片路径只含字母数字和 `._-/`，不受影响。 */
				const url = absolutizeUrl(src);
				if (!/^(https?:|data:image\/)/i.test(url)) return alt;
				const proxied = proxiedImageUrl(url);
				const origin = proxied === null ? '' : ` data-rich-href="${escapeHtml(url)}"`;
				return `<img src="${escapeHtml(proxied ?? url)}"${origin} alt="${alt}" loading="lazy">`;
			})
			.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;.*&quot;)?\)/g, (_m, label, href) => {
				const url = absolutizeUrl(href);
				return /^(https?:|mailto:)/i.test(url)
					? `<a href="${url}" target="_blank" rel="noreferrer noopener">${label}</a>`
					: label;
			})
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/__([^_]+)__/g, '<strong>$1</strong>')
			.replace(/~~([^~]+)~~/g, '<del>$1</del>')
			.replace(/(^|[^*\\])\*([^*\s](?:[^*]*[^*\s])?)\*/g, '$1<em>$2</em>');

	/** Block-level markdown → the same safe HTML subset. */
	const markdownToHtml = (text) => {
		const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
		const out = [];
		let para = [];
		let list = null;
		let quote = [];
		let fence = null;
		let table = null;
		const flushPara = () => {
			if (para.length > 0) {
				out.push(`<p>${para.join('<br>')}</p>`);
				para = [];
			}
		};
		const flushList = () => {
			if (list !== null) {
				out.push(`</${list}>`);
				list = null;
			}
		};
		const flushQuote = () => {
			if (quote.length > 0) {
				out.push(`<blockquote>${markdownToHtml(quote.join('\n'))}</blockquote>`);
				quote = [];
			}
		};
		const flushTable = () => {
			if (table === null) return;
			const row = (cells, tag) => `<tr>${cells.map((cell) => `<${tag}>${inlineMarkdown(cell.trim())}</${tag}>`).join('')}</tr>`;
			out.push(
				`<table><thead>${row(table.head, 'th')}</thead><tbody>${table.rows.map((cells) => row(cells, 'td')).join('')}</tbody></table>`
			);
			table = null;
		};
		const flushAll = () => {
			flushPara();
			flushList();
			flushQuote();
			flushTable();
		};
		for (let index = 0; index < lines.length; index += 1) {
			const line = lines[index];
			if (fence !== null) {
				if (/^\s*```/.test(line)) {
					out.push(`<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`);
					fence = null;
				} else {
					fence.push(line);
				}
				continue;
			}
			if (/^\s*```/.test(line)) {
				flushAll();
				fence = [];
				continue;
			}
			if (line.trim() === '') {
				flushAll();
				continue;
			}
			const heading = /^(#{1,6})\s+(.*)$/.exec(line);
			if (heading !== null) {
				flushAll();
				const level = Math.min(6, heading[1].length + 2); // h1–h6 太大，压到 h3–h6 的排版
				out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
				continue;
			}
			if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
				flushAll();
				out.push('<hr>');
				continue;
			}
			if (/^\s*>/.test(line)) {
				flushPara();
				flushList();
				flushTable();
				quote.push(line.replace(/^\s*>\s?/, ''));
				continue;
			}
			const cells = line.includes('|') ? line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|') : null;
			if (cells !== null && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[index + 1] ?? '')) {
				flushPara();
				flushList();
				flushQuote();
				table = { head: cells, rows: [] };
				index += 1;
				continue;
			}
			if (table !== null && cells !== null) {
				table.rows.push(cells);
				continue;
			}
			flushQuote();
			flushTable();
			const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
			if (item !== null) {
				flushPara();
				const wanted = /^\d/.test(item[2]) ? 'ol' : 'ul';
				if (list !== wanted) {
					if (list !== null) out.push(`</${list}>`);
					out.push(`<${wanted}>`);
					list = wanted;
				}
				out.push(`<li>${inlineMarkdown(item[3])}</li>`);
				continue;
			}
			flushList();
			para.push(inlineMarkdown(line));
		}
		flushAll();
		if (fence !== null) out.push(`<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`);
		return out.join('');
	};

	/* 详情面板的唯一入口：正文里已经有块级 HTML 就走净化路径，否则一律按
	 * markdown 渲染（纯文本也因此天然安全）。 */
	const RICH_BLOCK_PATTERN = /<(p|div|br|img|table|ul|ol|li|h[1-6]|blockquote|pre|span|a|section|figure|td|th)\b[^>]*>/i;
	const descriptionToRichHtml = (value) => {
		const text = String(value ?? '').replace(/\r\n?/g, '\n').trim();
		if (text === '') return '';
		return RICH_BLOCK_PATTERN.test(text) ? sanitizeRichHtml(text) : markdownToHtml(text);
	};

	/* `tapd <kind> show` 回的是一条完整记录，但形态随 CLI 版本浮动：裸对象、
	 * 单元素数组，或者单键包裹（`{bug: {…}}`）。统一剥到记录本身。 */
	const isTapdKind = (kind) => kind === 'bug' || kind === 'story' || kind === 'task';
	const detailFromShow = (value, id) => {
		let parsed = value;
		if (typeof parsed === 'string') parsed = safeParse(parsed.trim());
		if (parsed === null || typeof parsed !== 'object') return null;
		const list = asList(parsed);
		if (list.length > 0) {
			const hit = list.find((entry) => entry !== null && typeof entry === 'object' && String(entry.id ?? '') === String(id));
			return hit ?? list[0];
		}
		for (const key of ['bug', 'story', 'task', 'data', 'info', 'item']) {
			const inner = parsed[key];
			if (inner !== null && typeof inner === 'object') return asList(inner)[0] ?? inner;
		}
		return parsed;
	};

	/* A due date is read, not parsed: `2026-10-25` is a database value, and
	 * 10月25日 is what a person says out loud. */
	/* TAPD spells priority with words (`prompt`, `middle`, …). The panel reads
	 * them out in the same language as the rest of the row. */
	const priorityLabel = (value) => {
		const text = String(value ?? '').trim();
		const table = { prompt: '紧急', urgent: '紧急', high: '高', middle: '中', medium: '中', low: '低', normal: '普通' };
		return table[text.toLowerCase()] ?? text;
	};

	const dueLabel = (item) => {
		const text = String(item?.dueText ?? '');
		const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
		if (iso !== null) return `${Number(iso[2])}月${Number(iso[3])}日`;
		if (typeof item?.due === 'number' && Number.isFinite(item.due)) {
			const date = new Date(item.due);
			return `${date.getMonth() + 1}月${date.getDate()}日`;
		}
		return text;
	};

	/* TAPD timestamps arrive as `2026-10-22 18:12:19`; keep them quiet. */
	const formatWhen = (value) => {
		const text = String(value ?? '').trim();
		if (text === '') return '';
		const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(text);
		if (match === null) return text;
		const day = `${Number(match[2])}月${Number(match[3])}日`;
		return match[4] === undefined ? day : `${day} ${match[4]}:${match[5]}`;
	};

	/* A row is a door, not a control panel: the whole row opens the in-page
	 * detail, where 流转/转派 have room to explain themselves. */
	function SpaceRow({ item, statusLabel, selected, onOpen }) {
		const meta = KIND_META[item.kind] ?? KIND_META.bug;
		const attention = needsAttention(item);
		const due = dueLabel(item);
		const overdue = isOverdue(item);
		return h(
			'article',
			{ className: `lgwsp-item-row${selected === true ? ' lgwsp-is-selected' : ''}${attention ? ' lgwsp-is-attention' : ''}` },
			h(
				'button',
				{
					type: 'button',
					className: 'lgwsp-item-primary',
					'aria-label': `在页面内打开${meta.label}：${item.title}`,
					onClick: () => onOpen(item),
				},
				h('span', { className: 'lgwsp-item-symbol', style: { '--item-color': meta.color, '--item-bg': meta.bg }, 'aria-hidden': 'true' }, meta.short),
				h(
					'span',
					{ className: 'lgwsp-item-copy' },
					h('span', { className: 'lgwsp-item-title' }, item.title),
					h(
						'span',
						{ className: 'lgwsp-item-meta' },
						item.id === '' ? null : h('span', { className: 'lgwsp-item-id' }, item.id),
						item.status === '' ? null : h('span', { className: 'lgwsp-item-meta-sep', 'aria-hidden': 'true' }, '·'),
						item.status === '' ? null : h('span', { className: 'lgwsp-item-chip' }, statusLabel(item.kind, item.status)),
						due === '' ? null : h('span', { className: `lgwsp-item-due${overdue ? ' lgwsp-is-overdue' : ''}` }, overdue ? `逾期 · ${due}` : due)
					)
				)
			),
			h(
				'span',
				{ className: 'lgwsp-item-side' },
				h('span', { className: 'lgwsp-item-owner' }, item.owner),
				h('button', { type: 'button', className: 'lgwsp-row-open', onClick: () => onOpen(item) }, '查看详情')
			)
		);
	}

	/* 企微 documents have no in-page vitals to show (the CLI returns a title
	 * and a link), so the row keeps the link as its action and never pretends
	 * to have a detail page. */
	function DocRow({ doc, onOpen }) {
		return h(
			'article',
			{ className: 'lgwsp-item-row' },
			h(
				'button',
				{
					type: 'button',
					className: 'lgwsp-item-primary',
					'aria-label': `打开企微文档：${doc.title}`,
					onClick: () => onOpen(doc.url),
					disabled: doc.url === '',
				},
				h('span', { className: 'lgwsp-item-symbol', style: { '--item-color': KIND_META.doc.color, '--item-bg': KIND_META.doc.bg }, 'aria-hidden': 'true' }, KIND_META.doc.short),
				h(
					'span',
					{ className: 'lgwsp-item-copy' },
					h('span', { className: 'lgwsp-item-title' }, doc.title),
					h(
						'span',
						{ className: 'lgwsp-item-meta' },
						doc.owner === '' ? null : h('span', { className: 'lgwsp-item-id' }, doc.owner),
						doc.owner === '' ? null : h('span', { className: 'lgwsp-item-meta-sep', 'aria-hidden': 'true' }, '·'),
						h('span', { className: 'lgwsp-item-chip' }, '企微文档')
					)
				)
			),
			h('span', { className: 'lgwsp-item-side' }, doc.url === '' ? h('span', { className: 'lgwsp-item-owner' }, '无链接') : null)
		);
	}

	/* ================================================================ *
	 * The panel
	 * ================================================================ */

	function WorkspacePanel() {
		const [boot, setBoot] = React.useState({ phase: 'loading', serviceError: null });
		const [clis, setClis] = React.useState(null);
		const [data, setData] = React.useState(null);
		/* kind → { status code: 中文名 }, filled after the first paint so rows
		 * never show raw workflow codes such as `status_3`. */
		const [statusNames, setStatusNames] = React.useState({ story: {}, bug: {}, task: {} });
		/* One work-item type id drives both `workflow status-map` calls; story
		 * rows carry their own, bugs do not. */
		const [tapdTypeId, setTapdTypeId] = React.useState('');
		const [loadedAt, setLoadedAt] = React.useState(null);
		const [refreshing, setRefreshing] = React.useState(false);
		const [tab, setTab] = React.useState('overview');
		const [dialog, setDialog] = React.useState(null); // {kind:'transition'|'owner', item}
		const [sessionNotes, setSessionNotes] = React.useState({}); // item id → note
		const [docQuery, setDocQuery] = React.useState('');
		const [docs, setDocs] = React.useState(null);
		const [docError, setDocError] = React.useState(null);
		const [consoleCli, setConsoleCli] = React.useState('tapd');
		const [consoleInput, setConsoleInput] = React.useState('');
		const [consoleBusy, setConsoleBusy] = React.useState(false);
		const [consoleResult, setConsoleResult] = React.useState(null);
		/* Login flow, keyed by CLI. phase is one of
		 * idle | starting | running | needsToken | authorized | failed;
		 * qr only ever holds a wecom QR URL. */
		const [authFlow, setAuthFlow] = React.useState({ tapd: null, wecom: null });
		const [authTokens, setAuthTokens] = React.useState({ tapd: '', wecom: '' });
		/* TAPD's other credential: API 账号 + 口令 from 公司管理 → 开放平台. */
		const [authApiUsers, setAuthApiUsers] = React.useState({ tapd: '', wecom: '' });
		const [authApiPasswords, setAuthApiPasswords] = React.useState({ tapd: '', wecom: '' });
		const [authBusy, setAuthBusy] = React.useState({ tapd: false, wecom: false });
		const [authQrBroken, setAuthQrBroken] = React.useState(false);
		/* TAPD project list, filled once when credentials exist but no
		 * workspace_id does — `tapd-ai-cli` refuses every list command
		 * without one (`workspace_required`). */
		const [tapdWorkspaces, setTapdWorkspaces] = React.useState(null);
		const [workspaceBusy, setWorkspaceBusy] = React.useState(false);
		/* The project switcher's own list: every project the token can reach,
		 * fetched with `refresh: true` because the host's login assist only
		 * lists projects while none is configured. */
		const [projects, setProjects] = React.useState(null);
		const [projectMenuOpen, setProjectMenuOpen] = React.useState(false);
		const [projectQuery, setProjectQuery] = React.useState('');

		/* In-page detail + the bug list's own sync. The detail is keyed by
		 * `kind:id` rather than holding the item: a refresh replaces every
		 * item object, and a held reference would freeze the panel on stale
		 * status. */
		const [inspectorKey, setInspectorKey] = React.useState('');
		/* 每个打开过的详情的完整记录（`tapd <kind> show`），按 `kind:id`
		 * 缓存：列表行经常不带描述，详情只在第一次打开时取一次。 */
		const [details, setDetails] = React.useState({});
		const [rowQuery, setRowQuery] = React.useState('');
		const [bugSync, setBugSync] = React.useState({ phase: 'idle', at: null, error: null });
		const [toast, setToast] = React.useState('');
		/* Every sync carries the sequence number it started with; a newer
		 * sync (or a project switch) bumps it, so the older response is
		 * dropped instead of overwriting fresher data. */
		const bugSyncSeq = React.useRef(0);
		const toastTimer = React.useRef(null);
		const projectControlRef = React.useRef(null);
		const segRef = React.useRef(null);
		const plateRef = React.useRef(null);
		const richRef = React.useRef(null);

		const showToast = React.useCallback((text) => {
			setToast(text);
			if (toastTimer.current !== null) clearTimeout(toastTimer.current);
			toastTimer.current = setTimeout(() => setToast(''), 2400);
		}, []);

		/* Auto-login fires at most once per CLI for the life of this panel —
		 * a failed attempt is shown as text and never retried on its own. */
		const autoLoginRef = React.useRef({ tapd: false, wecom: false });
		const tokenInputRef = React.useRef(null);
		const authHideTimerRef = React.useRef(null);

		const live = { tapd: clis?.tapd?.available === true, wecom: clis?.wecom?.available === true };
		const demoTapd = clis !== null && !live.tapd;
		const demoWecom = clis !== null && !live.wecom;

		const load = React.useCallback(async () => {
			setRefreshing(true);
			try {
				const status = await callStatus();
				setClis(status.clis ?? null);
				const useTapd = status.clis?.tapd?.available === true;
				const useWecom = status.clis?.wecom?.available === true;
				const workspaceId = String(status.clis?.tapd?.auth?.workspace?.id ?? '');
				const [bugsA, storiesA, tasksA, wecomTodosA] = await Promise.all([
					useTapd ? todoAll('tapd', 'bug') : { value: null },
					useTapd ? todoAll('tapd', 'story') : { value: null },
					useTapd ? todoAll('tapd', 'task') : { value: null },
					useWecom ? attempt('wecom', ['todo', 'list']) : { value: null },
				]);
				/* `tapd <type> todo` returns no URL, so every row would lose its
				 * 打开 button. Build the canonical detail page here instead. */
				const withLink = (items, kind) =>
					items.map((item) => ({
						...item,
						url: item.url === '' ? tapdItemUrl(workspaceId, kind, item.id) : item.url,
					}));
				const bugs =
					bugsA.error === undefined
						? withLink(asList(bugsA.value).map((raw) => normTapdItem(raw, 'bug')), 'bug')
						: null;
				const stories =
					storiesA.error === undefined
						? withLink(asList(storiesA.value).map((raw) => normTapdItem(raw, 'story')), 'story')
						: null;
				const tasks =
					tasksA.error === undefined
						? withLink(asList(tasksA.value).map((raw) => normTapdItem(raw, 'task')), 'task')
						: null;
				const wecomTodos = wecomTodosA.error === undefined ? asList(wecomTodosA.value).map(normWecomTodo) : null;
				/* Authentication is a state, not a fetch failure: when a CLI
				 * answers "credentials missing", lift it into `clis.<cli>.auth`
				 * so the login banner (and its auto-start) takes over. */
				const authBlockedTapd = [bugsA, storiesA, tasksA].some((result) => authFailure(result.error));
				const authBlockedWecom = authFailure(wecomTodosA.error);
				if (authBlockedTapd) {
					setClis((prev) =>
						prev === null || typeof prev !== 'object'
							? prev
							: {
									...prev,
									tapd: {
										...prev.tapd,
										auth: { state: 'unauthorized', detail: 'TAPD 尚未登录：缺少有效凭据', method: 'token' },
									},
								}
					);
				}
				/* Credentials present but no project chosen: the CLI answers
				 * every list with `workspace_required`, so the panel shows the
				 * project picker instead of five identical JSON errors. */
				const workspaceBlockedTapd =
					!authBlockedTapd && [bugsA, storiesA, tasksA].some((result) => workspaceFailure(result.error));
				if (workspaceBlockedTapd) {
					setClis((prev) =>
						prev === null || typeof prev !== 'object'
							? prev
							: {
									...prev,
									tapd: {
										...prev.tapd,
										auth: {
											...(prev.tapd?.auth ?? {}),
											state: 'authorized',
											method: 'token',
											workspace: { state: 'missing', id: '' },
										},
									},
								}
					);
				}
				setData({
					bugs: bugs ?? [],
					stories: stories ?? [],
					tasks: tasks ?? [],
					wecomTodos: wecomTodos ?? [],
					authBlocked: { tapd: authBlockedTapd, wecom: authBlockedWecom },
					workspaceBlocked: { tapd: workspaceBlockedTapd },
					errors: {
						bugs: bugsA.error ?? null,
						stories: storiesA.error ?? null,
						tasks: tasksA.error ?? null,
						wecomTodos: wecomTodosA.error ?? null,
					},
				});
				/* A row that says "status_3" or "new" reads as a bug in the
				 * panel, so resolve both workflows once per refresh. This runs
				 * after paint and re-renders the rows with Chinese labels. */
				if (useTapd) {
					void (async () => {
						const typeId = String(stories?.[0]?.raw?.workitem_type_id ?? '');
						setTapdTypeId(typeId);
						const [storyMap, bugMap] = await Promise.all([
							tapdStatusMap('story', typeId === '' ? null : { workitem_type_id: typeId }, typeId),
							tapdStatusMap('bug', null, typeId),
						]);
						const toNames = (pairs) => Object.fromEntries(pairs.map((pair) => [pair.id, pair.name]));
						setStatusNames({
							story: toNames(storyMap.pairs),
							bug: toNames(bugMap.pairs),
							task: toNames(TASK_STATUSES),
						});
					})();
				}
				setLoadedAt(Date.now());
				setBoot({ phase: 'ready', serviceError: null });
			} catch (error) {
				setBoot({ phase: 'error', serviceError: String(error?.message ?? error) });
			} finally {
				setRefreshing(false);
			}
		}, []);

		React.useEffect(() => {
			void load();
		}, [load]);

		/* ---- Login ---------------------------------------------------- *
		 * Three host routes back this section: start a login, poll the state
		 * of the QR flow, and fetch the QR image itself. tapd authenticates
		 * with an Access Token (nothing runs in the background); wecom owns
		 * a login process the host tracks. Every request is best effort: a
		 * missing route or an absent CLI surfaces as text in the banner,
		 * never as a thrown render error. */

		/* The success line is a confirmation, not a permanent fixture: every
		 * resolved row folds itself away a few seconds after the login lands.
		 * One timer for all rows — a second login simply re-arms it. */
		const armAuthHide = React.useCallback(() => {
			if (authHideTimerRef.current !== null) {
				try {
					clearTimeout(authHideTimerRef.current);
				} catch (error) {
					/* no timer scope */
				}
			}
			authHideTimerRef.current = setTimeout(() => {
				authHideTimerRef.current = null;
				setAuthFlow((prev) => {
					let changed = false;
					const next = { ...prev };
					for (const key of CLI_ORDER) {
						if (next?.[key]?.phase === 'authorized') {
							next[key] = { phase: 'idle' };
							changed = true;
						}
					}
					return changed ? next : prev;
				});
			}, LOGIN_DONE_HOLD_MS);
		}, []);

		React.useEffect(
			() => () => {
				if (authHideTimerRef.current === null) return;
				try {
					clearTimeout(authHideTimerRef.current);
				} catch (error) {
					/* already gone */
				}
				authHideTimerRef.current = null;
			},
			[]
		);

		const startLogin = React.useCallback(
			async (cli, credentials) => {
				const method = cli === 'tapd' ? 'token' : 'qr';
				setAuthBusy((prev) => ({ ...prev, [cli]: true }));
				setAuthQrBroken(false);
				setAuthFlow((prev) => ({ ...prev, [cli]: { phase: 'starting', method, qr: null, message: null, log: [] } }));
				try {
					const payload = await callLogin(cli, credentials ?? {});
					const log = Array.isArray(payload.log) ? payload.log.slice(-6).map(String) : [];
					if (payload.needsToken === true) {
						setAuthFlow((prev) => ({
							...prev,
							[cli]: { phase: 'needsToken', method: 'token', qr: null, message: String(payload.message ?? '需要 Access Token'), log },
						}));
						/* Without a token the only useful action is typing one
						 * in, so put the caret there — no error, no toast. */
						try {
							tokenInputRef.current?.focus?.();
						} catch (error) {
							/* ref is not mounted yet; the field is still usable */
						}
						return;
					}
					if (cli === 'wecom' && payload.state === 'running') {
						const qr =
							typeof payload.qr === 'string' && payload.qr !== ''
								? payload.qr
								: `${LOGIN_QR_PATH}?cli=wecom&t=${Date.now()}`;
						setAuthFlow((prev) => ({
							...prev,
							[cli]: { phase: 'running', method, qr, message: payload.message === undefined ? null : String(payload.message), log },
						}));
						return;
					}
					if (payload.state === 'authorized') {
						setAuthTokens((prev) => ({ ...prev, [cli]: '' }));
						setAuthFlow((prev) => ({ ...prev, [cli]: { phase: 'authorized', method, qr: null, message: '已登录', log } }));
						armAuthHide();
						await load();
						return;
					}
					setAuthFlow((prev) => ({
						...prev,
						[cli]: { phase: 'failed', method, qr: null, message: String(payload.message ?? payload.error ?? '登录未完成'), log },
					}));
				} catch (error) {
					setAuthFlow((prev) => ({
						...prev,
						[cli]: { phase: 'failed', method, qr: null, message: String(error?.message ?? error), log: [] },
					}));
				} finally {
					setAuthBusy((prev) => ({ ...prev, [cli]: false }));
				}
			},
			[load, armAuthHide]
		);

		const ensureLogin = React.useCallback(
			(cli) => {
				if (autoLoginRef.current[cli] === true) return false;
				autoLoginRef.current[cli] = true;
				void startLogin(cli, {});
				return true;
			},
			[startLogin]
		);

		/* Auto-start: an installed but unauthenticated CLI gets one login
		 * attempt without the user hunting for a button. tapd answers
		 * needsToken, which only moves the caret to its token field. */
		React.useEffect(() => {
			if (clis === null) return;
			for (const cli of CLI_ORDER) {
				const entry = clis?.[cli] ?? null;
				if (entry === null || typeof entry !== 'object') continue;
				if (entry.available !== true) continue;
				if (entry.auth?.state !== 'unauthorized') continue;
				ensureLogin(cli);
			}
		}, [clis, ensureLogin]);

		/* tapd has credentials but no workspace id: fetch the project list
		 * once (the host switches by itself when there is exactly one) and let
		 * the user pick when there are several. */
		const tapdWorkspaceMissing =
			clis?.tapd?.available === true &&
			clis?.tapd?.auth?.state === 'authorized' &&
			clis?.tapd?.auth?.workspace?.state === 'missing';
		React.useEffect(() => {
			if (!tapdWorkspaceMissing) return undefined;
			let alive = true;
			void (async () => {
				try {
					const payload = await callLogin('tapd', { action: 'list-workspaces' });
					if (!alive) return;
					const list = Array.isArray(payload?.workspaces)
						? payload.workspaces
								.map((item) =>
									item === null || typeof item !== 'object'
										? null
										: { id: String(item.id ?? ''), name: String(item.name ?? item.id ?? '') }
								)
								.filter((item) => item !== null && item.id !== '')
						: [];
					setTapdWorkspaces(list);
					// The host switched to the only project; re-read the status.
					if (payload?.workspace?.state === 'configured') await load();
				} catch (error) {
					if (alive) setTapdWorkspaces([]);
				}
			})();
			return () => {
				alive = false;
			};
		}, [tapdWorkspaceMissing, load]);

		const chooseTapdWorkspace = React.useCallback(
			async (workspaceId) => {
				const id = String(workspaceId ?? '').trim();
				if (id === '') return;
				setWorkspaceBusy(true);
				try {
					const payload = await callLogin('tapd', { workspaceId: id });
					if (payload?.ok === true) {
						setAuthFlow((prev) => ({
							...prev,
							tapd: { phase: 'authorized', method: 'token', qr: null, message: '已选择 TAPD 项目', log: [] },
						}));
						await load();
					} else {
						setAuthFlow((prev) => ({
							...prev,
							tapd: {
								phase: 'failed',
								method: 'token',
								qr: null,
								message: String(payload?.message ?? '切换 TAPD 项目失败'),
								log: [],
							},
						}));
					}
				} catch (error) {
					setAuthFlow((prev) => ({
						...prev,
						tapd: { phase: 'failed', method: 'token', qr: null, message: String(error?.message ?? error), log: [] },
					}));
				} finally {
					setWorkspaceBusy(false);
				}
			},
			[load]
		);

		/* Refresh is its own action, not a reload: the user asked for the
		 * defect list, so only the defect list is re-read. Everything else
		 * (stories, wecom, status names) keeps its current frame, which also
		 * keeps the open detail from flickering. */
		const refreshBugs = React.useCallback(async () => {
			const seq = bugSyncSeq.current + 1;
			bugSyncSeq.current = seq;
			setBugSync({ phase: 'loading', at: null, error: null });
			if (live.tapd !== true) {
				/* Demo data cannot change, but the interaction must: the same
				 * pending state, the same toast, so the affordance is honest
				 * before a CLI is installed. */
				await new Promise((resolve) => setTimeout(resolve, 520));
				if (bugSyncSeq.current !== seq) return undefined;
				setBugSync({ phase: 'idle', at: Date.now(), error: null });
				showToast('演示数据：已重新读取缺陷列表');
				return undefined;
			}
			try {
				const run = await todoAll('tapd', 'bug', 20000);
				if (bugSyncSeq.current !== seq) return undefined;
				if (run.error !== undefined) {
					setBugSync({ phase: 'error', at: null, error: String(run.error) });
					return undefined;
				}
				const workspaceId = String(clis?.tapd?.auth?.workspace?.id ?? '');
				const bugs = asList(run.value).map((raw) => normTapdItem(raw, 'bug')).map((item) =>
					item.url === '' ? { ...item, url: tapdItemUrl(workspaceId, 'bug', item.id) } : item
				);
				setData((prev) => (prev === null ? prev : { ...prev, bugs, errors: { ...prev.errors, bugs: null } }));
				setBugSync({ phase: 'idle', at: Date.now(), error: null });
				showToast(`已同步 ${bugs.length} 项缺陷`);
				return undefined;
			} catch (error) {
				if (bugSyncSeq.current !== seq) return undefined;
				setBugSync({ phase: 'error', at: null, error: String(error?.message ?? error) });
				return undefined;
			}
		}, [clis, live.tapd, showToast]);

		/* Escape closes the nearest layer (menu, then detail); a click outside
		 * the project control closes the menu. Both listeners are attached only
		 * while something is open, so the page is inert the rest of the time. */
		React.useEffect(() => {
			if (projectMenuOpen === false && inspectorKey === '') return undefined;
			const onKey = (event) => {
				if (event.key !== 'Escape') return;
				if (projectMenuOpen) {
					setProjectMenuOpen(false);
					return;
				}
				setInspectorKey('');
			};
			const onDown = (event) => {
				const root = projectControlRef.current;
				if (root === null || root.contains(event.target)) return;
				setProjectMenuOpen(false);
			};
			document.addEventListener('keydown', onKey);
			document.addEventListener('pointerdown', onDown, true);
			return () => {
				document.removeEventListener('keydown', onKey);
				document.removeEventListener('pointerdown', onDown, true);
			};
		}, [projectMenuOpen, inspectorKey]);

		/* The segmented control's sliding plate is positioned from the live
		 * button geometry, so it survives font loading, zoom, and a width the
		 * CSS could not have known. */
		React.useEffect(() => {
			const bar = segRef.current;
			const plate = plateRef.current;
			if (bar === null || plate === null) return;
			const active = bar.querySelector('.lgwsp-segment.lgwsp-is-active');
			if (active === null) return;
			plate.style.width = `${active.offsetWidth}px`;
			plate.style.transform = `translateX(${active.offsetLeft}px)`;
		}, [tab, clis]);

		/* The project list behind the toolbar switcher. `workspace list` is a
		 * plain run, not the login assist: the assist deliberately returns an
		 * empty list once a project is configured, and the switcher must show
		 * every project the token can reach — including the active one. */
		const tapdAuthorized = clis?.tapd?.available === true && clis?.tapd?.auth?.state === 'authorized';
		React.useEffect(() => {
			if (!tapdAuthorized) return undefined;
			let alive = true;
			void (async () => {
				const run = await attempt('tapd', ['workspace', 'list'], 20000);
				if (!alive) return;
				if (run.error !== undefined) {
					setProjects([]);
					return;
				}
				const items = firstOf(run.value, ['items']);
				const list = Array.isArray(items)
					? items
							.map((item) =>
								item === null || typeof item !== 'object'
									? null
									: { id: String(item.id ?? ''), name: String(item.name ?? item.id ?? '') }
							)
							.filter((item) => item !== null && item.id !== '')
					: [];
				setProjects(list);
			})();
			return () => {
				alive = false;
			};
		}, [tapdAuthorized, loadedAt]);

		/* 打开详情时补齐完整记录：`todo` 列表经常不带描述字段，详情面板首次
		 * 打开时拉一次 `tapd <kind> show <id>`，结果按 key 缓存（每个工作项
		 * 最多取一次；列表刷新不重取——描述不是状态，不会自己变化）。 */
		React.useEffect(() => {
			if (inspectorKey === '' || !live.tapd) return undefined;
			const sep = inspectorKey.indexOf(':');
			const kind = inspectorKey.slice(0, sep);
			const id = inspectorKey.slice(sep + 1);
			if (!isTapdKind(kind) || id === '') return undefined;
			if (details[inspectorKey] !== undefined) return undefined;
			let alive = true;
			setDetails((prev) =>
				prev[inspectorKey] === undefined ? { ...prev, [inspectorKey]: { phase: 'loading', raw: null } } : prev
			);
			void (async () => {
				const run = await attempt('tapd', [kind, 'show', id], 30000);
				if (!alive) return;
				if (run.error !== undefined) {
					setDetails((prev) => ({ ...prev, [inspectorKey]: { phase: 'error', error: String(run.error), raw: null } }));
					return;
				}
				setDetails((prev) => ({ ...prev, [inspectorKey]: { phase: 'done', raw: detailFromShow(run.value, id) } }));
			})();
			return () => {
				alive = false;
			};
		}, [inspectorKey, live.tapd, details]);

		/* 描述里是净化过的外部 HTML，所以用两个容器级守卫代替逐节点绑定：
		 * 捕获阶段的 error 监听把加载失败的 <img> 换成指向原图的链接；点击
		 * 图片或链接一律交给真实浏览器打开（应用壳不能被带走到别的页面）。 */
		React.useEffect(() => {
			const node = richRef.current;
			if (node === null) return undefined;
			const onError = (event) => {
				const image = event.target;
				if (!(image instanceof Element) || image.tagName !== 'IMG') return;
				/* 代理失败时把用户送到原图：浏览器整页导航会带上 tapd 的
				 * 会话 cookie，人点得开机器加载不出的那张图。 */
				const url = image.getAttribute('data-rich-href') ?? image.getAttribute('src') ?? '';
				const link = document.createElement('a');
				link.className = 'lgwsp-rich-broken-img';
				link.textContent = image.getAttribute('alt') || '图片加载失败';
				if (/^https?:/i.test(url)) link.href = url;
				image.replaceWith(link);
			};
			const onClick = (event) => {
				const target = event.target instanceof Element ? event.target.closest('a, img') : null;
				if (target === null) return;
				event.preventDefault();
				/* 图片的 src 已经是同源代理；data-rich-href 才是用户在浏览器
				 * 里真正想看的原图地址。 */
				const url =
					target.getAttribute('data-rich-href') ??
					(target.tagName === 'IMG' ? target.getAttribute('src') : target.getAttribute('href')) ??
					'';
				if (/^(https?:|mailto:)/i.test(url)) void openExternal(url);
			};
			node.addEventListener('error', onError, true);
			node.addEventListener('click', onClick);
			return () => {
				node.removeEventListener('error', onError, true);
				node.removeEventListener('click', onClick);
			};
		}, [inspectorKey, details]);

		/* wecom scan: poll the host while the QR flow runs. The interval is
		 * torn down when the panel unmounts, when the flow leaves 'running',
		 * and on every tab switch (the banner is shared by all tabs, so a
		 * fresh timer re-arms there). */
		const wecomPhase = authFlow?.wecom?.phase ?? null;
		React.useEffect(() => {
			if (wecomPhase !== 'running') return undefined;
			let alive = true;
			let misses = 0;
			const poll = async () => {
				try {
					const payload = await callLoginState('wecom');
					if (!alive) return;
					misses = 0;
					const state = String(payload?.state ?? 'unknown');
					const log = Array.isArray(payload?.log) ? payload.log.slice(-6).map(String) : [];
					if (state === 'authorized') {
						setAuthFlow((prev) => ({ ...prev, wecom: { phase: 'authorized', method: 'qr', qr: null, message: '已登录', log: [] } }));
						armAuthHide();
						await load();
						return;
					}
					if (state === 'failed' || state === 'unauthorized') {
						setAuthFlow((prev) => ({
							...prev,
							wecom: {
								phase: 'failed',
								method: 'qr',
								qr: null,
								message: state === 'failed' ? '扫码登录失败' : '二维码已过期或未完成扫码，请重新登录',
								log,
							},
						}));
						return;
					}
					/* still running (or idle between spawn and first output) */
					setAuthFlow((prev) => ({
						...prev,
						wecom: {
							phase: 'running',
							method: 'qr',
							qr: prev?.wecom?.qr ?? (typeof payload?.qr === 'string' ? payload.qr : null),
							message: prev?.wecom?.message ?? null,
							log,
						},
					}));
				} catch (error) {
					/* A dead route must not spin forever: give up after a
					 * minute of consecutive misses and say so. */
					misses += 1;
					if (alive && misses >= 30) {
						setAuthFlow((prev) => ({
							...prev,
							wecom: { phase: 'failed', method: 'qr', qr: null, message: '无法获取扫码状态，请重新登录', log: [] },
						}));
					}
				}
			};
			const timer = setInterval(() => void poll(), LOGIN_POLL_MS);
			void poll();
			return () => {
				alive = false;
				clearInterval(timer);
			};
		}, [wecomPhase, tab, load, armAuthHide]);

		/* One-click install of a missing CLI. The host performs the install
		 * (npm for wecom, a checksum-verified GitHub download for tapd); the
		 * panel only tracks progress and the tail of the log it reports. */
		const [installBusy, setInstallBusy] = React.useState({ tapd: false, wecom: false });
		const [installNotes, setInstallNotes] = React.useState({ tapd: null, wecom: null }); // { ok, text }
		const install = React.useCallback(
			async (cli) => {
				setInstallBusy((prev) => ({ ...prev, [cli]: true }));
				setInstallNotes((prev) => ({ ...prev, [cli]: null }));
				try {
					const payload = await callInstall(cli);
					const seconds = Math.round((payload.durationMs ?? 0) / 100) / 10;
					setInstallNotes((prev) => ({ ...prev, [cli]: { ok: true, text: `已安装 ${payload.command ?? ''}（${seconds}s）— 正在准备登录` } }));
					if (payload.clis !== null && typeof payload.clis === 'object') setClis(payload.clis);
					/* Install and authenticate as one action: the user asked to
					 * be done after one click, not to go hunting for a login. */
					ensureLogin(cli);
					await load();
				} catch (error) {
					setInstallNotes((prev) => ({ ...prev, [cli]: { ok: false, text: String(error?.message ?? error) } }));
				} finally {
					setInstallBusy((prev) => ({ ...prev, [cli]: false }));
				}
			},
			[load, ensureLogin]
		);
		const installBlock = (cli, title, hint) =>
			h(
				'div',
				{ className: 'lgws-demoCol' },
				h('div', null, title),
				h('div', { className: 'lgws-mono' }, hint),
				cli === 'tapd' ? h('div', { className: 'lgws-mono' }, clis?.tapd?.credentialsHint ?? '') : null,
				h(
					'div',
					{ className: 'lgws-demoRow' },
					h(
						'button',
						{
							className: 'lgws-installButton',
							onClick: () => void install(cli),
							disabled: installBusy[cli],
						},
						installBusy[cli] ? '安装中…' : '一键安装'
					),
					h('button', { className: 'lgws-rowButton', onClick: () => copyText(hint) }, '复制命令'),
					h('span', { className: 'lgws-installHint' }, '安装完成后会自动开始登录')
				),
				installNotes[cli] !== null && installNotes[cli] !== undefined
					? h(
							'div',
							{ className: `lgws-installNote${installNotes[cli].ok ? '' : ' lgws-installNoteError'}` },
							installNotes[cli].text
						)
					: null
			);

		// Derived collections. In demo mode the sample data stands in for the
		// missing CLI, per-CLI, so a machine with only tapd installed still
		// shows its real bugs next to demo wecom rows — each clearly labelled.
		const bugList = React.useMemo(() => {
			if (data === null) return null;
			const list = demoTapd ? DEMO.tapd.bugs : data.bugs;
			return [...list].sort((a, b) => {
				const rank = (item) => (SEVERITY_RANK[item.severity] ?? 9);
				return rank(a) - rank(b);
			});
		}, [data, demoTapd]);
		const storyList = React.useMemo(() => {
			if (data === null) return null;
			if (demoTapd) return DEMO.tapd.todos.filter((item) => item.kind === 'story');
			return [...data.stories, ...data.tasks];
		}, [data, demoTapd]);
		const wecomTodoList = React.useMemo(
			() => (data === null ? null : demoWecom ? DEMO.wecom.todos : data.wecomTodos),
			[data, demoWecom]
		);
		const attentionList = React.useMemo(() => {
			if (bugList === null || storyList === null || wecomTodoList === null) return null;
			const all = [...bugList, ...storyList];
			return all.filter(needsAttention).slice(0, 6);
		}, [bugList, storyList, wecomTodoList]);
		const myBugs = React.useMemo(
			() => (bugList === null ? null : bugList.filter((item) => !item.status.includes('关闭') && !item.status.includes('关闭') && item.status !== 'closed' && item.status !== 'resolved')),
			[bugList]
		);
		const todayList = React.useMemo(() => {
			if (storyList === null || wecomTodoList === null) return null;
			const merged = [...storyList, ...wecomTodoList];
			return merged.sort((a, b) => (a.due ?? Number.MAX_SAFE_INTEGER) - (b.due ?? Number.MAX_SAFE_INTEGER));
		}, [storyList, wecomTodoList]);

		const openCase = async (item) => {
			setSessionNotes((notes) => ({ ...notes, [item.id]: '正在选择目录…' }));
			try {
				const result = await openCaseWorkspace();
				setSessionNotes((notes) => ({
					...notes,
					[item.id]: result === null ? null : `会话已开启：${result.path}`,
				}));
				if (result !== null) void load();
			} catch (error) {
				setSessionNotes((notes) => ({ ...notes, [item.id]: `开启失败：${String(error?.message ?? error)}` }));
			}
		};

		const searchDocs = async () => {
			const query = docQuery.trim();
			if (query === '') return;
			setDocs(null);
			setDocError(null);
			if (demoWecom) {
				setDocs(DEMO.wecom.docs);
				return;
			}
			const keywords = query.split(/\s+/).filter(Boolean);
			// `--keywords` keeps the query in argv; the old `--json '{…}'` form
			// put quotes in the argument, which any cmd.exe fallback would have
			// to refuse.
			const run = await attempt('wecom', ['doc', 'search', '--keywords', ...keywords, '--limit', '10']);
			if (run.error !== undefined) {
				setDocError(run.error);
				return;
			}
			const hint = cliFailureHint(run.value);
			if (hint !== null) {
				setDocError(hint);
				return;
			}
			const list = asList(run.value).map(normDoc);
			setDocs(list.length > 0 ? list : []);
		};

		const runConsole = async () => {
			const text = consoleInput.trim();
			if (text === '') return;
			if (consoleCli === 'tapd' ? demoTapd : demoWecom) {
				setConsoleResult({ error: 'CLI 未安装，无法执行。请先按上方指引安装。' });
				return;
			}
			const args = text.split(/\s+/).filter(Boolean);
			setConsoleBusy(true);
			setConsoleResult(null);
			const run = await callRun(consoleCli, args).catch((error) => ({ ok: false, error: String(error?.message ?? error) }));
			setConsoleBusy(false);
			if (run.ok === false) {
				setConsoleResult({ error: String(run.error) });
				return;
			}
			setConsoleResult({
				cli: consoleCli,
				command: `${consoleCli} ${args.join(' ')}`,
				exitCode: run.exitCode,
				durationMs: run.durationMs,
				value: run.stdout?.json ? run.stdout.value : run.stdout?.value ?? '',
				stderr: run.stderr ?? '',
			});
			void load();
		};

		/* ---- login presentation ------------------------------------ */

		/* The banner is a consequence of state, not another modal: a row
		 * appears exactly while its CLI is installed and unresolved, and
		 * folds away on its own the moment the login lands. */
		const authRowVisible = (cli) => {
			const entry = clis?.[cli] ?? null;
			if (entry === null || typeof entry !== 'object') return false;
			if (entry.available !== true) return false;
			const phase = String(authFlow?.[cli]?.phase ?? '');
			/* `authorized` is deliberately absent: a finished login is a state
			 * the status call already reports, and a row that stays on screen
			 * afterwards keeps saying 需要登录 over an account that is logged in. */
			if (phase === 'starting' || phase === 'running' || phase === 'needsToken' || phase === 'failed') return true;
			// Credentials are fine but tapd still has no project: the row turns
			// into a workspace picker instead of disappearing.
			if (cli === 'tapd' && entry.auth?.state === 'authorized' && entry.auth?.workspace?.state === 'missing') return true;
			return entry.auth?.state === 'unauthorized';
		};

		const authNote = (cli) => {
			const flow = authFlow?.[cli] ?? null;
			const phase = String(flow?.phase ?? '');
			const entry = clis?.[cli] ?? null;
			if (phase === 'starting') return '正在准备登录…';
			if (phase === 'running') return authQrBroken ? null : '请用企业微信扫码，扫码成功后自动完成';
			if (phase === 'needsToken') return String(flow?.message ?? '需要 Access Token');
			if (phase === 'authorized') return '已登录';
			if (phase === 'failed') return String(flow?.message ?? '登录未完成');
			if (entry?.auth?.state === 'unauthorized') return 'CLI 已安装，但还没有完成身份验证';
			return null;
		};

		/* A TAPD login needs a token before it can start, so clicking 登录 with
		 * nothing filled in would only produce an error. Open the page where
		 * that token is created instead, and say so in the row. */
		const needsTapdToken = (cli) =>
			cli === 'tapd' &&
			clis?.[cli]?.auth?.state !== 'authorized' &&
			String(authTokens?.[cli] ?? '').trim() === '' &&
			String(authApiUsers?.[cli] ?? '').trim() === '' &&
			String(authApiPasswords?.[cli] ?? '') === '';

		const submitLogin = (cli) => {
			if (needsTapdToken(cli)) {
				void openExternal(TAPD_TOKEN_URL).then((opened) => {
					setAuthFlow((prev) => ({
						...prev,
						[cli]: {
							phase: 'needsToken',
							message: opened
								? '已打开 TAPD 个人令牌页：创建后把令牌粘贴到左边输入框，再点「用 Token 登录」'
								: '请打开 TAPD「个人设置 → 个人令牌」创建 Access Token 后粘贴到左边输入框',
						},
					}));
					try {
						tokenInputRef?.current?.focus?.();
					} catch {
						/* focus is a nicety */
					}
				});
				return;
			}
			return startLogin(cli, {
				token: String(authTokens?.[cli] ?? '').trim(),
				apiUser: String(authApiUsers?.[cli] ?? '').trim(),
				apiPassword: String(authApiPasswords?.[cli] ?? ''),
			});
		};

		/* The section-level answer to `authentication_required`: one line with
		 * the action, never the CLI's raw JSON. */
		const renderAuthBlocked = (cli) => {
			const label = cli === 'tapd' ? 'TAPD' : '企业微信';
			const hint = cli === 'tapd' ? '填入 Access Token 后即可拉取数据' : '扫码登录后即可拉取数据';
			const busy = authBusy?.[cli] === true;
			return h(
				'div',
				{ className: 'lgws-authInline' },
				h(
					'div',
					{ className: 'lgws-authInlineText' },
					h('span', { className: 'lgws-authInlineName' }, `${label} 尚未登录`),
					h('span', { className: 'lgws-authInlineHint' }, hint)
				),
				h(
					'button',
					{ className: 'lgws-authButton', disabled: busy, onClick: () => void submitLogin(cli) },
					busy ? '登录中…' : '登录'
				)
			);
		};

		const renderAuthRow = (cli) => {
			const entry = clis?.[cli] ?? null;
			const flow = authFlow?.[cli] ?? null;
			const phase = String(flow?.phase ?? '');
			const auth = entry?.auth ?? null;
			const token = String(authTokens?.[cli] ?? '');
			const apiUser = String(authApiUsers?.[cli] ?? '');
			const apiPassword = String(authApiPasswords?.[cli] ?? '');
			const busy = authBusy?.[cli] === true;
			const label = cli === 'tapd' ? 'TAPD' : '企业微信';
			const detail =
				typeof auth?.detail === 'string' && auth.detail !== ''
					? auth.detail
					: cli === 'tapd'
						? '需要 Access Token'
						: '需要扫码登录';
			const note = authNote(cli);
			const log = Array.isArray(flow?.log) ? flow.log : [];
			const qrDead = phase === 'running' && authQrBroken;
			const running = phase === 'running' && !qrDead;
			const showQr = running && typeof flow?.qr === 'string' && flow.qr !== '';
			/* Credentials are in place but tapd has no workspace id yet: it
			 * cannot run a single list command until one is chosen. */
			const pickWorkspace = cli === 'tapd' && auth?.state === 'authorized' && auth?.workspace?.state === 'missing';
			const workspaceOptions = pickWorkspace && Array.isArray(tapdWorkspaces) ? tapdWorkspaces : [];
			let buttonLabel = '登录';
			if (busy) buttonLabel = '登录中…';
			else if (running) buttonLabel = '等待扫码…';
			else if (qrDead || phase === 'authorized' || pickWorkspace) buttonLabel = '重新登录';
			else if (cli === 'tapd' && token.trim() !== '') buttonLabel = '用 Token 登录';
			else if (cli === 'tapd' && apiUser.trim() !== '' && apiPassword !== '') buttonLabel = '用 API 账号登录';
			const workspaceNote = pickWorkspace
				? workspaceOptions.length > 1
					? '选择 TAPD 项目后即可拉取数据'
					: workspaceOptions.length === 0
						? '正在读取 TAPD 项目…'
						: '正在切换到唯一的 TAPD 项目…'
				: null;
			return h(
				'div',
				{ className: `lgws-authRow${pickWorkspace ? ' lgws-authRowPick' : ''}`, key: `auth-${cli}` },
				h(
					'div',
					{ className: 'lgws-authText' },
					h('div', { className: 'lgws-authName' }, label),
					h('div', { className: 'lgws-authDetail' }, workspaceNote ?? detail),
					pickWorkspace
						? h(
								'select',
								{
									className: 'lgws-wsSelect',
									key: 'workspace',
									value: '',
									disabled: workspaceBusy === true || workspaceOptions.length < 2,
									'aria-label': 'TAPD 项目',
									onChange: (event) => {
										const id = String(event.target.value ?? '');
										if (id !== '') void chooseTapdWorkspace(id);
									},
								},
								[
									h('option', { value: '', key: 'placeholder' }, workspaceOptions.length > 1 ? '选择 TAPD 项目…' : '读取中…'),
									...workspaceOptions.map((item) => h('option', { value: item.id, key: item.id }, item.name || item.id)),
								]
							)
						: null
				),
				cli === 'tapd' && !pickWorkspace
					? h('div', { className: 'lgws-authFields', key: 'credential-fields' }, [
							h('input', {
								className: 'lgws-authInput',
								key: 'token',
								type: 'password',
								autoComplete: 'off',
								spellCheck: false,
								placeholder: 'Access Token',
								'aria-label': 'TAPD Access Token',
								value: token,
								ref: tokenInputRef,
								onChange: (event) => {
									const value = event.target.value;
									setAuthTokens((prev) => ({ ...prev, [cli]: value }));
								},
								onKeyDown: (event) => {
									if (event.key === 'Enter') void submitLogin(cli);
								},
							}),
							h('input', {
								className: 'lgws-authInput',
								key: 'api-user',
								type: 'text',
								autoComplete: 'off',
								spellCheck: false,
								placeholder: 'API 账号（可选）',
								'aria-label': 'TAPD API 账号',
								value: apiUser,
								onChange: (event) => {
									const value = event.target.value;
									setAuthApiUsers((prev) => ({ ...prev, [cli]: value }));
								},
								onKeyDown: (event) => {
									if (event.key === 'Enter') void submitLogin(cli);
								},
							}),
							h('input', {
								className: 'lgws-authInput',
								key: 'api-password',
								type: 'password',
								autoComplete: 'off',
								spellCheck: false,
								placeholder: 'API 口令（可选）',
								'aria-label': 'TAPD API 口令',
								value: apiPassword,
								onChange: (event) => {
									const value = event.target.value;
									setAuthApiPasswords((prev) => ({ ...prev, [cli]: value }));
								},
								onKeyDown: (event) => {
									if (event.key === 'Enter') void submitLogin(cli);
								},
							}),
							h(
								'div',
								{ className: 'lgws-authHint', key: 'hint' },
								h(
									'button',
									{
										className: 'lgws-authLink',
										key: 'token-page',
										type: 'button',
										onClick: () => void openExternal(TAPD_TOKEN_URL),
										title: TAPD_TOKEN_URL,
									},
									'去创建 Access Token ↗'
								),
								h(
									'span',
									{ className: 'lgws-authHintText', key: 'hint-text' },
									'TAPD「个人设置 → 个人令牌」页打开后，新建一个令牌、复制到上面的输入框即可；细节看 ',
									h('a', { href: TAPD_TOKEN_DOC_URL, target: '_blank', rel: 'noreferrer' }, '开放平台文档'),
									'。公司管理员也可在「公司管理 → 开放集成」生成长期有效的 API 账号/口令。'
								)
							),
						])
					: null,
				h(
					'button',
					{ className: 'lgws-authButton', disabled: busy || running, onClick: () => void submitLogin(cli) },
					buttonLabel
				),
				showQr
					? h('img', {
							className: 'lgws-authQr',
							src: flow.qr,
							alt: '企业微信登录二维码',
							width: 180,
							height: 180,
							onError: () => setAuthQrBroken(true),
						})
					: null,
				note === null ? null : h('div', { className: `lgws-authNote${phase === 'failed' ? ' lgws-authNoteError' : ''}` }, note),
				qrDead ? h('div', { className: 'lgws-authNote lgws-authNoteError' }, '二维码加载失败，请点重新登录') : null,
				log.length === 0 ? null : h('pre', { className: 'lgws-authLog' }, log.join('\n'))
			);
		};

		/* ---- render ------------------------------------------------ */

		/* The page is an instrument panel, not a document: one ambient light
		 * field sits behind everything and never scrolls, and a single scroll
		 * surface carries the chrome. Glass on glass is forbidden, so the
		 * ambient field is a gradient — not a blurred element — and only
		 * floating instruments (toolbar pill, menu, dialogs) get material. */
		const pageShell = (children, variation) =>
			h(
				'div',
				{ className: 'lgws-page' },
				h('div', { className: 'lgws-ambient', 'aria-hidden': 'true' }),
				h('div', { className: `lgws-scroll${variation === undefined ? '' : ` ${variation}`}` }, children)
			);

		if (boot.phase === 'loading' && clis === null) {
			return pageShell(h('div', { className: 'lgws-loading' }, h(Spinner), '正在连接工作空间服务…'), 'lgws-scrollCenter');
		}
		if (boot.phase === 'error') {
			return pageShell(
				h(
					'div',
					{ className: 'lgws-card lgws-cardError' },
					h('div', { className: 'lgws-cardTitle' }, '工作空间服务不可用'),
					h(
						'p',
						null,
						'无法访问插件的宿主路由。如果你刚刚更新了本插件，请完全退出并重新打开 DeepSeek Harness，让宿主端加载新版模块，然后刷新页面。'
					),
					h('p', { className: 'lgws-mono' }, String(boot.serviceError)),
					h('button', { className: 'lgws-buttonPrimary', onClick: () => void load() }, '重试')
				),
				'lgws-scrollCenter'
			);
		}

		/* Rows carry workflow codes; statusNames stays empty until the
		 * workflow request lands, so fall back to the code itself. */
		const statusLabel = (kind, code) => {
			const names = statusNames[kind];
			if (names === undefined || code === '') return code;
			return names[code] ?? code;
		};

		const counts = {
			bugs: myBugs === null ? '—' : String(myBugs.length),
			stories: storyList === null ? '—' : String(storyList.length),
			wecom: wecomTodoList === null ? '—' : String(wecomTodoList.length),
			attention: attentionList === null ? '—' : String(attentionList.length),
		};
		const updatedText = loadedAt === null ? '' : new Date(loadedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
		const authRowCli = CLI_ORDER.filter((cli) => authRowVisible(cli));
		/* The banner's own title said 需要登录 even while a row was showing a
		 * project picker or a just-finished login. Read it off the rows. */
		const authRowTitle = (() => {
			if (authRowCli.length === 0) return '';
			if (authRowCli.some((cli) => clis?.[cli]?.auth?.workspace?.state === 'missing')) return '选择 TAPD 项目';
			if (authRowCli.every((cli) => clis?.[cli]?.auth?.state === 'authorized')) return '已连接';
			return '需要登录';
		})();

		/* The switcher's label needs the project's human name; the host only
		 * returns `{id,name}` pairs, so fall back to the id while the list is
		 * still loading (or when the project is not in it). */
		const projectRows = projects !== null ? projects : tapdWorkspaces;
		const projectId = String(clis?.tapd?.auth?.workspace?.id ?? '');
		const projectName = (() => {
			if (clis?.tapd?.available !== true) return '';
			if (projectId === '') return tapdWorkspaceMissing ? '选择项目' : '未连接';
			const hit = Array.isArray(projectRows) ? projectRows.find((item) => item.id === projectId) : null;
			return hit?.name ?? `项目 ${projectId}`;
		})();

		/* ---- shell ------------------------------------------------------ *
		 * A rail of project spaces, one reading plane, and the in-page
		 * detail. The prototype settled this layout; this is the same
		 * spatial model wired to the real host data.
		 * ----------------------------------------------------------------- */

		const tabDefs = [
			{ id: 'overview', label: '概览', icon: '◎' },
			{ id: 'bugs', label: '缺陷', icon: '◇' },
			{ id: 'stories', label: '需求与任务', icon: '✦' },
			{ id: 'docs', label: '企微协作', icon: '◍' },
			{ id: 'console', label: '执行 CLI', icon: '⌘' },
		];

		const SPACE_PALETTE = ['#5b6cff', '#b257d6', '#12a4a8', '#c47a1c', '#3f8f5f', '#c4513f', '#3d74c4', '#8b6cd8'];
		const spaceColor = (id) => {
			const text = String(id ?? '');
			let hash = 0;
			for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) % 997;
			return SPACE_PALETTE[hash % SPACE_PALETTE.length];
		};
		const spaceGlyph = (name) => {
			const text = String(name ?? '').trim();
			if (text === '') return '·';
			if (/^[A-Za-z]/.test(text)) return text.slice(0, 2).toUpperCase();
			const parts = text.split(/[_\s-]+/).filter(Boolean);
			return (parts.length > 1 ? parts[1] : parts[0]).slice(0, 1);
		};

		const railProjects = Array.isArray(projectRows) ? projectRows : [];
		const activeTab = tabDefs.find((entry) => entry.id === tab) ?? tabDefs[0];

		/* Switching projects is switching data sources: anything in flight
		 * against the old project (a bug sync, an open detail) must not land
		 * on the new one. */
		const selectSpace = (id) => {
			if (id === projectId) return;
			setProjectMenuOpen(false);
			setProjectQuery('');
			setInspectorKey('');
			setRowQuery('');
			setTab('overview');
			bugSyncSeq.current += 1;
			setBugSync({ phase: 'idle', at: null, error: null });
			void chooseTapdWorkspace(id);
		};

		const spaceOption = (item) =>
			h(
				'button',
				{
					key: item.id,
					type: 'button',
					className: `lgwsp-space-option${item.id === projectId ? ' lgwsp-is-active' : ''}`,
					role: 'option',
					'aria-selected': item.id === projectId,
					disabled: workspaceBusy,
					onClick: () => selectSpace(item.id),
				},
				h('span', { className: 'lgwsp-space-avatar', style: { '--space-color': spaceColor(item.id) }, 'aria-hidden': 'true' }, spaceGlyph(item.name || item.id)),
				h(
					'span',
					{ className: 'lgwsp-space-option-copy' },
					h('span', { className: 'lgwsp-space-option-name' }, item.name || item.id),
					h('span', { className: 'lgwsp-space-option-meta' }, item.id)
				),
				item.id === projectId ? h('span', { className: 'lgwsp-space-option-count', 'aria-hidden': 'true' }, '✓') : null
			);

		/* The rail. On a narrow window CSS folds it away and the toolbar's
		 * project control is the only switcher — one control, two renderings. */
		const rail = h(
			'aside',
			{ className: 'lgwsp-space-rail', 'aria-label': '项目空间' },
			h(
				'div',
				{ className: 'lgwsp-rail-brand' },
				h('span', { className: 'lgwsp-rail-mark', 'aria-hidden': 'true' }, '工'),
				h(
					'div',
					{ className: 'lgwsp-rail-brand-text' },
					h('div', { className: 'lgwsp-rail-brand-title' }, PANEL_LABEL),
					h('div', { className: 'lgwsp-rail-brand-subtitle' }, 'today, in context')
				)
			),
			h('div', { className: 'lgwsp-rail-kicker' }, '项目空间'),
			h(
				'div',
				{ className: 'lgwsp-space-list', role: 'listbox', 'aria-label': 'TAPD 项目空间' },
				railProjects.length === 0
					? h('div', { className: 'lgwsp-rail-foot' }, clis?.tapd?.available === true ? '正在读取项目…' : 'tapd-ai-cli 未安装')
					: railProjects.map(spaceOption)
			),
			h('div', { className: 'lgwsp-rail-divider' }),
			h(
				'nav',
				{ className: 'lgwsp-rail-nav', 'aria-label': '工作空间视图' },
				tabDefs.map((entry) =>
					h(
						'button',
						{
							key: entry.id,
							type: 'button',
							className: entry.id === activeTab.id ? 'lgwsp-is-active' : undefined,
							'aria-current': entry.id === activeTab.id ? 'page' : undefined,
							onClick: () => {
								setTab(entry.id);
								setRowQuery('');
							},
						},
						h('span', { className: 'lgwsp-rail-nav-icon', 'aria-hidden': 'true' }, entry.icon),
						entry.label
					)
				)
			),
			h(
				'div',
				{ className: 'lgwsp-rail-foot' },
				h('div', null, demoTapd || demoWecom ? '演示数据 · TAPD / 企业微信' : 'TAPD / 企业微信'),
				h('div', null, '所有详情均在当前页面内展开')
			)
		);

		const projectMenu =
			projectMenuOpen === false
				? null
				: h(
						'div',
						{ className: 'lgwsp-project-menu', role: 'listbox', 'aria-label': '切换项目空间' },
						h('div', { className: 'lgwsp-menu-heading' }, '切换项目空间'),
						h('input', {
							className: 'lgwsp-menu-search',
							value: projectQuery,
							placeholder: '按名称或 ID 过滤',
							'aria-label': '过滤项目',
							onChange: (event) => setProjectQuery(event.target.value),
						}),
						railProjects.length === 0
							? h('div', { className: 'lgwsp-menu-empty' }, '没有可用的项目')
							: h(
									'div',
									{ className: 'lgwsp-menu-options' },
									railProjects
										.filter((item) => {
											const needle = projectQuery.trim().toLowerCase();
											if (needle === '') return true;
											return `${item.name} ${item.id}`.toLowerCase().includes(needle);
										})
										.map((item) =>
											h(
												'button',
												{
													key: item.id,
													type: 'button',
													className: `lgwsp-menu-option${item.id === projectId ? ' lgwsp-is-current' : ''}`,
													role: 'option',
													'aria-selected': item.id === projectId,
													onClick: () => selectSpace(item.id),
												},
												h('span', { className: 'lgwsp-space-avatar', style: { '--space-color': spaceColor(item.id) }, 'aria-hidden': 'true' }, spaceGlyph(item.name || item.id)),
												h(
													'span',
													{ className: 'lgwsp-menu-option-copy' },
													h('span', { className: 'lgwsp-menu-option-name' }, item.name || item.id),
													h('span', { className: 'lgwsp-menu-option-meta' }, item.id)
												),
												item.id === projectId ? h('span', { className: 'lgwsp-menu-check', 'aria-hidden': 'true' }, '✓') : null
											)
										)
								)
					);

		const projectControl = h(
			'div',
			{
				className: 'lgwsp-project-control',
				ref: (node) => {
					projectControlRef.current = node;
				},
			},
			h(
				'button',
				{
					type: 'button',
					className: 'lgwsp-project-trigger',
					id: 'projectTrigger',
					'aria-haspopup': 'listbox',
					'aria-expanded': projectMenuOpen,
					onClick: () => {
						setProjectMenuOpen((open) => !open);
						setProjectQuery('');
					},
				},
				h('span', { className: 'lgwsp-project-glyph', style: { '--space-color': spaceColor(projectId) }, 'aria-hidden': 'true' }, spaceGlyph(projectName)),
				h(
					'span',
					{ className: 'lgwsp-project-copy' },
					h('span', { className: 'lgwsp-project-label' }, '当前项目空间'),
					h('span', { className: 'lgwsp-project-name' }, workspaceBusy ? '正在切换…' : projectName),
					projectId === '' ? null : h('span', { className: 'lgwsp-project-id' }, projectId)
				),
				h('span', { className: 'lgwsp-project-chevron', 'aria-hidden': 'true' }, '⌄')
			),
			projectMenu
		);

		const statusPills = h(
			'div',
			{ className: 'lgwsp-status-pills' },
			h('span', { className: 'lgwsp-status-pill' }, h('span', { className: `lgwsp-status-dot${live.tapd ? ' lgwsp-is-live' : ''}` }), live.tapd ? 'TAPD 已连接' : 'TAPD 演示'),
			h('span', { className: 'lgwsp-status-pill' }, h('span', { className: `lgwsp-status-dot${live.wecom ? ' lgwsp-is-live' : ''}` }), live.wecom ? '企微已连接' : '企微演示'),
			h(
				'button',
				{ className: 'lgwsp-icon-button', id: 'refreshButton', onClick: () => void load(), disabled: refreshing, 'aria-label': '刷新整个工作空间', title: '刷新整个工作空间' },
				refreshing ? h(Spinner) : '↻'
			)
		);

		const syncStamp = bugSync.at === null ? loadedAt : bugSync.at;
		const syncText = syncStamp === null ? '尚未同步' : `更新于 ${new Date(syncStamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;

		/* ---- lists ------------------------------------------------------ */

		const matchesQuery = (item) => {
			const needle = rowQuery.trim().toLowerCase();
			if (needle === '') return true;
			return `${item.title} ${item.id} ${item.owner}`.toLowerCase().includes(needle);
		};

		const bugRows = bugList === null ? null : bugList.filter(matchesQuery);
		const storyRows = storyList === null ? null : storyList.filter(matchesQuery);
		const attentionRows = attentionList === null ? null : attentionList.filter(matchesQuery);
		/* 同一条事项只出现一次：需要关注已经占了的行，今日待办不再重复。 */
		const attentionKeys = new Set((attentionList ?? []).map((item) => `${item.kind}:${item.id}`));
		const todayRows =
			todayList === null
				? null
				: todayList.filter((item) => !attentionKeys.has(`${item.kind}:${item.id}`)).filter(matchesQuery);
		const wecomRows = wecomTodoList === null ? null : wecomTodoList.filter(matchesQuery);

		/* A plain lookup, not a hook: this sits after the early returns for the
		 * loading and error phases, and a hook here would change the hook count
		 * between renders. Finding one item in a few hundred is cheap. */
		const selectedItem = (() => {
			if (inspectorKey === '') return null;
			const pool = [...(bugList ?? []), ...(storyList ?? []), ...(wecomTodoList ?? []), ...(docs ?? [])];
			return pool.find((item) => `${item.kind}:${item.id}` === inspectorKey) ?? null;
		})();

		const openItem = (item) => setInspectorKey(`${item.kind}:${item.id}`);
		const closeItem = () => setInspectorKey('');

		const skeletonRows = (count) =>
			Array.from({ length: count }, (_, index) =>
				h(
					'div',
					{ className: 'lgwsp-item-row lgwsp-skeleton-row', key: `sk-${index}`, 'aria-hidden': 'true' },
					h('span', { className: 'lgwsp-skeleton-avatar' }),
					h(
						'span',
						{ className: 'lgwsp-skeleton-copy' },
						h('span', { className: 'lgwsp-skeleton-line lgwsp-is-title' }),
						h('span', { className: 'lgwsp-skeleton-line lgwsp-is-meta' })
					),
					h('span', { className: 'lgwsp-skeleton-chip' })
				)
			);

		const listRows = (rows, emptyText, options) => {
			const loading = options !== undefined && options.loading === true;
			if (loading) return h('div', { className: 'lgwsp-item-list lgwsp-is-skeleton', 'aria-busy': 'true' }, skeletonRows(options.count ?? 3));
			if (rows === null) return h('div', { className: 'lgwsp-empty-state' }, h(Spinner), ' 正在读取…');
			if (rows.length === 0) return h('div', { className: 'lgwsp-empty-state' }, rowQuery.trim() === '' ? emptyText : '没有匹配的条目。');
			return h(
				'div',
				{ className: 'lgwsp-item-list' },
				rows.map((item) =>
					h(SpaceRow, {
						key: `${item.kind}:${item.id}`,
						item,
						statusLabel,
						selected: inspectorKey === `${item.kind}:${item.id}`,
						onOpen: openItem,
					})
				)
			);
		};

		const syncBar = h(
			'div',
			{ className: 'lgwsp-sync-bar' },
			h(
				'div',
				{ className: 'lgwsp-sync-copy' },
				h('h2', { className: 'lgwsp-list-section-title' }, 'TAPD 缺陷', h('small', null, `${bugRows?.length ?? 0} 项`)),
				h('p', { className: 'lgwsp-sync-meta' }, bugSync.phase === 'loading' ? '正在从 TAPD 重新读取…' : `上次同步 ${syncText.replace(/^更新于 /, '')}`)
			),
			h(
				'button',
				{
					type: 'button',
					className: `lgwsp-sync-button${bugSync.phase === 'loading' ? ' lgwsp-is-loading' : ''}`,
					onClick: () => void refreshBugs(),
					/* Stable hooks: the sync state is driven by tests/screenshots. */
					'data-sync-bugs': 'true',
					disabled: bugSync.phase === 'loading' || !live.tapd,
					'aria-busy': bugSync.phase === 'loading',
					'aria-label': '刷新缺陷列表',
					title: live.tapd ? '重新读取当前项目的「待我处理」缺陷' : '未连接 TAPD 时刷新的是演示数据',
				},
				bugSync.phase === 'loading'
					? [h('span', { className: 'lgwsp-sync-spinner', key: 'spinner', 'aria-hidden': 'true' }), '同步中…']
					: '↻ 刷新缺陷列表'
			)
		);

		/* ---- content per tab -------------------------------------------- */

		const overviewPane = h(
			'div',
			{ className: 'lgwsp-list-section' },
			h(
				'div',
				null,
				h('h2', { className: 'lgwsp-list-section-title' }, '需要关注', h('small', null, `${attentionRows?.length ?? 0} 项`)),
				listRows(attentionRows, '没有高严重度或逾期的条目，一切平稳。', { count: 2 }),
				h('p', { className: 'lgwsp-section-note' }, '高严重度或逾期的项目事项会保持在这里。')
			),
			h(
				'div',
				{ className: 'lgwsp-list-section' },
				h('h2', { className: 'lgwsp-list-section-title' }, '今日待办', h('small', null, `${todayRows?.length ?? 0} 项`)),
				listRows(todayRows, '今天没有待办。', { count: 2 }),
				h('p', { className: 'lgwsp-section-note' }, '按截止时间排序，已包含企微待办。')
			)
		);

		const bugsPane = h(
			'div',
			{ className: 'lgwsp-list-section' },
			syncBar,
			data !== null && !demoTapd && data.authBlocked?.tapd === true
				? renderAuthBlocked('tapd')
				: data !== null && data.workspaceBlocked?.tapd === true
					? h(ErrorNote, { error: 'TAPD 项目未选择：先在上方选择一个项目，缺陷列表才会出现。' })
					: data !== null && data.errors.bugs !== null && !demoTapd
						? h(ErrorNote, { error: `缺陷列表拉取失败：${data.errors.bugs}` })
						: null,
			bugSync.error === null ? null : h(ErrorNote, { error: `刷新失败：${bugSync.error}` }),
			listRows(bugRows, '没有缺陷。', { loading: bugSync.phase === 'loading', count: Math.min(Math.max(bugRows?.length ?? 3, 2), 4) }),
			h('p', { className: 'lgwsp-section-note' }, '按严重度排序 · 刷新只重新读取当前项目的「待我处理」缺陷；切换项目会作废在途的同步。')
		);

		const storiesPane = h(
			'div',
			{ className: 'lgwsp-list-section' },
			h('h2', { className: 'lgwsp-list-section-title' }, '需求与任务', h('small', null, `${storyRows?.length ?? 0} 项`)),
			listRows(storyRows, '没有进行中的需求或任务。', { count: 3 }),
			h('p', { className: 'lgwsp-section-note' }, '需求与任务共用同一个项目上下文。')
		);

		const docsPane = h(
			'div',
			{ className: 'lgwsp-list-section' },
			h('h2', { className: 'lgwsp-list-section-title' }, '企微协作'),
			h(
				'div',
				{ className: 'lgws-searchRow' },
				h('input', {
					className: 'lgws-input lgws-searchInput',
					value: docQuery,
					placeholder: '文档关键词，空格分隔',
					onChange: (event) => setDocQuery(event.target.value),
					onKeyDown: (event) => {
						if (event.key === 'Enter') void searchDocs();
					},
				}),
				h('button', { className: 'lgws-buttonPrimary', onClick: () => void searchDocs(), disabled: docQuery.trim() === '' }, '搜索')
			),
			demoWecom ? h('div', { className: 'lgws-demoNote' }, '演示模式 — 安装 wecom-cli 后可搜索真实文档') : null,
			docError === null ? null : h(ErrorNote, { error: docError }),
			wecomRows === null
				? null
				: h(
						'div',
						{ className: 'lgwsp-item-list' },
						wecomRows.map((item) =>
							h(SpaceRow, {
								key: `w-${item.id}`,
								item,
								statusLabel,
								selected: inspectorKey === `${item.kind}:${item.id}`,
								onOpen: openItem,
							})
						)
					),
			docs === null
				? null
				: docs.length === 0
					? h('div', { className: 'lgwsp-empty-state' }, '没有匹配的文档。')
					: h('div', { className: 'lgwsp-item-list' }, docs.map((doc) =>
								h(DocRow, { key: `d-${doc.id}`, doc, onOpen: (url) => {
									if (url !== '') void openExternal(url);
								} })
							))
		);

		const consolePane = h(
			'div',
			{ className: 'lgwsp-list-section' },
			h('h2', { className: 'lgwsp-list-section-title' }, '直接执行 CLI'),
			h('p', { className: 'lgwsp-section-note' }, '执行成功会刷新各列表；命令原文与输出都会保留在下面。'),
			h(
				'div',
				{ className: 'lgws-searchRow' },
				h(
					'div',
					{ className: 'lgws-consoleCli' },
					h('button', { className: `lgws-consoleCliBtn${consoleCli === 'tapd' ? ' lgws-consoleCliOn' : ''}`, onClick: () => setConsoleCli('tapd') }, 'tapd'),
					h('button', { className: `lgws-consoleCliBtn${consoleCli === 'wecom' ? ' lgws-consoleCliOn' : ''}`, onClick: () => setConsoleCli('wecom') }, 'wecom-cli')
				),
				h('input', {
					className: 'lgws-input lgws-searchInput lgws-mono',
					value: consoleInput,
					placeholder: consoleCli === 'tapd' ? 'bug todo' : 'doc search --keywords 周报 --limit 5',
					onChange: (event) => setConsoleInput(event.target.value),
					onKeyDown: (event) => {
						if (event.key === 'Enter') void runConsole();
					},
				}),
				h('button', { className: 'lgws-buttonPrimary', onClick: () => void runConsole(), disabled: consoleBusy || consoleInput.trim() === '' }, consoleBusy ? '执行中…' : '执行')
			),
			consoleResult === null
				? null
				: consoleResult.error !== undefined
					? h(ErrorNote, { error: consoleResult.error })
					: h(
							'pre',
							{ className: 'lgws-consoleOut' },
							typeof consoleResult.value === 'string' && consoleResult.value === ''
								? consoleResult.stderr ||
										(consoleResult.exitCode === 0
											? `（无输出，退出码 0，${consoleResult.durationMs}ms）`
											: `（无输出，退出码 ${consoleResult.exitCode}，${consoleResult.durationMs}ms）\n` +
												`命令行：${consoleResult.command}\n` +
												(consoleResult.cli === 'tapd'
													? 'tapd 1.0.0 对参数错误不打印任何东西（SilenceErrors），空输出只说明写法不被接受：用 `tapd <子命令> --help` 看真实参数。'
													: 'CLI 没有输出，先用 `<cli> help` 确认这次调用的写法。'))
								: JSON.stringify(consoleResult.value, null, 2)
						)
		);

		const panes = { overview: overviewPane, bugs: bugsPane, stories: storiesPane, docs: docsPane, console: consolePane };
		const activePane = panes[tab] ?? overviewPane;

		/* ---- focus cards + segmented ------------------------------------- */

		const focusCards = [
			{ label: '待我处理缺陷', count: counts.bugs, tone: 'bug', target: 'bugs', icon: '◇', note: 'TAPD' },
			{ label: '需求与任务', count: counts.stories, tone: 'story', target: 'stories', icon: '✦', note: 'TAPD' },
			{ label: '企微待办', count: counts.wecom, tone: 'wecom', target: 'docs', icon: '◍', note: '企微' },
			{ label: '需要关注', count: counts.attention, tone: 'attention', target: 'overview', icon: '!', note: '今天' },
		];

		const segmented = h(
			'div',
			{ className: 'lgwsp-segmented', role: 'tablist', 'aria-label': '工作项类型', ref: (node) => { segRef.current = node; } },
			h('span', { className: 'lgwsp-segmented-plate', 'aria-hidden': 'true', ref: (node) => { plateRef.current = node; } }),
			tabDefs.map((entry) =>
				h(
					'button',
					{
						key: entry.id,
						type: 'button',
						role: 'tab',
						className: `lgwsp-segment${entry.id === activeTab.id ? ' lgwsp-is-active' : ''}`,
						/* Stable hook: the tab is driven by tests and screenshots. */
						'data-tab-id': entry.id,
						'aria-selected': entry.id === activeTab.id,
						onClick: () => {
							setTab(entry.id);
							setRowQuery('');
						},
					},
					entry.label
				)
			)
		);

		const searchField =
			tab === 'overview' || tab === 'bugs' || tab === 'stories'
				? h('input', {
						className: 'lgwsp-list-search',
						type: 'search',
						value: rowQuery,
						placeholder: '搜索当前项目',
						'aria-label': '搜索当前项目',
						onChange: (event) => setRowQuery(event.target.value),
					})
				: null;

		const itemCount =
			tab === 'bugs'
				? bugRows?.length ?? 0
				: tab === 'stories'
					? storyRows?.length ?? 0
					: tab === 'docs'
						? wecomRows?.length ?? 0
						: (attentionRows?.length ?? 0) + (todayRows?.length ?? 0);

		/* ---- inspector --------------------------------------------------- *
		 * The detail is a page in the app, not a browser tab: a framed
		 * surface inside the shell, with the actions that used to be row
		 * buttons living here where they have room for their consequence.
		 * ----------------------------------------------------------------- */
		const inspector =
			selectedItem === null
				? null
				: (() => {
						const meta = KIND_META[selectedItem.kind] ?? KIND_META.bug;
						/* 描述优先用 `show` 补齐的完整记录；`show` 还没回来（或失败）
						 * 就退回列表自带的那份。 */
						const detail = details[`${selectedItem.kind}:${selectedItem.id}`];
						const raw = detail?.raw ?? selectedItem.raw ?? {};
						const descriptionHtml = descriptionToRichHtml(firstOf(raw, ['description', 'desc', 'description_text', 'remark']));
						const detailNote =
							descriptionHtml !== ''
								? null
								: detail?.phase === 'error'
									? `完整描述读取失败（${String(detail.error ?? '未知原因')}）；可在浏览器中查看原文。`
									: detail !== undefined && detail.phase === 'loading'
										? '正在从 TAPD 读取完整描述…'
										: live.tapd && isTapdKind(selectedItem.kind)
											? '这条工作项没有描述内容。'
											: '这条记录没有描述内容。';
						const source =
							selectedItem.kind === 'doc' || selectedItem.kind === 'wecom-todo'
								? 'wecom://workspace'
								: `tapd://workspace/${projectId}/${selectedItem.kind}/${selectedItem.id}`;
						const created = String(firstOf(raw, ['created', 'created_time', 'created_at', 'createdDate']) ?? '');
						const modified = String(firstOf(raw, ['modified', 'modified_time', 'updated_at', 'modifiedDate']) ?? '');
						const activity = [
							created === '' ? null : `创建于 ${formatWhen(created)}`,
							modified === '' ? null : `最近更新 ${formatWhen(modified)}`,
							`当前状态 ${selectedItem.status === '' ? '未知' : statusLabel(selectedItem.kind, selectedItem.status)}`,
							`最近同步 ${syncText.replace(/^更新于 /, '')}`,
						].filter((entry) => entry !== null);
						return h(
							'aside',
							{ className: 'lgwsp-inspector', 'aria-label': '页面内详情' },
							h(
								'div',
								{ className: 'lgwsp-inspector-head' },
								h(
									'div',
									null,
									h('div', { className: 'lgwsp-inspector-kicker' }, `页面内详情 · ${meta.label}`),
									h('div', { className: 'lgwsp-inspector-title' }, selectedItem.title)
								),
								h('button', { className: 'lgwsp-inspector-close', onClick: closeItem, 'aria-label': '关闭详情' }, '×')
							),
							h(
								'div',
								{ className: 'lgwsp-inspector-scroll' },
								h(
									'div',
									{ className: 'lgwsp-inspector-inner' },
									h(
										'div',
										{ className: 'lgwsp-embedded-frame', role: 'document', 'aria-label': `${meta.label}详情页面内预览` },
										h(
											'div',
											{ className: 'lgwsp-frame-toolbar' },
											h(
												'span',
												{ className: 'lgwsp-frame-dots', 'aria-hidden': 'true' },
												h('i', { className: 'lgwsp-frame-dot' }),
												h('i', { className: 'lgwsp-frame-dot' }),
												h('i', { className: 'lgwsp-frame-dot' })
											),
											h('span', { className: 'lgwsp-frame-address' }, source),
											h('span', { 'aria-hidden': 'true' }, '↗')
										),
										h(
											'div',
											{ className: 'lgwsp-frame-content' },
											h(
												'div',
												{ className: 'lgwsp-detail-type', style: { '--item-color': meta.color } },
												h('span', { className: 'lgwsp-detail-type-mark', style: { '--item-bg': meta.bg } }, meta.short),
												meta.label
											),
											h('h2', { className: 'lgwsp-detail-title' }, selectedItem.title),
											h('div', { className: 'lgwsp-detail-id' }, `${selectedItem.id} · ${projectName}`),
											h(
												'div',
												{ className: 'lgwsp-detail-chips' },
												selectedItem.status === ''
													? null
													: h('span', { className: 'lgwsp-detail-chip lgwsp-is-accent', style: { '--item-color': meta.color, '--item-bg': meta.bg } }, statusLabel(selectedItem.kind, selectedItem.status)),
												selectedItem.severity === '' ? null : h('span', { className: 'lgwsp-detail-chip' }, `优先级 · ${priorityLabel(selectedItem.severity)}`),
												h('span', { className: 'lgwsp-detail-chip' }, selectedItem.owner === '' ? '未指派' : selectedItem.owner)
											),
											h('div', { className: 'lgwsp-detail-divider' }),
											h('h3', { className: 'lgwsp-detail-label' }, '描述'),
											descriptionHtml !== ''
												? h('div', {
														className: 'lgwsp-detail-rich',
														ref: richRef,
														dangerouslySetInnerHTML: { __html: descriptionHtml },
													})
												: h('p', { className: 'lgwsp-detail-description' }, detailNote),
											h(
												'div',
												{ className: 'lgwsp-detail-grid' },
												h('div', { className: 'lgwsp-detail-field' }, h('div', { className: 'lgwsp-detail-field-label' }, '当前状态'), h('div', { className: 'lgwsp-detail-field-value' }, selectedItem.status === '' ? '未知' : statusLabel(selectedItem.kind, selectedItem.status))),
												h('div', { className: 'lgwsp-detail-field' }, h('div', { className: 'lgwsp-detail-field-label' }, '截止 / 更新'), h('div', { className: 'lgwsp-detail-field-value' }, dueLabel(selectedItem) === '' ? '未设置' : dueLabel(selectedItem))),
												h('div', { className: 'lgwsp-detail-field' }, h('div', { className: 'lgwsp-detail-field-label' }, '处理人'), h('div', { className: 'lgwsp-detail-field-value' }, selectedItem.owner === '' ? '未指派' : selectedItem.owner)),
												h('div', { className: 'lgwsp-detail-field' }, h('div', { className: 'lgwsp-detail-field-label' }, '工作项 ID'), h('div', { className: 'lgwsp-detail-field-value lgwsp-mono' }, selectedItem.id))
											),
											h('div', { className: 'lgwsp-detail-divider' }),
											h('h3', { className: 'lgwsp-detail-label' }, '最近动态'),
											h(
												'div',
												{ className: 'lgwsp-activity' },
												activity.map((line, index) =>
													h(
														'div',
														{ className: 'lgwsp-activity-row', key: `act-${index}` },
														h('span', { className: 'lgwsp-activity-dot' }),
														h('span', null, line)
													)
												)
											),
											h(
												'div',
												{ className: 'lgwsp-detail-actions' },
												selectedItem.kind === 'bug' || selectedItem.kind === 'story' || selectedItem.kind === 'task'
													? h('button', { className: 'lgwsp-detail-action', onClick: () => setDialog({ kind: 'transition', item: selectedItem }) }, '流转状态')
													: null,
												selectedItem.kind === 'bug' ? h('button', { className: 'lgwsp-detail-action', onClick: () => setDialog({ kind: 'owner', item: selectedItem }) }, '转派') : null,
												selectedItem.kind === 'bug' || selectedItem.kind === 'story' || selectedItem.kind === 'task'
													? h('button', { className: 'lgwsp-detail-action lgwsp-secondary', onClick: () => void openCase(selectedItem) }, '在此开会话')
													: null,
												h(
													'button',
													{
														className: 'lgwsp-detail-action lgwsp-secondary',
														onClick: () => {
															if (selectedItem.url !== '') void openExternal(selectedItem.url);
														},
														disabled: selectedItem.url === '',
														title: selectedItem.url === '' ? '这条记录没有链接' : '在浏览器中打开原文',
													},
													'浏览器打开'
												),
												h(
													'button',
													{
														className: 'lgwsp-detail-action lgwsp-secondary',
														onClick: () => {
															const text = selectedItem.id;
															if (navigator.clipboard?.writeText !== undefined) {
																navigator.clipboard
																	.writeText(text)
																	.then(() => showToast(`已复制 ${text}`))
																	.catch(() => showToast(`工作项 ID：${text}`));
															} else {
																copyText(text);
																showToast(`已复制 ${text}`);
															}
														},
													},
													'复制 ID'
												),
												h('button', { className: 'lgwsp-detail-action lgwsp-secondary', onClick: closeItem }, '返回列表')
											)
										)
									)
								)
							)
						);
					})();

		return h(
			'div',
			{ className: 'lgwsp-workspace-page' },
			h(
				'div',
				{ className: `lgwsp-workspace-shell${selectedItem === null ? '' : ' lgwsp-has-inspector'}` },
				rail,
				h(
					'section',
					{ className: 'lgwsp-workspace-main', 'aria-label': '工作空间主内容' },
					h(
						'div',
						{ className: 'lgwsp-main-scroll' },
						h(
							'div',
							{ className: 'lgwsp-main-inner' },
							h(
								'header',
								{ className: 'lgwsp-topbar' },
								h(
									'div',
									null,
									h('div', { className: 'lgwsp-eyebrow' }, h('span', { className: 'lgwsp-eyebrow-dot' }), `WORKSPACE / ${projectId === '' ? '未选择项目' : projectId}`),
									h('h1', { className: 'lgwsp-title' }, '今天需要我做什么'),
									h('p', { className: 'lgwsp-subtitle' }, 'TAPD 与企业微信的工作项，在一个项目上下文里完成。')
								),
								statusPills
							),
							h(
								'div',
								{ className: 'lgwsp-toolbar' },
								projectControl,
								h(
									'div',
									{ className: 'lgwsp-status-pills' },
									h('span', { className: 'lgwsp-status-pill' }, h('span', { className: 'lgwsp-status-dot' }), demoTapd || demoWecom ? '演示数据' : '实时数据'),
									h('span', { className: 'lgwsp-status-pill' }, syncText)
								)
							),
							demoTapd || demoWecom
								? h(
										'div',
										{ className: 'lgws-demoBanner' },
										h('div', { className: 'lgws-demoTitle' }, '部分 CLI 未检测到 — 对应区域显示演示数据，可一键安装'),
										h(
											'div',
											{ className: 'lgws-demoGrid' },
											demoTapd ? installBlock('tapd', 'TAPD（tapd-ai-cli）', 'github.com/studyzy/tapd-ai-cli/releases') : null,
											demoWecom ? installBlock('wecom', '企业微信（wecom-cli）', 'npm i -g @wecom/cli') : null
										)
									)
								: null,
							authRowCli.length === 0
								? null
								: h(
										'div',
										{ className: 'lgws-authBanner' },
										h('div', { className: 'lgws-authTitle' }, authRowTitle),
										authRowCli.map((cli) => renderAuthRow(cli))
									),
							h(
								'div',
								{ className: 'lgwsp-focus-grid' },
								focusCards.map((card) =>
									h(
										'button',
										{
											key: card.tone,
											className: `lgwsp-focus-card lgwsp-focus-${card.tone}`,
											'data-tab-id': card.target,
											onClick: () => {
												setTab(card.target);
												setRowQuery('');
											},
										},
										h('span', { className: 'lgwsp-focus-card-label' }, h('span', { className: 'lgwsp-focus-card-icon', 'aria-hidden': 'true' }, card.icon), card.label),
										h('span', { className: 'lgwsp-focus-card-number' }, card.count),
										h('span', { className: 'lgwsp-focus-card-note' }, card.note)
									)
								)
							),
							h(
								'div',
								{ className: 'lgwsp-section-bar' },
								segmented,
								h('div', { className: 'lgwsp-list-tools' }, searchField, h('span', { className: 'lgwsp-list-count', 'aria-live': 'polite' }, `${itemCount} 项`))
							),
							activePane
						)
					)
				),
				selectedItem === null ? null : h('button', { className: 'lgwsp-inspector-scrim', onClick: closeItem, 'aria-label': '关闭详情' }),
				inspector
			),
			toast === '' ? null : h('div', { className: 'lgwsp-toast', role: 'status' }, toast),
			dialog === null
				? null
				: dialog.kind === 'transition'
					? h(TransitionDialog, {
							item: dialog.item,
							live: live.tapd,
							workitemTypeId: tapdTypeId,
							onDone: () => void load(),
							onClose: () => setDialog(null),
						})
					: h(OwnerDialog, {
							item: dialog.item,
							live: live.tapd,
							onDone: () => void load(),
							onClose: () => setDialog(null),
						})
		);
	}

	/**
	 * A count card. It is a button because it navigates: 需要关注 lives on the
	 * overview, everything else has a tab of its own. An empty handler made four
	 * large, hover-highlighted buttons that did nothing when clicked. `setTab`
	 * is component state and this helper sits outside the component, so the
	 * caller hands the setter in — the first attempt referenced `setTab`
	 * directly and every click threw `ReferenceError: setTab is not defined`.
	 */
	/* ================================================================ *
	 * Rail icon
	 * ================================================================ */

	function WorkspaceIcon() {
		return h(
			'svg',
			{ width: 18, height: 18, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
			h('rect', { x: 2.5, y: 2.5, width: 6.5, height: 6.5, rx: 2 }),
			h('rect', { x: 11, y: 2.5, width: 6.5, height: 6.5, rx: 2 }),
			h('rect', { x: 2.5, y: 11, width: 6.5, height: 6.5, rx: 2 }),
			h('path', { d: 'M14.25 11v6.5M11 14.25h6.5' })
		);
	}

	/* ================================================================ *
	 * Render guard
	 * ================================================================ */

	/* A crash inside the workspace panel must never blank the central
	 * column. The shell renders slot occupants without its own error
	 * boundary, so a single throw during render turns the whole main
	 * area into an empty dark surface — exactly the "workspace is a
	 * black screen" failure this guard exists to surface. The boundary
	 * keeps the failure visible, copyable, and confined to this panel. */
	class WorkspaceErrorBoundary extends React.Component {
		constructor(props) {
			super(props);
			this.state = { error: null };
		}

		static getDerivedStateFromError(error) {
			return { error };
		}

		componentDidCatch(error, info) {
			/* Mirrored to the console so the failure also reaches the
			 * page diagnostics, not just this card. */
			console.error('dsh-glass-theme: workspace panel render failed', error, info?.componentStack);
		}

		render() {
			const error = this.state.error;
			if (!error) return this.props.children;
			const stack = String(error?.stack ?? '');
			const stackHead = stack.split('\n').slice(0, 4).join('\n');
			return h('div', { className: 'lgws-crashCard', role: 'alert' },
				h('div', { className: 'lgws-crashTitle' }, '工作空间渲染中断'),
				h('div', { className: 'lgws-crashBody' },
					'面板组件在渲染时抛出了异常。把下面这段文字复制发给开发者即可定位根因。'),
				h('pre', { className: 'lgws-crashPre' },
					String(error?.name ?? 'Error') + ': ' + String(error?.message ?? error) + '\n' + stackHead),
			);
		}
	}

	/* The slot system renders whatever component we register; register the
	 * guarded one so the boundary wraps every render, not just the first. */
	function GuardedPanel(props) {
		return h(WorkspaceErrorBoundary, null, h(WorkspacePanel, props));
	}

	/* ================================================================ *
	 * Registration — the host's two-slot page idiom.
	 * ================================================================ */

	/**
	 * Returns a `{ start, stop }` handle and claims nothing yet. The caller
	 * owns the lifetime: the settings switch decides whether the panel exists
	 * at all (design D4), so registering here would mean "off" still had to
	 * pay for a registration it would immediately throw away.
	 *
	 * `start()` claims both slots as one unit — the `main` entry renders the
	 * panel when the shell selects our id, and the `sidebar.panellist` entry
	 * is the rail icon that selects it. `slots.inject` defers each
	 * registration until that slot actually exists, so the panel tolerates a
	 * shell that mounts the rail before the main area or vice versa. Its
	 * return value is the disposer for that deferred registration and must be
	 * kept: dropping it would let the deferred callback fire again after
	 * `stop()` and quietly re-register the panel.
	 *
	 * `start()` and `stop()` are both idempotent, and `start()` works again
	 * after `stop()` — that is what makes flipping the switch back on
	 * re-register the panel in its usual position without a reload. `stop()`
	 * disposes exactly what this handle's `start()` created and nothing else;
	 * the shell's layout store clears a selected panel id whose key
	 * disappears, so returning to the session is its job, not ours.
	 *
	 * A missing `slots` service yields `null` — callers read that as "not
	 * available". A genuine failure to claim a slot only logs: the handle
	 * still comes back so the caller's switch cannot get stuck, and `stop()`
	 * on it is a no-op.
	 */
	function register() {
		const slots = ctx.slots;
		if (!slots || typeof slots.register !== 'function') return null;
		/* Whether the chain is currently armed, the disposer that cancels the
		 * deferred registrations, and the one that unwinds the entries already
		 * claimed. Both are kept because they cover different moments: before
		 * the slots exist only the deferred registration can be cancelled,
		 * after they do only the inner cleanup can be unwound. */
		let started = false;
		let disposeOpen = null;
		let disposeStops = null;
		const open = () =>
			slots.inject('main', () =>
				slots.inject('sidebar.panellist', () => {
					/* A deferred callback can still be queued when `stop()`
					 * lands. Arming after that would register a panel nothing
					 * owns, so a stopped handle registers nothing at all. */
					if (!started) return () => {};
					const stops = [];
					try {
						stops.push(
							slots.register(
								{
									name: 'main',
									key: PANEL_ID,
									/* An injector, not a value: the slot runtime calls this to build props. */
									inject: () => ({}),
								},
								GuardedPanel
							)
						);
					} catch (error) {
						console.error('dsh-glass-theme: could not register the workspace panel', error);
					}
					try {
						stops.push(
							slots.register(
								{ name: 'sidebar.panellist', id: PANEL_ID, order: 45, label: () => PANEL_LABEL },
								WorkspaceIcon
							)
						);
					} catch (error) {
						console.error('dsh-glass-theme: could not register the workspace rail icon', error);
					}
					/* `stop()` can reach this twice — once through the inject
					 * disposer's cascade and once through the reference kept
					 * below — so it has to be idempotent itself. A second call
					 * must not ask a `slots.register` disposer to unwind an
					 * entry it already released. */
					let cleaned = false;
					const cleanup = () => {
						if (cleaned) return;
						cleaned = true;
						for (const stop of stops) {
							try {
								stop?.();
							} catch (error) {
								/* already disposed */
							}
						}
					};
					/* The slot runtime disposes us through this return value;
					 * remembering it lets `stop()` also unwind the case where
					 * both slots existed immediately and the deferred callback
					 * already ran. */
					disposeStops = cleanup;
					return cleanup;
				})
			);
		return {
			start() {
				if (started) return;
				started = true;
				disposeStops = null;
				try {
					const armed = open();
					disposeOpen = typeof armed === 'function' ? armed : null;
				} catch (error) {
					console.error('dsh-glass-theme: could not open the workspace slots', error);
					disposeOpen = null;
					disposeStops = null;
				}
			},
			stop() {
				if (!started) return;
				started = false;
				const stops = disposeStops;
				const deferred = disposeOpen;
				disposeStops = null;
				disposeOpen = null;
				/* Both are idempotent; either may already be gone. */
				try {
					deferred?.();
				} catch (error) {
					/* already disposed */
				}
				try {
					stops?.();
				} catch (error) {
					/* already disposed */
				}
			},
		};
	}

	/* RawPanel is the unguarded component; tools/ws-render.mjs drives it
	 * directly because its ordered-hook shim cannot see through the
	 * boundary wrapper. The slot system only ever mounts Panel. */
	return { register, Panel: GuardedPanel, RawPanel: WorkspacePanel, Icon: WorkspaceIcon };
}
