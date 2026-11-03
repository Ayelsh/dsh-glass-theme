#!/usr/bin/env node
/**
 * tools/detail-lifecycle-check.mjs — OpenSpec change
 * `refine-glass-performance-and-interactions`, task 2.1.
 *
 * Behavioral verification of the workspace detail lifecycle (spec:
 * workspace-item-details). Unlike tools/ws-render.mjs, whose hook shim is
 * first-render-only by design, this check drives real dependency-aware
 * lifecycle semantics — either actual React 18 + react-test-renderer, or an
 * equivalent harness implemented in this file (Object.is dependency
 * comparison, cleanups on dep change/unmount, queued state updates flushed
 * into re-renders that only re-run effects whose deps changed).
 *
 * React resolution order (real React preferred):
 *   1. $DSH_TEST_REACT_DIR — a node_modules dir containing react@18 + react-test-renderer@18
 *   2. <repo>/node_modules
 *   3. <repo>/tools/.react/node_modules  (npm install --prefix tools/.react react@18.2.0 react-dom@18.2.0 react-test-renderer@18.2.0)
 * If none of those resolve, the in-tool harness runs and a notice is printed.
 * The check never silently skips.
 *
 * The FIRST scenario is a regression record: the original detail effect from
 * src/workspace.js (kept verbatim below) depended on the whole `details`
 * object it mutated, so its own loading write revoked the in-flight read and
 * the result never published. The fixture asserts the original code still
 * fails the new contract — proving this check can catch the defect — before
 * the fixed implementation is exercised through every scenario the design
 * document requires.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const workspaceSrcPath = path.join(repoRoot, 'src', 'workspace.js');
const workspaceSrc = fs.readFileSync(workspaceSrcPath, 'utf8');

/* ================================================================
 * Part 1 — React engine: real React 18 when resolvable, else the
 * equivalent lifecycle harness (documented above).
 * ================================================================ */

function tryRequire(fromDir, name) {
	try {
		const req = createRequire(path.join(fromDir, 'noop.js'));
		return req(name);
	} catch {
		return null;
	}
}

function resolveRealEngine() {
	const candidates = [];
	if (process.env.DSH_TEST_REACT_DIR) {
		const envDir = process.env.DSH_TEST_REACT_DIR;
		candidates.push(path.basename(envDir) === 'node_modules' ? envDir : path.join(envDir, 'node_modules'));
	}
	candidates.push(path.join(repoRoot, 'node_modules'));
	candidates.push(path.join(repoRoot, 'tools', '.react', 'node_modules'));

	for (const dir of candidates) {
		const react = tryRequire(dir, 'react');
		const rtr = tryRequire(dir, 'react-test-renderer');
		if (react === null || rtr === null) continue;
		if (!String(react.version ?? '').startsWith('18.')) continue;
		if (typeof rtr.act !== 'function') continue;
		return { react, rtr, dir };
	}
	return null;
}

function makeRealEngine({ react, rtr, dir }) {
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	const collectText = (inst) => {
		let text = '';
		for (const child of inst.children) text += typeof child === 'string' ? child : collectText(child);
		return text;
	};
	return {
		React: react,
		label: `real-react-18 (react@${react.version} + react-test-renderer@${rtr.version ?? '?'} from ${dir})`,
		real: true,
		mount(el) {
			const renderer = rtr.create(el, {
				createNodeMock: () => ({
					addEventListener() {},
					removeEventListener() {},
					querySelector() {
						return null;
					},
				}),
			});
			return {
				unmount: () => {
					renderer.unmount();
				},
				nodes: () =>
					renderer.root
						.findAll((inst) => typeof inst.type === 'string')
						.map((inst) => ({ type: inst.type, props: inst.props, text: collectText(inst) })),
			};
		},
		act: async (fn) => {
			let value;
			await rtr.act(async () => {
				value = await fn();
			});
			return value;
		},
	};
}

/* The fallback harness. Semantics it guarantees (and self-checks):
 *   (a) effect dependency arrays compared with Object.is;
 *   (b) cleanups run when deps change or on unmount;
 *   (c) state updates are queued, then flushed: re-render, then only the
 *       effects whose dependencies changed re-run.
 */
function makeHarnessEngine() {
	const createElement = (type, props, ...children) => {
		const flat = [];
		const push = (kid) => {
			if (kid === null || kid === undefined || kid === false || kid === true) return;
			if (Array.isArray(kid)) {
				kid.forEach(push);
				return;
			}
			flat.push(kid);
		};
		children.forEach(push);
		return { type, props: props === undefined || props === null ? {} : props, children: flat };
	};

	const sameDeps = (a, b) => {
		if (!Array.isArray(a) || !Array.isArray(b)) return false;
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i += 1) {
			if (!Object.is(a[i], b[i])) return false;
		}
		return true;
	};

	let currentInstance = null;
	let hookIndex = 0;
	let pendingUpdates = 0;
	let flushScheduled = false;
	const roots = new Set();

	const scheduleFlush = () => {
		if (flushScheduled) return;
		flushScheduled = true;
		queueMicrotask(() => {
			flushScheduled = false;
			flushAll();
		});
	};

	const useState = (initial) => {
		const i = hookIndex++;
		const inst = currentInstance;
		if (inst.hooks[i] === undefined) {
			inst.hooks[i] = {
				kind: 'state',
				inst,
				value: typeof initial === 'function' ? initial() : initial,
				queue: [],
			};
		}
		const cell = inst.hooks[i];
		const setState = (update) => {
			if (cell.inst.dead) return;
			cell.queue.push(update);
			pendingUpdates += 1;
			scheduleFlush();
		};
		return [cell.value, setState];
	};

	const useRef = (initial) => {
		const i = hookIndex++;
		if (currentInstance.hooks[i] === undefined) {
			currentInstance.hooks[i] = { kind: 'ref', ref: { current: initial } };
		}
		return currentInstance.hooks[i].ref;
	};

	const useCallback = (fn, deps) => {
		const i = hookIndex++;
		let cell = currentInstance.hooks[i];
		if (cell === undefined || !sameDeps(cell.deps, deps)) {
			cell = currentInstance.hooks[i] = { kind: 'callback', fn, deps };
		}
		return cell.fn;
	};

	const useMemo = (fn, deps) => {
		const i = hookIndex++;
		let cell = currentInstance.hooks[i];
		if (cell === undefined || !sameDeps(cell.deps, deps)) {
			cell = currentInstance.hooks[i] = { kind: 'memo', value: fn(), deps };
		}
		return cell.value;
	};

	const useEffect = (fn, deps) => {
		const i = hookIndex++;
		const cell = currentInstance.hooks[i];
		if (cell === undefined) {
			currentInstance.hooks[i] = {
				kind: 'effect',
				fn,
				deps,
				pendingFn: fn,
				pendingDeps: deps,
				cleanup: undefined,
				ran: false,
			};
			return;
		}
		cell.pendingFn = fn;
		cell.pendingDeps = deps;
	};

	class Component {
		constructor(props) {
			this.props = props;
		}
	}

	const React = { createElement, Component, useState, useRef, useCallback, useMemo, useEffect };

	const makeHost = (type) => ({
		kind: 'host',
		type,
		props: {},
		children: [],
		addEventListener() {},
		removeEventListener() {},
		querySelector() {
			return null;
		},
	});

	const drainStates = (inst) => {
		for (const cell of inst.hooks) {
			if (cell.kind !== 'state' || cell.queue.length === 0) continue;
			let value = cell.value;
			const queue = cell.queue.slice();
			pendingUpdates -= queue.length;
			cell.queue.length = 0;
			for (const update of queue) value = typeof update === 'function' ? update(value) : update;
			cell.value = value;
		}
	};

	const runGuarded = (fn) => {
		try {
			return fn();
		} catch (error) {
			queueMicrotask(() => {
				throw error;
			});
			return undefined;
		}
	};

	const unmountTree = (node) => {
		if (node === null || node === undefined) return;
		if (node.kind === 'comp') {
			for (const cell of node.hooks) {
				if (cell.kind === 'effect' && cell.ran && typeof cell.cleanup === 'function') runGuarded(cell.cleanup);
			}
			node.dead = true;
			node.slots.forEach(unmountTree);
			return;
		}
		if (node.kind === 'class') {
			unmountTree(node.child);
			return;
		}
		if (node.kind === 'host') {
			node.children.forEach(unmountTree);
		}
	};

	const renderChildren = (nodes, prevSlots) => {
		const slots = [];
		for (let i = 0; i < nodes.length; i += 1) {
			const node = nodes[i];
			const prev = prevSlots[i];
			if (Array.isArray(node)) {
				slots.push(...renderChildren(node, Array.isArray(prev) ? prev : []));
				continue;
			}
			if (node === null || node === undefined || node === false || node === true) {
				slots.push(null);
				continue;
			}
			if (typeof node === 'string' || typeof node === 'number') {
				slots.push({ kind: 'text', text: String(node) });
				continue;
			}
			slots.push(renderInstance(node, prev ?? null));
		}
		return slots;
	};

	const renderInstance = (el, prev) => {
		if (typeof el.type === 'string') {
			const host = prev !== null && prev.kind === 'host' && prev.type === el.type ? prev : makeHost(el.type);
			host.props = el.props;
			host.children = renderChildren(el.children, host.children);
			const ref = el.props.ref;
			if (typeof ref === 'function') ref(host);
			else if (ref && typeof ref === 'object') ref.current = host;
			return host;
		}
		const isClass =
			typeof el.type === 'function' && el.type.prototype && typeof el.type.prototype.render === 'function';
		if (isClass) {
			const node =
				prev !== null && prev.kind === 'class' && prev.type === el.type
					? prev
					: { kind: 'class', type: el.type, instance: new el.type(el.props), child: null };
			node.instance.props = el.props;
			const out = node.instance.render();
			const children = renderChildren(Array.isArray(out) ? out : [out], node.child === null ? [] : node.child);
			node.child = children.length === 1 ? children[0] : { kind: 'host', type: 'div', props: {}, children, addEventListener() {}, removeEventListener() {}, querySelector() { return null; } };
			return node;
		}
		if (typeof el.type === 'function') {
			let node = prev !== null && prev.kind === 'comp' && prev.type === el.type ? prev : null;
			if (node === null) {
				if (prev !== null) unmountTree(prev);
				node = { kind: 'comp', type: el.type, props: el.props, hooks: [], slots: [], dead: false };
			}
			node.props = el.props;
			const savedInstance = currentInstance;
			const savedIndex = hookIndex;
			currentInstance = node;
			hookIndex = 0;
			drainStates(node);
			let out;
			try {
				out = node.type(node.props);
			} finally {
				currentInstance = savedInstance;
				hookIndex = savedIndex;
			}
			node.slots = renderChildren(Array.isArray(out) ? out : [out], node.slots);
			return node;
		}
		throw new Error('harness: unsupported element type ' + String(el.type));
	};

	const commitEffects = (node) => {
		if (node === null || node === undefined) return;
		if (node.kind === 'comp') {
			for (const cell of node.hooks) {
				if (cell.kind !== 'effect') continue;
				if (!cell.ran) {
					cell.ran = true;
					if (cell.pendingFn !== undefined) {
						cell.fn = cell.pendingFn;
						cell.deps = cell.pendingDeps;
						cell.pendingFn = undefined;
						cell.pendingDeps = undefined;
					}
					cell.cleanup = runGuarded(cell.fn);
					continue;
				}
				if (cell.pendingFn === undefined && cell.pendingDeps === undefined) continue;
				const nextFn = cell.pendingFn !== undefined ? cell.pendingFn : cell.fn;
				const nextDeps = cell.pendingDeps !== undefined ? cell.pendingDeps : cell.deps;
				cell.pendingFn = undefined;
				cell.pendingDeps = undefined;
				if (!sameDeps(cell.deps, nextDeps)) {
					if (typeof cell.cleanup === 'function') runGuarded(cell.cleanup);
					cell.fn = nextFn;
					cell.deps = nextDeps;
					cell.cleanup = runGuarded(cell.fn);
				} else {
					cell.fn = nextFn;
					cell.deps = nextDeps;
				}
			}
			node.slots.forEach(commitEffects);
			return;
		}
		if (node.kind === 'class') {
			commitEffects(node.child);
			return;
		}
		if (node.kind === 'host') {
			node.children.forEach(commitEffects);
		}
	};

	const flushAll = () => {
		let guard = 0;
		while (pendingUpdates > 0 && guard < 500) {
			guard += 1;
			for (const root of [...roots]) {
				if (root.dead) continue;
				root.tree = renderInstance(root.el, root.tree);
			}
			for (const root of [...roots]) {
				if (root.dead) continue;
				commitEffects(root.tree);
			}
		}
	};

	const collectText = (node) => {
		if (node === null || node === undefined) return '';
		if (node.kind === 'text') return node.text;
		if (node.kind === 'host') return node.children.map(collectText).join('');
		if (node.kind === 'comp') return node.slots.map(collectText).join('');
		if (node.kind === 'class') return collectText(node.child);
		return '';
	};

	const collectHosts = (node, out) => {
		if (node === null || node === undefined) return;
		if (node.kind === 'host') {
			out.push({ type: node.type, props: node.props, text: node.children.map(collectText).join('') });
			node.children.forEach((child) => collectHosts(child, out));
			return;
		}
		if (node.kind === 'comp') {
			node.slots.forEach((child) => collectHosts(child, out));
			return;
		}
		if (node.kind === 'class') {
			collectHosts(node.child, out);
		}
	};

	const mount = (el) => {
		const root = { el, tree: null, dead: false };
		roots.add(root);
		root.tree = renderInstance(el, null);
		commitEffects(root.tree);
		return {
			unmount: () => {
				unmountTree(root.tree);
				root.dead = true;
				roots.delete(root);
			},
			nodes: () => {
				const out = [];
				collectHosts(root.tree, out);
				return out;
			},
		};
	};

	const act = async (fn) => {
		const value = await (fn ? fn() : undefined);
		for (let i = 0; i < 12; i += 1) {
			flushAll();
			await Promise.resolve();
			await Promise.resolve();
		}
		flushAll();
		return value;
	};

	/* Engine self-check: prove the three lifecycle guarantees before trusting
	 * the harness with the regression record. */
	const selfCheck = async () => {
		let runsFixed = 0;
		let runsChanging = 0;
		let cleanupsFixed = 0;
		let cleanupsChanging = 0;
		const Probe = () => {
			const [n, setN] = useState(0);
			const fixed = useMemo(() => ({ tag: 'fixed' }), []);
			useEffect(() => {
				runsFixed += 1;
				return () => {
					cleanupsFixed += 1;
				};
			}, [fixed]);
			useEffect(() => {
				runsChanging += 1;
				return () => {
					cleanupsChanging += 1;
				};
			}, [n]);
			return createElement('button', { onClick: () => setN(n + 1) }, String(n));
		};
		const handle = mount(createElement(Probe));
		await act(async () => {});
		await act(async () => {
			handle.nodes()[0].props.onClick();
		});
		await act(async () => {
			handle.nodes()[0].props.onClick();
		});
		handle.unmount();
		const checks = [
			[runsFixed === 1, `stable deps run once (got ${runsFixed})`],
			[runsChanging === 3, `changed deps re-run (got ${runsChanging})`],
			[cleanupsFixed === 1, `cleanup on unmount (fixed: ${cleanupsFixed})`],
			[cleanupsChanging === 3, `cleanups on each dep change + unmount (changing: ${cleanupsChanging})`],
		];
		const failed = checks.filter(([ok]) => !ok).map(([, why]) => why);
		if (failed.length > 0) throw new Error('harness self-check failed: ' + failed.join('; '));
		return 'ok';
	};

	return {
		React,
		label: 'harness-fallback (equivalent lifecycle semantics implemented in this tool)',
		real: false,
		mount,
		act,
		selfCheck,
	};
}

const realResolved = resolveRealEngine();
const engine = realResolved ? makeRealEngine(realResolved) : makeHarnessEngine();

if (realResolved) {
	console.log(`[detail-lifecycle-check] react engine: ${engine.label}`);
} else {
	console.log('[detail-lifecycle-check] react engine: harness fallback — no react@18 + react-test-renderer@18 in DSH_TEST_REACT_DIR, ./node_modules, or tools/.react/node_modules');
	console.log('[notice] in-tool harness provides the equivalent lifecycle semantics: (a) Object.is dependency comparison, (b) cleanups on dependency change and unmount, (c) queued state updates flushed into re-renders that only re-run effects whose deps changed.');
}

if (engine.selfCheck) {
	const verdict = await engine.selfCheck();
	console.log(`[detail-lifecycle-check] engine self-check: ${verdict}`);
}

/* ================================================================
 * Part 2 — browser-global stubs and a scripted workspace service.
 * ================================================================ */

const okRun = (value) => ({
	ok: true,
	exitCode: 0,
	timedOut: false,
	durationMs: 1,
	stdout: { json: true, value },
	stderr: '',
});

const failRun = (stderr) => ({
	ok: true,
	exitCode: 1,
	timedOut: false,
	durationMs: 1,
	stdout: { json: true, value: null },
	stderr,
});

const showSuccess = (id, description) =>
	okRun({ bug: [{ id, description, status: '开发中', owner: '张三' }] });

const statusPayload = (projectId, wecom) => ({
	ok: true,
	clis: {
		tapd: {
			command: 'tapd',
			available: true,
			installHint: '',
			auth: {
				state: 'authorized',
				method: 'token',
				workspace: { id: projectId, name: projectId === 'projB' ? 'Project B' : 'Project A', state: 'ok' },
			},
		},
		wecom: { command: 'wecom', available: wecom, installHint: '', auth: { state: 'authorized', workspace: null } },
	},
});

const jsonResponse = (payload) => ({ ok: true, status: 200, json: async () => payload });

/* The whole tool runs in a DOM-less Node process: document / window /
 * requestAnimationFrame / ResizeObserver stubs are installed ONCE for the
 * entire run (never restored). Restoring them per-scenario let late async
 * continuations re-render a detached tree after `restore()` had deleted the
 * stubs, producing stray `ReferenceError: document is not defined` noise in
 * real-React mode even though every scenario passed. Only `fetch` is
 * per-scenario state and gets restored. */
function installDomStubs() {
	if (typeof globalThis.document !== 'object' || globalThis.document === null) {
		globalThis.document = {
			addEventListener() {},
			removeEventListener() {},
			createElement: () => ({ setAttribute() {}, remove() {}, style: {} }),
			body: { appendChild() {}, removeChild() {} },
		};
	}
	if (typeof globalThis.window !== 'object' || globalThis.window === null) globalThis.window = { open: () => null };
	if (typeof globalThis.requestAnimationFrame !== 'function') {
		globalThis.requestAnimationFrame = (fn) => (fn(0), 0);
	}
	if (typeof globalThis.ResizeObserver !== 'function') {
		globalThis.ResizeObserver = class {};
	}
}
installDomStubs();

function installEnv(options) {
	const saved = {
		fetch: globalThis.fetch,
	};

	const env = {
		runs: [],
		shows: [],
		loginCalls: [],
		statusProject: options.project ?? 'projA',
		todos: options.todos ?? { bug: [], story: [], task: [] },
		wecomTodos: options.wecomTodos ?? [],
		setStatusProject(id) {
			env.statusProject = id;
		},
		restore() {
			for (const key of Object.keys(saved)) {
				if (saved[key] === undefined) delete globalThis[key];
				else globalThis[key] = saved[key];
			}
		},
	};

	const runRoute = (body) => {
		const { cli, args } = body;
		if (cli === 'tapd') {
			if (args[0] === 'workspace' && args[1] === 'list') {
				return okRun({ items: [{ id: 'projA', name: 'Project A' }, { id: 'projB', name: 'Project B' }] });
			}
			if (args[0] === 'workitem-type') return okRun([{ id: 'w1', entity_type: 'bug', name: '缺陷' }]);
			if (args[1] === 'status-map') return okRun([]);
			if (args[1] === 'todo') return okRun((env.todos[args[0]] ?? []).slice());
			if (args[1] === 'show') return null; /* gated — scenario-controlled */
			return okRun({});
		}
		if (cli === 'wecom') {
			if (args[0] === 'todo') return okRun(env.wecomTodos.slice());
			if (args[0] === 'doc') return okRun([]);
			return okRun({});
		}
		return okRun({});
	};

	const loginHandler =
		options.login ??
		((body) => {
			/* Default: the host persists the switch on success. */
			if (body.workspaceId !== undefined) env.statusProject = body.workspaceId;
			return { ok: true };
		});

	globalThis.fetch = async (url, init) => {
		const target = String(url);
		if (target.endsWith('/ws/status')) {
			return jsonResponse(statusPayload(env.statusProject, options.wecom === true));
		}
		if (target.endsWith('/ws/login')) {
			const body = JSON.parse(init.body);
			env.loginCalls.push(body);
			return jsonResponse(await loginHandler(body));
		}
		if (target.endsWith('/ws/run')) {
			const body = JSON.parse(init.body);
			env.runs.push(body);
			const routed = runRoute(body);
			if (routed !== null) return jsonResponse(routed);
			const entry = { cli: body.cli, args: body.args, payload: null, resolved: false };
			const gate = new Promise((resolve) => {
				entry.resolve = (payload) => {
					entry.payload = payload;
					entry.resolved = true;
					resolve(payload);
				};
			});
			env.shows.push(entry);
			return gate.then((payload) => jsonResponse(payload));
		}
		if (target.endsWith('/ws/open-url')) return jsonResponse({ ok: true, opened: true });
		return jsonResponse({ ok: true });
	};

	return env;
}

/* ================================================================
 * Part 3 — load the real workspace module (src/workspace.js is a bare
 * function expression; evaluated as source, exactly like build.mjs does).
 * ================================================================ */

function loadWorkspaceModule() {
	const factory = new Function(`${workspaceSrc}\nreturn createWorkspace;`)();
	const requireShim = (name) => {
		if (name === 'react') return engine.React;
		throw new Error('unexpected require in test: ' + name);
	};
	return factory(requireShim, { get: () => { throw new Error('no settings in test'); } }, null);
}

const workspaceModule = loadWorkspaceModule();
const h = engine.React.createElement;

/* ================================================================
 * Part 4 — REGRESSION RECORD: the original detail effect, verbatim.
 * Kept for the regression record only; the fixed implementation in
 * src/workspace.js replaced it. Indentation adapted to this fixture,
 * code text unchanged.
 * ================================================================ */

const ORIGINAL_DETAIL_EFFECT = `
		/* [REGRESSION FIXTURE — ORIGINAL IMPLEMENTATION, kept verbatim from
		 * src/workspace.js before the fix. It depends on the whole details
		 * object it mutates: the loading write revokes the in-flight read. */
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
`;

function makeOriginalDetailPanel(readPromise) {
	const React = engine.React;
	const attempt = async () => readPromise;
	const isTapdKind = (kind) => kind === 'bug' || kind === 'story' || kind === 'task';
	const detailFromShow = (value) => value;
	const source = `
		return function OriginalDetailPanel() {
			const [inspectorKey, setInspectorKey] = React.useState('bug:1001');
			const [details, setDetails] = React.useState({});
			const live = { tapd: true };
${ORIGINAL_DETAIL_EFFECT}
			return React.createElement('p', { 'data-phase': (details['bug:1001'] ?? { phase: 'absent' }).phase });
		};
	`;
	return new Function('React', 'attempt', 'isTapdKind', 'detailFromShow', source)(
		React,
		attempt,
		isTapdKind,
		detailFromShow
	);
}

async function regressionRecord() {
	let resolveRead;
	const readPromise = new Promise((resolve) => {
		resolveRead = resolve;
	});
	const Panel = makeOriginalDetailPanel(readPromise);
	const handle = engine.mount(h(Panel));
	await settle();
	const phaseOf = () => {
		const node = handle.nodes().find((n) => n.props['data-phase'] !== undefined);
		return node === undefined ? null : node.props['data-phase'];
	};
	const duringLoading = phaseOf();
	await engine.act(async () => {
		resolveRead({ value: { bug: [{ id: '1001', description: 'FULL-DESC' }] } });
	});
	await settle();
	const afterResult = phaseOf();
	handle.unmount();

	if (duringLoading !== 'loading') {
		throw new Error(`fixture did not reach loading before the result (phase=${duringLoading})`);
	}
	/* The original contract violation: the response is dropped and the view
	 * stays loading forever. PASS means the defect is reproduced. */
	if (afterResult !== 'loading') {
		throw new Error(`original effect unexpectedly published (phase=${afterResult}) — regression record broken`);
	}
	return `reproduced: stuck 'loading' after the read resolved (result dropped)`;
}

/* ================================================================
 * Part 5 — drivers shared by the fixed-implementation scenarios.
 * ================================================================ */

const BUG_A = { id: 'B-1001', title: '登录页崩溃', status: '开发中', severity: '严重', owner: '张三', description: 'SUMMARY-1001' };
const BUG_B = { id: 'B-2002', title: '导出按钮无响应', status: '待处理', severity: '一般', owner: '李四', description: 'SUMMARY-2002' };
const WECOM_TODO = { id: 'W-9', title: '周报提醒', content: '本周周报' };

async function settle(rounds = 5) {
	for (let i = 0; i < rounds; i += 1) {
		await engine.act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	}
}

async function bootPanel(options = {}) {
	const env = installEnv(options);
	const handle = engine.mount(h(workspaceModule.RawPanel));
	await settle();
	return {
		env,
		handle,
		async dispose() {
			try {
				handle.unmount();
			} catch {
				/* already unmounted */
			}
			env.restore();
			await settle(2);
		},
	};
}

const nodeText = (n) => (n && typeof n.text === 'string' ? n.text : '');
const findButton = (handle, needle) =>
	handle.nodes().find((n) => n.type === 'button' && n.props.onClick !== undefined && nodeText(n).includes(needle));
const byId = (handle, id) => handle.nodes().find((n) => n.props.id === id);
const detailPhase = (handle) => {
	const n = handle.nodes().find((x) => x.props['data-detail-phase'] !== undefined);
	return n === undefined ? null : n.props['data-detail-phase'];
};
const detailNote = (handle) => {
	const n = handle.nodes().find((x) => x.props['data-detail-phase'] !== undefined);
	return n === undefined ? '' : nodeText(n);
};
const richHtml = (handle) => {
	const n = handle.nodes().find((x) => x.props.dangerouslySetInnerHTML !== undefined);
	return n === undefined ? '' : String(n.props.dangerouslySetInnerHTML.__html ?? '');
};
const inspectorOpen = (handle) =>
	handle.nodes().some((n) => n.props['data-detail-phase'] !== undefined || n.props['aria-label'] === '关闭详情');
const showCalls = (env) => env.shows.length;

const click = async (node) => {
	if (node === undefined) throw new Error('click target not found');
	await engine.act(async () => {
		node.props.onClick();
	});
	await settle();
};

const openItem = async (handle, { tab = 'bugs', title }) => {
	await click(handle.nodes().find((n) => n.props['data-tab-id'] === tab && n.props.onClick !== undefined));
	await click(findButton(handle, title));
};

const switchProject = async (handle, name) => {
	await click(byId(handle, 'projectTrigger'));
	await click(findButton(handle, name));
};

const resolveShow = async (env, index, payload) => {
	if (env.shows[index] === undefined) throw new Error(`show gate ${index} does not exist (have ${env.shows.length})`);
	env.shows[index].resolve(payload);
	await settle();
};

const expect = (condition, message) => {
	if (condition !== true) throw new Error(message);
};

/* ================================================================
 * Part 6 — scenarios (fixed implementation), per design.md §"Test
 * lifecycle behavior" minimum evidence list.
 * ================================================================ */

const scenarios = [
	{
		name: 'regression record: original implementation fails the contract',
		run: regressionRecord,
	},
	{
		name: 'delayed success after the loading state rendered',
		options: { todos: { bug: [BUG_A], story: [], task: [] } },
		async run() {
			const ctx = await bootPanel(this.options);
			try {
				await openItem(ctx.handle, { title: BUG_A.title });
				expect(detailPhase(ctx.handle) === 'loading', 'expected loading phase after open');
				await resolveShow(ctx.env, 0, showSuccess(BUG_A.id, 'FULL-DESC-A'));
				expect(detailPhase(ctx.handle) === 'done', `expected done, got ${detailPhase(ctx.handle)}`);
				expect(richHtml(ctx.handle).includes('FULL-DESC-A'), 'expected full description rendered');
				expect(showCalls(ctx.env) === 1, `expected 1 read, got ${showCalls(ctx.env)}`);
			} finally {
				await ctx.dispose();
			}
			return 'loading → done, one read';
		},
	},
	{
		name: 'A/B responses out of order',
		options: { todos: { bug: [BUG_A, BUG_B], story: [], task: [] } },
		async run() {
			const ctx = await bootPanel(this.options);
			try {
				await openItem(ctx.handle, { title: BUG_A.title });
				await openItem(ctx.handle, { title: BUG_B.title });
				expect(detailPhase(ctx.handle) === 'loading', 'B should be loading while both reads are out');
				await resolveShow(ctx.env, 1, showSuccess(BUG_B.id, 'FULL-B'));
				expect(detailPhase(ctx.handle) === 'done', 'B settles from its own read');
				expect(richHtml(ctx.handle).includes('FULL-B'), 'B shows its own record');
				await resolveShow(ctx.env, 0, showSuccess(BUG_A.id, 'FULL-A'));
				expect(richHtml(ctx.handle).includes('FULL-B'), "A's late result must not replace B's view");
				expect(!richHtml(ctx.handle).includes('FULL-A'), "A's late content must not leak into B's view");
				expect(detailPhase(ctx.handle) === 'done', 'view stays done after late arrival');
				expect(showCalls(ctx.env) === 2, 'exactly two reads');
			} finally {
				await ctx.dispose();
			}
			return 'late A never replaces B';
		},
	},
	{
		name: 'same item id in different projects',
		options: { todos: { bug: [BUG_A], story: [], task: [] } },
		async run() {
			const ctx = await bootPanel(this.options);
			try {
				await openItem(ctx.handle, { title: BUG_A.title });
				await resolveShow(ctx.env, 0, showSuccess(BUG_A.id, 'FULL-PROJ-A'));
				expect(detailPhase(ctx.handle) === 'done', 'projA read done');
				await switchProject(ctx.handle, 'Project B');
				expect(!inspectorOpen(ctx.handle), 'inspector closed after project switch');
				await openItem(ctx.handle, { title: BUG_A.title });
				expect(showCalls(ctx.env) === 2, 'same id in projB must issue a fresh read');
				expect(detailPhase(ctx.handle) === 'loading', 'fresh read in loading');
				await resolveShow(ctx.env, 1, showSuccess(BUG_A.id, 'FULL-PROJ-B'));
				expect(richHtml(ctx.handle).includes('FULL-PROJ-B'), 'projB content shown');
				expect(!richHtml(ctx.handle).includes('FULL-PROJ-A'), 'projA cache must not leak across projects');
			} finally {
				await ctx.dispose();
			}
			return 'project-scoped keys, no cross-project reuse';
		},
	},
	{
		name: 'close and reopen a pending item joins the outstanding read',
		options: { todos: { bug: [BUG_A], story: [], task: [] } },
		async run() {
			const ctx = await bootPanel(this.options);
			try {
				await openItem(ctx.handle, { title: BUG_A.title });
				expect(detailPhase(ctx.handle) === 'loading', 'loading before close');
				await click(ctx.handle.nodes().find((n) => n.props['aria-label'] === '关闭详情'));
				expect(!inspectorOpen(ctx.handle), 'inspector closed');
				expect(showCalls(ctx.env) === 1, 'closing does not add reads');
				await openItem(ctx.handle, { title: BUG_A.title });
				expect(showCalls(ctx.env) === 1, 'reopen rejoins the outstanding read');
				expect(detailPhase(ctx.handle) === 'loading', 'still loading while the original read is out');
				await resolveShow(ctx.env, 0, showSuccess(BUG_A.id, 'FULL-A'));
				expect(detailPhase(ctx.handle) === 'done', 'read settles after reopen');
				expect(richHtml(ctx.handle).includes('FULL-A'), 'content published to the reopened view');
			} finally {
				await ctx.dispose();
			}
			return 'one outstanding read per key';
		},
	},
	{
		name: 'completed cache reuse (reopen = no additional read)',
		options: { todos: { bug: [BUG_A], story: [], task: [] } },
		async run() {
			const ctx = await bootPanel(this.options);
			try {
				await openItem(ctx.handle, { title: BUG_A.title });
				await resolveShow(ctx.env, 0, showSuccess(BUG_A.id, 'FULL-CACHED'));
				expect(detailPhase(ctx.handle) === 'done', 'first visit done');
				await click(ctx.handle.nodes().find((n) => n.props['aria-label'] === '关闭详情'));
				await openItem(ctx.handle, { title: BUG_A.title });
				expect(showCalls(ctx.env) === 1, 'completed record served from cache');
				expect(detailPhase(ctx.handle) === 'done', 'cache hit renders done immediately');
				expect(richHtml(ctx.handle).includes('FULL-CACHED'), 'cached content rendered');
			} finally {
				await ctx.dispose();
			}
			return 'same panel+project lifecycle reuses completed records';
		},
	},
	{
		name: 'failure → Retry → success',
		options: { todos: { bug: [{ ...BUG_A, description: '' }], story: [], task: [] } },
		async run() {
			const ctx = await bootPanel(this.options);
			try {
				await openItem(ctx.handle, { title: BUG_A.title });
				await resolveShow(ctx.env, 0, failRun('模拟失败'));
				expect(detailPhase(ctx.handle) === 'error', `expected error, got ${detailPhase(ctx.handle)}`);
				expect(detailNote(ctx.handle).includes('读取失败'), 'error note rendered');
				expect(findButton(ctx.handle, '重试读取') !== undefined, 'Retry exposed on failure');
				await click(findButton(ctx.handle, '重试读取'));
				expect(showCalls(ctx.env) === 2, 'retry issues a new read');
				expect(detailPhase(ctx.handle) === 'loading', 'retry shows progress');
				await resolveShow(ctx.env, 1, showSuccess(BUG_A.id, 'FULL-RETRY'));
				expect(detailPhase(ctx.handle) === 'done', 'retry replaced error with success');
				expect(richHtml(ctx.handle).includes('FULL-RETRY'), 'retried content rendered');
			} finally {
				await ctx.dispose();
			}
			return 'error actionable and retriable';
		},
	},
	{
		name: 'repeated retry while pending = one outstanding read',
		options: { todos: { bug: [BUG_A], story: [], task: [] } },
		async run() {
			const ctx = await bootPanel(this.options);
			try {
				await openItem(ctx.handle, { title: BUG_A.title });
				await resolveShow(ctx.env, 0, failRun('模拟失败'));
				await click(findButton(ctx.handle, '重试读取'));
				expect(showCalls(ctx.env) === 2, 'first retry issues one read');
				const retryAgain = findButton(ctx.handle, '重试读取');
				if (retryAgain !== undefined) await click(retryAgain);
				expect(showCalls(ctx.env) === 2, 'repeat retry while pending is ignored');
				await resolveShow(ctx.env, 1, showSuccess(BUG_A.id, 'FULL-DEDUPE'));
				expect(detailPhase(ctx.handle) === 'done', 'single retry settles');
			} finally {
				await ctx.dispose();
			}
			return 'no duplicate reads per key';
		},
	},
	{
		name: 'failed project switch resumes the confirmed project',
		options: {
			todos: { bug: [BUG_A], story: [], task: [] },
			login: async () => ({ ok: false, message: 'workspace 切换失败' }),
		},
		async run() {
			const ctx = await bootPanel(this.options);
			try {
				await openItem(ctx.handle, { title: BUG_A.title });
				await resolveShow(ctx.env, 0, showSuccess(BUG_A.id, 'FULL-A'));
				expect(detailPhase(ctx.handle) === 'done', 'pre-switch read done');
				await switchProject(ctx.handle, 'Project B');
				expect(!inspectorOpen(ctx.handle), 'failed switch detaches the old view');
				await openItem(ctx.handle, { title: BUG_A.title });
				expect(showCalls(ctx.env) === 2, 'confirmed project serves a fresh read with clean request state');
				expect(detailPhase(ctx.handle) === 'loading', 'fresh read loading');
				await resolveShow(ctx.env, 1, showSuccess(BUG_A.id, 'FULL-RESUMED'));
				expect(detailPhase(ctx.handle) === 'done', 'resumed project completes normally');
			} finally {
				await ctx.dispose();
			}
			return 'failed switch leaves an empty, working request state';
		},
	},
	{
		name: 'externally observed project change invalidates details',
		options: { todos: { bug: [BUG_A], story: [], task: [] } },
		async run() {
			const ctx = await bootPanel(this.options);
			try {
				await openItem(ctx.handle, { title: BUG_A.title });
				await resolveShow(ctx.env, 0, showSuccess(BUG_A.id, 'FULL-A'));
				expect(detailPhase(ctx.handle) === 'done', 'initial read done');
				ctx.env.setStatusProject('projB');
				await click(byId(ctx.handle, 'refreshButton'));
				expect(!inspectorOpen(ctx.handle), 'later status read with a different project detaches the inspector');
				/* The invalidation lands one commit after the projectId change, so a
				 * single stray read may slip out before the watcher clears the view.
				 * It is epoch-guarded: settle it and require that it stays dropped. */
				const strays = ctx.env.shows.filter((s) => !s.resolved).length;
				for (const entry of ctx.env.shows) {
					if (!entry.resolved) entry.resolve(showSuccess(BUG_A.id, 'FULL-STALE'));
				}
				await settle();
				expect(!inspectorOpen(ctx.handle), 'stray read across the project flip did not publish');
				const beforeReopen = showCalls(ctx.env);
				await openItem(ctx.handle, { title: BUG_A.title });
				expect(showCalls(ctx.env) === beforeReopen + 1, `reopen issues exactly one fresh read (strays before: ${strays})`);
				await resolveShow(ctx.env, ctx.env.shows.length - 1, showSuccess(BUG_A.id, 'FULL-B'));
				expect(detailPhase(ctx.handle) === 'done', 'new project read completes');
				expect(richHtml(ctx.handle).includes('FULL-B'), 'new project content rendered');
			} finally {
				await ctx.dispose();
			}
			return 'host-status project flips invalidate';
		},
	},
	{
		name: 'unmount invalidation (late result cannot publish or reopen)',
		options: { todos: { bug: [BUG_A], story: [], task: [] } },
		async run() {
			const env = installEnv(this.options);
			try {
				const first = engine.mount(h(workspaceModule.RawPanel));
				await settle();
				await openItem(first, { title: BUG_A.title });
				expect(detailPhase(first) === 'loading', 'loading before unmount');
				first.unmount();
				await engine.act(async () => {
					env.shows[0].resolve(showSuccess(BUG_A.id, 'FULL-LATE'));
				});
				await settle();

				const second = engine.mount(h(workspaceModule.RawPanel));
				await settle();
				expect(!inspectorOpen(second), 'late result did not reopen or publish after remount');
				await openItem(second, { title: BUG_A.title });
				expect(showCalls(env) === 2, 'remounted panel issues a fresh read');
				await resolveShow(env, 1, showSuccess(BUG_A.id, 'FULL-REOPEN'));
				expect(detailPhase(second) === 'done', 'remounted panel completes normally');
				second.unmount();
			} finally {
				env.restore();
				await settle(2);
			}
			return 'panel disposal invalidates publication rights';
		},
	},
	{
		name: 'empty description → explicit no-description outcome',
		options: { todos: { bug: [{ ...BUG_A, description: '' }], story: [], task: [] } },
		async run() {
			const ctx = await bootPanel(this.options);
			try {
				await openItem(ctx.handle, { title: BUG_A.title });
				expect(detailPhase(ctx.handle) === 'loading', 'loading first');
				await resolveShow(ctx.env, 0, showSuccess(BUG_A.id, ''));
				expect(detailPhase(ctx.handle) === 'done', `empty description settles done, got ${detailPhase(ctx.handle)}`);
				expect(detailNote(ctx.handle).includes('这条工作项没有描述内容'), 'explicit no-description note');
			} finally {
				await ctx.dispose();
			}
			return 'no-description is a done outcome, not perpetual loading';
		},
	},
	{
		name: 'summary content retained while the complete record loads',
		options: { todos: { bug: [BUG_A], story: [], task: [] } },
		async run() {
			const ctx = await bootPanel(this.options);
			try {
				await openItem(ctx.handle, { title: BUG_A.title });
				expect(detailPhase(ctx.handle) === 'loading', 'loading with summary available');
				expect(richHtml(ctx.handle).includes('SUMMARY-1001'), 'summary stays visible while loading');
				expect(!detailNote(ctx.handle).includes('失败'), 'summary must not be presented as failure');
				await resolveShow(ctx.env, 0, showSuccess(BUG_A.id, 'FULL-DESC'));
				expect(richHtml(ctx.handle).includes('FULL-DESC'), 'complete record replaces the summary');
				expect(!richHtml(ctx.handle).includes('SUMMARY-1001'), 'summary swapped out');
			} finally {
				await ctx.dispose();
			}
			return 'summary retained, then replaced';
		},
	},
	{
		name: 'non-TAPD item types keep the summary-only path',
		options: { wecom: true, todos: { bug: [BUG_A], story: [], task: [] }, wecomTodos: [WECOM_TODO] },
		async run() {
			const ctx = await bootPanel(this.options);
			try {
				await openItem(ctx.handle, { tab: 'docs', title: WECOM_TODO.title });
				await settle();
				expect(showCalls(ctx.env) === 0, 'no detail read issued for wecom items');
				expect(detailPhase(ctx.handle) === 'absent', `expected absent phase, got ${detailPhase(ctx.handle)}`);
				expect(detailNote(ctx.handle).includes('这条记录没有描述内容'), 'plain no-content note for non-TAPD kinds');
			} finally {
				await ctx.dispose();
			}
			return 'no detail reads for non-TAPD kinds';
		},
	},
];

/* ================================================================
 * Part 7 — static source canaries (complement the behavioral runs;
 * the check must not rely on source text alone).
 * ================================================================ */

const canaries = [
	[workspaceSrc.includes("id: 'detailRetry'"), 'retry action present in the panel'],
	[workspaceSrc.includes("'data-detail-phase'"), 'rendered detail phase marker present'],
	[workspaceSrc.includes('const detailReads = React.useRef'), 'panel-owned detail request registry present'],
	[workspaceSrc.includes('[inspectorKey, live.tapd, projectId, workspaceBusy]'), 'detail effect keyed by view/project, not the rendered details object'],
	[!/\}, \[inspectorKey, live\.tapd, details\]\)/.test(workspaceSrc), 'original details-dependent dependency array removed'],
	[workspaceSrc.includes('invalidateDetailReads'), 'project/panel invalidation present'],
];

/* ================================================================
 * Part 8 — run everything, print the summary, exit.
 * ================================================================ */

const results = [];
for (const scenario of scenarios) {
	try {
		const note = await scenario.run();
		results.push({ name: scenario.name, ok: true, note });
		console.log(`  ok   ${scenario.name} — ${note}`);
	} catch (error) {
		results.push({ name: scenario.name, ok: false, note: error.message });
		console.log(`  FAIL ${scenario.name} — ${error.message}`);
	}
}

const canaryResults = [];
for (const [condition, label] of canaries) {
	canaryResults.push({ label, ok: condition === true });
	if (!condition) console.log(`  FAIL canary: ${label}`);
}

const passed = results.filter((r) => r.ok).length;
const canariesPassed = canaryResults.filter((c) => c.ok).length;
const failedNames = results.filter((r) => !r.ok).map((r) => r.name);
const summaryLines = [
	`detail-lifecycle-check: ${passed}/${results.length} scenarios passed, ${canariesPassed}/${canaryResults.length} source canaries passed`,
	`detail-lifecycle-check engine: ${engine.label}`,
];
console.log('');
for (const line of summaryLines) console.log(line);

const exitCode = passed === results.length && canariesPassed === canaryResults.length ? 0 : 1;
if (exitCode !== 0 && failedNames.length > 0) {
	console.log(`detail-lifecycle-check: failing scenarios: ${failedNames.join('; ')}`);
}
process.exit(exitCode);
