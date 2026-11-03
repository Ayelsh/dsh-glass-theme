#!/usr/bin/env node
/**
 * OpenSpec: refine-glass-performance-and-interactions — task 3.1.
 *
 * Headless behavioral check for the model/reasoning-effort picker's
 * selection feedback (spec: model-picker-feedback). Drives the REAL
 * Picker component against a controlled public directory store and
 * asserts scenario behavior — never source patterns.
 *
 * Backend preference (per design.md "Test lifecycle behavior"):
 *   1. Real React 18 + react-test-renderer, resolved from (in order):
 *      env DSH_TEST_REACT_DIR, <repo>/node_modules, tools/.react/node_modules.
 *      A test-only install there is allowed and NOT a package.json dependency:
 *        npm install --prefix tools/.react react@18.2.0 react-dom@18.2.0 react-test-renderer@18.2.0
 *   2. Otherwise: the built-in lifecycle-aware harness below, which compares
 *      effect dependencies, runs cleanups, and reschedules state updates.
 *      The fallback is announced in the output — never a silent skip.
 *
 * Run: node tools/picker-feedback-check.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const QUIET = { silent: true };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flushMicro = () => new Promise((resolve) => Promise.resolve().then(resolve));

/* ============================================================================
 * 1. Mock browser environment (the picker is a browser component; these are
 *    the ONLY globals it touches: document, window, Node, Element,
 *    ResizeObserver, and the timer functions Node already has).
 * ========================================================================== */

const focusLog = [];
const docHandlers = new Map();
const winHandlers = new Map();
const lsData = new Map();

function recordHandler(map, type, fn) {
	if (!map.has(type)) map.set(type, new Set());
	map.get(type).add(fn);
}
function dropHandler(map, type, fn) {
	if (map.has(type)) map.get(type).delete(fn);
}

function tagForElement(props, key) {
	/* react-test-renderer's createNodeMock receives {type, props} WITHOUT the
	   element key, so the seg buttons carry data-lg-effort for this. */
	if (props && props.role === 'radio') {
		const id = props['data-lg-effort'] || key || String(props.title || props.children || '');
		return 'effort:' + id;
	}
	if (props && typeof props.className === 'string' && props.className.indexOf('lg-picker-more') >= 0) return 'opener';
	if (props && typeof props.className === 'string' && props.className.indexOf('lg-picker-trigger') >= 0) return 'trigger';
	if (props && typeof props.className === 'string' && props.className.indexOf('lg-picker-card') >= 0) return 'card';
	if (props && props['data-lg-model']) return 'model:' + props['data-lg-provider'] + '/' + props['data-lg-model'];
	if (props && props['aria-label']) return 'label:' + props['aria-label'];
	return 'node';
}

function makeMockNode(tag) {
	return {
		__tag: tag,
		isConnected: true,
		focus() {
			focusLog.push(tag);
		},
		contains() {
			return false;
		},
		closest() {
			return null;
		},
		getBoundingClientRect() {
			return { top: 300, bottom: 340, left: 100, right: 300, width: 200, height: 40 };
		},
		offsetHeight: 120,
		offsetWidth: 360,
		setAttribute() {},
		removeAttribute() {},
		appendChild() {},
	};
}

class MockNodeBase {}
class MockElement extends MockNodeBase {
	constructor(tag) {
		super();
		Object.assign(this, makeMockNode(tag));
	}
}

function installGlobals() {
	globalThis.Node = MockNodeBase;
	globalThis.Element = MockElement;
	const hostStub = makeMockNode('host');
	const seatNode = makeMockNode('seat');
	const slotStub = {
		firstElementChild: hostStub,
		querySelector: () => null,
		appendChild: () => seatNode,
	};
	globalThis.document = {
		body: makeMockNode('body'),
		querySelector: (selector) => (String(selector).indexOf('conversation.input.model') >= 0 ? slotStub : null),
		createElement: () => new MockElement('created'),
		addEventListener: (type, fn) => recordHandler(docHandlers, type, fn),
		removeEventListener: (type, fn) => dropHandler(docHandlers, type, fn),
	};
	globalThis.window = {
		innerWidth: 1280,
		innerHeight: 800,
		addEventListener: (type, fn) => recordHandler(winHandlers, type, fn),
		removeEventListener: (type, fn) => dropHandler(winHandlers, type, fn),
		localStorage: {
			getItem: (key) => (lsData.has(key) ? lsData.get(key) : null),
			setItem: (key, value) => lsData.set(key, String(value)),
			removeItem: (key) => lsData.delete(key),
		},
	};
	globalThis.ResizeObserver = class MockResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

/* ============================================================================
 * 2. Backend A: real React 18 + react-test-renderer.
 *    react-test-renderer hosts the tree (hooks, effects, refs all real); the
 *    picker's createPortal calls are inlined (children returned) because
 *    test-renderer cannot mount react-dom portals — noted in tryRealBackend.
 * ========================================================================== */

function tryRealBackend() {
	const candidates = [];
	if (process.env.DSH_TEST_REACT_DIR) candidates.push(path.resolve(root, process.env.DSH_TEST_REACT_DIR));
	candidates.push(path.join(root, 'node_modules'));
	candidates.push(path.join(here, '.react', 'node_modules'));
	/* Repo-local test-only install target (kept out of package.json). */
	candidates.push(path.join(root, '.react18', 'node_modules'));
	for (const dir of candidates) {
		let req;
		try {
			req = createRequire(path.join(dir, 'noop.js'));
		} catch {
			continue;
		}
		let React;
		let TestRenderer;
		try {
			React = req('react');
			TestRenderer = req('react-test-renderer');
		} catch {
			continue;
		}
		if (!React || !React.createElement || !TestRenderer) continue;
		const act = TestRenderer.act || React.act;
		if (typeof act !== 'function') continue;
		/* react-test-renderer 18.2.0 cannot host ReactDOM.createPortal (it
		   rejects any non-DOM container), so the picker's portals are INLINED
		   by the 'react-dom' shim (see mountPicker): createPortal(children)
		   returns the children. React itself — reconciler, hooks with real
		   dependency comparison, effect cleanups, ref detach order — is the
		   real 18.2.0 install; only the portal container indirection, which
		   carries none of the picker logic under test, is unwrapped. */
		const createNodeMock = (element) =>
			new MockElement(tagForElement(element.props, element.key));
		const mount = (element) => {
			const renderer = TestRenderer.create(element, { createNodeMock });
			return {
				unmount() {
					renderer.unmount();
				},
				root: () => renderer.root,
			};
		};
		return {
			kind: 'real-react-18',
			where: dir,
			React,
			createPortal: null,
			mount,
			act,
		};
	}
	return null;
}

/* ============================================================================
 * 3. Backend B: built-in lifecycle-aware harness (fallback, announced).
 *    A small but faithful single-component React: hooks with dependency
 *    comparison, effect cleanups, batched state rescheduling, ref callbacks,
 *    portals rendered inline, and the same findAll/findByProps query shape
 *    react-test-renderer exposes.
 * ========================================================================== */

function makeHarnessBackend() {
	const ELEMENT = Symbol('h.element');
	const PORTAL = Symbol('h.portal');
	let currentInstance = null;
	const pendingInstances = new Set();
	let flushScheduled = false;

	const createElement = (type, props, ...children) => ({
		$$typeof: ELEMENT,
		type,
		key: props && props.key !== undefined ? props.key : null,
		props: props || {},
		children: children.flat(16).filter((child) => child !== null && child !== undefined && child !== false && child !== true),
	});
	const createPortal = (children, _container) => ({ $$typeof: PORTAL, props: {}, children: [children] });

	function scheduleFlush() {
		if (flushScheduled) return;
		flushScheduled = true;
		Promise.resolve().then(() => {
			flushScheduled = false;
			const list = Array.from(pendingInstances);
			pendingInstances.clear();
			for (const inst of list) inst.commit();
		});
	}

	class Instance {
		constructor(element) {
			this.element = element;
			this.hooks = [];
			this.hookIndex = 0;
			this.mounted = false;
			this.queryRoot = null;
			this.prevRefNodes = [];
		}
		rerender() {
			if (!this.mounted) return;
			pendingInstances.add(this);
			scheduleFlush();
		}
		commit() {
			if (!this.mounted) return;
			this.hookIndex = 0;
			currentInstance = this;
			const tree = this.element.type(this.element.props);
			currentInstance = null;
			this.queryRoot = { type: 'h.root', props: {}, children: [], parent: null, __root: true };
			this.queryRoot.children = buildHost(tree, this.queryRoot);
			/* Refs: old inline callbacks get null, new ones get their node —
			   inline ref callbacks are re-invoked every render, matching React. */
			for (const { ref, node } of this.prevRefNodes) {
				try {
					if (typeof ref === 'function') ref(null);
				} catch (error) {
					console.error('ref cleanup failed', error);
				}
			}
			this.prevRefNodes = [];
			attachRefs(this.queryRoot, this.prevRefNodes);
			runEffects(this, 'layout');
			schedulePassive(this);
		}
	}

	function buildHost(element, parent) {
		if (element === null || element === undefined || element === false || element === true) return [];
		if (typeof element === 'string' || typeof element === 'number') return [String(element)];
		if (Array.isArray(element)) return element.flatMap((child) => buildHost(child, parent));
		if (element.$$typeof === PORTAL) return buildHost(element.children, parent);
		if (typeof element.type === 'function') return buildHost(element.type(element.props), parent);
		const node = { type: element.type, key: element.key, props: element.props, children: [], parent };
		node.children = buildHost(element.children, node);
		return [node];
	}

	function attachRefs(node, sink) {
		if (Array.isArray(node.children)) {
			for (const child of node.children) if (child && typeof child === 'object') attachRefs(child, sink);
		}
		const ref = node.props && node.props.ref;
		if (typeof ref === 'function') {
			const mock = new MockElement(tagForElement(node.props, node.key));
			ref(mock);
			sink.push({ ref, node: mock });
		} else if (ref && typeof ref === 'object') {
			ref.current = new MockElement(tagForElement(node.props, node.key));
		}
	}

	function runEffects(inst, kind) {
		for (const slot of inst.hooks) {
			if (!slot || slot.kind !== 'effect' || slot.ran !== kind) continue;
			const changed =
				slot.deps === undefined ||
				slot.prevDeps === null ||
				slot.deps.length !== slot.prevDeps.length ||
				slot.deps.some((dep, index) => !Object.is(dep, slot.prevDeps[index]));
			if (!changed) continue;
			if (typeof slot.cleanup === 'function') slot.cleanup();
			slot.cleanup = slot.fn();
			slot.prevDeps = slot.deps;
		}
	}

	const passiveQueue = new Set();
	function schedulePassive(inst) {
		passiveQueue.add(inst);
		Promise.resolve().then(() => {
			passiveQueue.delete(inst);
			if (inst.mounted) runEffects(inst, 'passive');
		});
	}

	const useState = (initial) => {
		const inst = currentInstance;
		const index = inst.hookIndex++;
		if (!inst.hooks[index]) inst.hooks[index] = { kind: 'state', value: typeof initial === 'function' ? initial() : initial };
		const slot = inst.hooks[index];
		const setValue = (next) => {
			const value = typeof next === 'function' ? next(slot.value) : next;
			if (Object.is(value, slot.value)) return;
			slot.value = value;
			inst.rerender();
		};
		return [slot.value, setValue];
	};
	const useLayoutEffect = (fn, deps) => {
		const inst = currentInstance;
		const index = inst.hookIndex++;
		if (!inst.hooks[index]) inst.hooks[index] = { kind: 'effect', ran: 'layout', fn, deps, prevDeps: null, cleanup: null };
		else Object.assign(inst.hooks[index], { fn, deps });
	};
	const useEffect = (fn, deps) => {
		const inst = currentInstance;
		const index = inst.hookIndex++;
		if (!inst.hooks[index]) inst.hooks[index] = { kind: 'effect', ran: 'passive', fn, deps, prevDeps: null, cleanup: null };
		else Object.assign(inst.hooks[index], { fn, deps });
	};
	const useRef = (initial) => {
		const inst = currentInstance;
		const index = inst.hookIndex++;
		if (!inst.hooks[index]) inst.hooks[index] = { kind: 'ref', current: initial };
		return inst.hooks[index];
	};

	async function act(fn) {
		await fn();
		for (let round = 0; round < 200; round += 1) {
			if (pendingInstances.size === 0 && passiveQueue.size === 0) break;
			await flushMicro();
			await sleep(0);
		}
	}

	const mount = (element) => {
		const inst = new Instance(element);
		inst.mounted = true;
		inst.commit();
		return {
			unmount() {
				inst.mounted = false;
				pendingInstances.delete(inst);
				/* React's teardown order: effect cleanups first, then ref
				   DETACH callbacks (inline refs may still read ref objects),
				   then object refs are nulled. */
				for (const slot of inst.hooks) {
					if (slot && slot.kind === 'effect' && typeof slot.cleanup === 'function') slot.cleanup();
				}
				for (const { ref } of inst.prevRefNodes) if (typeof ref === 'function') ref(null);
				for (const slot of inst.hooks) {
					if (slot && slot.kind === 'ref') slot.current = null;
				}
				inst.prevRefNodes = [];
				inst.queryRoot = null;
			},
			root: () => inst.queryRoot,
		};
	};

	return {
		kind: 'lifecycle-harness',
		where: 'built-in',
		React: { createElement, useState, useEffect, useLayoutEffect, useRef },
		createPortal,
		act,
		mount,
	};
}

/* ============================================================================
 * 4. Query helpers shared by both backends (findAll/findByProps/props/children).
 * ========================================================================== */

function findAllIn(node, predicate, out) {
	const children = Array.isArray(node.children) ? node.children : [];
	for (const child of children) {
		if (child && typeof child === 'object') {
			if (predicate(child)) out.push(child);
			findAllIn(child, predicate, out);
		}
	}
	return out;
}

function makeQuery(getTree) {
	const tree = () => getTree() || { type: 'h.root', props: {}, children: [] };
	const all = (predicate) => findAllIn(tree(), predicate, []);
	/* Scoped search under a card dialog: the same model row can render in
	   BOTH the main card and the all-providers card, and a pick's behavior
	   depends on WHICH card it came from. */
	const within = (scope, predicate) => findAllIn(scope, predicate, []);
	const findByProps = (props) => {
		const hits = all((n) => {
			for (const key of Object.keys(props)) if (n.props[key] !== props[key]) return false;
			return true;
		});
		if (hits.length === 0) return null;
		return hits[0];
	};
	const textOf = (node) => {
		const parts = [];
		const walk = (n) => {
			for (const child of Array.isArray(n.children) ? n.children : []) {
				if (typeof child === 'string') parts.push(child);
				else if (child && typeof child === 'object') walk(child);
			}
		};
		walk(node);
		return parts.join('');
	};
	return { all, within, findByProps, textOf };
}

/* ============================================================================
 * 5. Controlled public directory store.
 * ========================================================================== */

const sessionRef = { current: 'session-a' };

function makeDirectory(initialSnapshot) {
	let snap = initialSnapshot || { current: null, routable: true, groups: [], failures: {}, status: 'loading', pending: true, error: null };
	const listeners = new Set();
	const calls = { load: 0, select: [] };
	const behavior = { select: () => ({ ok: true }), load: () => undefined };
	const directory = {
		store: {
			getSnapshot: () => snap,
			subscribe(fn) {
				listeners.add(fn);
				return () => listeners.delete(fn);
			},
		},
		load() {
			calls.load += 1;
			return behavior.load();
		},
		select(selection) {
			calls.select.push(selection);
			return behavior.select(selection);
		},
	};
	directory.__publish = (patch) => {
		snap = Object.assign({}, snap, patch);
		for (const fn of Array.from(listeners)) fn();
	};
	directory.__calls = calls;
	directory.__behavior = behavior;
	directory.__snapshot = () => snap;
	return directory;
}

function makeDirectoryService() {
	const byKey = new Map();
	return {
		directoryFor(sessionId) {
			const key = sessionId === null || sessionId === undefined ? 'default' : sessionId;
			if (!byKey.has(key)) byKey.set(key, makeDirectory());
			return byKey.get(key);
		},
	};
}

/* ============================================================================
 * 6. Test data + world assembly.
 * ========================================================================== */

const PROV_A = {
	id: 'prov-a',
	name: '甲供应商',
	models: [
		{ id: 'shared', name: 'Shared Model', reasoning: { efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }], defaultEffort: 'high' } },
		{ id: 'a-2', name: 'Alpha Two' },
	],
};
const PROV_B = {
	id: 'prov-b',
	name: '乙供应商',
	models: [
		{ id: 'shared', name: 'Shared Model', reasoning: { efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }] } },
		{ id: 'b-2', name: 'Beta Two' },
	],
};

const snapOf = (over) =>
	Object.assign(
		{ current: null, routable: true, groups: [PROV_A, PROV_B], failures: {}, status: 'ready', pending: false, error: null },
		over || {}
	);

const QUICK_KEY = 'dsh-glass-theme:quick-providers';

let backend = null;
let createPicker = null;
let catalog = null;

function loadPickerFactory() {
	const source = fs.readFileSync(path.join(root, 'src', 'picker.js'), 'utf8');
	return new Function(source + '\nreturn createPicker;')();
}
function loadCatalog() {
	const source = fs.readFileSync(path.join(root, 'src', 'catalog.js'), 'utf8');
	return new Function('return (' + source + ');')();
}

function mountPicker(service) {
	const handleRef = { current: null };
	const requireShim = (name) => {
		if (name === 'react') return backend.React;
		if (name === 'react-dom') {
			/* Inline the picker's portals: see tryRealBackend for why
			   react-test-renderer cannot host real portal containers. */
			return { createPortal: (children) => children };
		}
		if (name === 'react-dom/client') {
			return {
				createRoot() {
					return {
						render(element) {
							if (handleRef.current === null) handleRef.current = backend.mount(element);
						},
						unmount() {
							if (handleRef.current !== null) handleRef.current.unmount();
							handleRef.current = null;
						},
					};
				},
			};
		}
		throw new Error('picker asked for an unexpected module: ' + name);
	};
	const ctx = {
		get(name) {
			if (name === 'uiSession') return { current: { value: { key: sessionRef.current } } };
			if (name === 'modelDirectories') return service;
			throw new Error('service absent: ' + name);
		},
	};
	const api = createPicker(requireShim, ctx, catalog, { key: QUICK_KEY, max: 4 });
	api.mount();
	return {
		api,
		handleRef,
		unmount: () => {
			if (handleRef.current !== null) handleRef.current.unmount();
			handleRef.current = null;
		},
	};
}

async function freshWorld({ snapshot, quick, session = 'session-a' } = {}) {
	sessionRef.current = session;
	if (quick) lsData.set(QUICK_KEY, JSON.stringify(quick));
	else lsData.delete(QUICK_KEY);
	focusLog.length = 0;
	docHandlers.clear();
	winHandlers.clear();
	const service = makeDirectoryService();
	const directory = service.directoryFor(sessionRef.current);
	if (snapshot) directory.__publish(snapshot);
	const { unmount, handleRef } = mountPicker(service);
	const q = makeQuery(() => (handleRef.current === null ? null : handleRef.current.root()));
	const openPicker = async () => {
		const trigger = q.findByProps({ 'aria-label': '选择模型' });
		if (trigger === null) throw new Error('trigger not found');
		await backend.act(async () => {
			trigger.props.onClick();
		});
	};
	const world = {
		service,
		directory,
		unmount,
		q,
		openPicker,
		sync: () => backend.act(async () => {}),
		rows: () => q.all((n) => n.props.role === 'option' || n.props.role === 'menuitemradio'),
		row: (provider, model) => {
			const n = q.findByProps({ 'data-lg-provider': provider, 'data-lg-model': model });
			if (!n) return null;
			return {
				...n,
				props: new Proxy(n.props, {
					get(target, prop) {
						if (prop === 'aria-checked') return target['aria-selected'] ?? target['aria-checked'];
						return target[prop];
					},
				}),
			};
		},
		/* A row INSIDE a specific card dialog (the same row id can exist in
		   the main card and the all-providers card at the same time). */
		rowInCard: (ariaLabel, provider, model) => {
			const dialog = q.all((n) => n.props.role === 'dialog').find((n) => n.props['aria-label'] === ariaLabel);
			if (!dialog) return null;
			const n = q
				.within(dialog, (node) => node.props['data-lg-provider'] === provider && node.props['data-lg-model'] === model)
				.find(Boolean) || null;
			if (!n) return null;
			return {
				...n,
				props: new Proxy(n.props, {
					get(target, prop) {
						if (prop === 'aria-checked') return target['aria-selected'] ?? target['aria-checked'];
						return target[prop];
					},
				}),
			};
		},
		radios: () => q.all((n) => n.props.role === 'radio'),
		note: (kind) => q.findByProps({ 'data-lg-note': kind }),
		dialogs: () => q.all((n) => n.props.role === 'dialog'),
		trigger: () => q.findByProps({ 'aria-label': '选择模型' }),
		searchInput: () => q.findByProps({ 'aria-label': '搜索模型' }),
		allSearchInput: () => q.findByProps({ 'aria-label': '搜索全部模型' }),
		moreOpener: () => q.all((n) => typeof n.props.className === 'string' && n.props.className.indexOf('lg-picker-more') >= 0)[0] || null,
		pressEscape: () =>
			backend.act(async () => {
				for (const fn of Array.from(docHandlers.get('keydown') || [])) fn({ key: 'Escape' });
			}),
	};
	await world.sync();
	return world;
}

/* The subscribe effect re-renders the Picker on publish; expose a hook that
   runs after each publish so assertions see the committed tree. Both
   backends commit during act(); freshWorld.sync() flushes. */
async function publishAndSync(world, patch) {
	await world.directory.__publish(patch);
	await sleep(0);
	await world.sync();
}

/* ============================================================================
 * 7. Scenarios.
 * ========================================================================== */

const scenarios = [];

const scenario = (name, fn) => scenarios.push({ name, fn });

/* --- failure triad: returned failure, sync throw, rejection -------------- */

scenario('failure: select() returning {ok:false} shows actionable failure, moves nothing', async () => {
	const world = await freshWorld({ snapshot: snapOf({ current: { provider: 'prov-a', model: 'a-2' } }) });
	world.directory.__behavior.select = () => ({ ok: false, error: 'provider rejected the switch' });
	await world.openPicker();
	const row = world.row('prov-a', 'shared');
	if (row === null) throw new Error('row prov-a/shared not found');
	await backend.act(async () => {
		row.props.onClick();
	});
	const failed = world.note('failed');
	if (failed === null) throw new Error('no failure note rendered');
	const text = world.q.textOf(failed);
	if (text.indexOf('provider rejected the switch') < 0) throw new Error('failure note hides the error: ' + text);
	if (text.indexOf('重试') < 0) throw new Error('failure note has no retry affordance');
	if (world.row('prov-a', 'shared').props['aria-checked'] !== 'false') throw new Error('failure moved the confirmed indicator');
	if (world.row('prov-a', 'shared').props['data-lg-pending'] !== undefined) throw new Error('failed row still marked pending');
	if (world.row('prov-a', 'a-2').props['aria-checked'] !== 'true') throw new Error('confirmed row lost its check');
	const retry = world.q.all((n) => n.type === 'button' && world.q.textOf(n) === '重试')[0];
	if (retry === null) throw new Error('retry button not clickable');
	/* retry re-submits the same target */
	world.directory.__behavior.select = () => ({ ok: true });
	await publishAndSync(world, {});
	await backend.act(async () => {
		retry.props.onClick();
	});
	if (world.directory.__calls.select.length !== 2) throw new Error('retry did not resubmit: ' + JSON.stringify(world.directory.__calls.select));
	if (world.note('failed') !== null) throw new Error('failure note survived a retry that acked');
	await publishAndSync(world, { current: { provider: 'prov-a', model: 'shared', reasoningEffort: 'high' } });
	if (world.row('prov-a', 'shared').props['aria-checked'] !== 'true') throw new Error('projection did not confirm after retry');
	if (world.trigger().props['aria-expanded'] !== 'true') throw new Error('main card closed on failure flow');
	await world.unmount();
});

scenario('failure: select() throwing synchronously shows the same failure surface', async () => {
	const world = await freshWorld({ snapshot: snapOf({ current: { provider: 'prov-a', model: 'a-2' } }) });
	world.directory.__behavior.select = () => {
		throw new Error('directory blew up');
	};
	await world.openPicker();
	await backend.act(async () => {
		world.row('prov-a', 'shared').props.onClick();
	});
	const failed = world.note('failed');
	if (failed === null) throw new Error('sync throw produced no failure note');
	if (world.q.textOf(failed).indexOf('directory blew up') < 0) throw new Error('sync throw message missing');
	if (world.row('prov-a', 'a-2').props['aria-checked'] !== 'true') throw new Error('sync throw moved the indicator');
	await world.unmount();
});

scenario('failure: select() promise rejection shows the same failure surface', async () => {
	const world = await freshWorld({ snapshot: snapOf({ current: { provider: 'prov-a', model: 'a-2' } }) });
	let rejectIt = null;
	world.directory.__behavior.select = () =>
		new Promise((_resolve, reject) => {
			rejectIt = reject;
		});
	await world.openPicker();
	await backend.act(async () => {
		world.row('prov-a', 'shared').props.onClick();
	});
	if (world.row('prov-a', 'shared').props['data-lg-pending'] !== 'true') throw new Error('no pending marker before rejection');
	if (rejectIt === null) throw new Error('select was not called');
	await backend.act(async () => {
		rejectIt(new Error('async pipeline failed'));
	});
	const failed = world.note('failed');
	if (failed === null) throw new Error('rejection produced no failure note');
	if (world.q.textOf(failed).indexOf('async pipeline failed') < 0) throw new Error('rejection message missing');
	if (world.row('prov-a', 'a-2').props['aria-checked'] !== 'true') throw new Error('rejection moved the indicator');
	await world.unmount();
});

/* --- pending semantics ---------------------------------------------------- */

scenario('pending: successful command before projection keeps waiting, indicator unmoved', async () => {
	const world = await freshWorld({ snapshot: snapOf({ current: { provider: 'prov-a', model: 'a-2' } }) });
	let resolveIt = null;
	world.directory.__behavior.select = () =>
		new Promise((resolve) => {
			resolveIt = resolve;
		});
	await world.openPicker();
	await backend.act(async () => {
		world.row('prov-a', 'shared').props.onClick();
	});
	if (world.directory.__calls.select.length !== 1) throw new Error('select not submitted exactly once');
	const pendingRow = world.row('prov-a', 'shared');
	if (pendingRow.props['data-lg-pending'] !== 'true') throw new Error('no pending marker on activation');
	if (pendingRow.props['aria-checked'] !== 'false') throw new Error('pending marker promoted to confirmed before projection');
	if (world.row('prov-a', 'a-2').props['aria-checked'] !== 'true') throw new Error('host current indicator moved early');
	const selection = world.directory.__calls.select[0];
	if (selection.provider !== 'prov-a' || selection.model !== 'shared') throw new Error('wrong selection payload: ' + JSON.stringify(selection));
	/* the model declares defaultEffort high — the command carries it */
	if (selection.reasoningEffort !== 'high') throw new Error('declared default effort not carried: ' + JSON.stringify(selection));
	await backend.act(async () => {
		resolveIt({ ok: true });
	});
	if (world.row('prov-a', 'shared').props['data-lg-pending'] !== 'true') throw new Error('acknowledged command dropped the pending marker');
	if (world.row('prov-a', 'shared').props['aria-checked'] !== 'false') throw new Error('ack moved the indicator without a projection');
	await publishAndSync(world, { current: { provider: 'prov-a', model: 'shared' } });
	if (world.row('prov-a', 'shared').props['aria-checked'] !== 'true') throw new Error('matching projection did not confirm');
	if (world.row('prov-a', 'shared').props['data-lg-pending'] !== undefined) throw new Error('pending marker survived confirmation');
	if (world.row('prov-a', 'a-2').props['aria-checked'] !== 'false') throw new Error('old row still checked');
	await world.unmount();
});

scenario('pending: duplicate activation of the same pending choice submits once (model and effort)', async () => {
	const world = await freshWorld({ snapshot: snapOf({ current: { provider: 'prov-a', model: 'a-2' } }) });
	let resolveModel = null;
	let resolveEffort = null;
	world.directory.__behavior.select = () =>
		new Promise((resolve) => {
			if (world.directory.__calls.select.length === 1) resolveModel = resolve;
			else resolveEffort = resolve;
		});
	await world.openPicker();
	await backend.act(async () => {
		world.row('prov-a', 'shared').props.onClick();
		world.row('prov-a', 'shared').props.onClick();
		world.row('prov-a', 'shared').props.onClick();
	});
	if (world.directory.__calls.select.filter((s) => s.reasoningEffort === undefined || s.reasoningEffort === 'high').length !== 1)
		throw new Error('duplicate model activation submitted more than once: ' + JSON.stringify(world.directory.__calls.select));
	/* a-2 is current and shares no ladder; effort op on a-2 is impossible — use the shared model after projection instead */
	await backend.act(async () => {
		resolveModel({ ok: true });
	});
	await publishAndSync(world, { current: { provider: 'prov-a', model: 'shared', reasoningEffort: 'high' } });
	const low = world.radios().find((n) => world.q.textOf(n) === '低');
	if (low === null) throw new Error('effort radio 低 not found');
	world.directory.__behavior.select = () =>
		new Promise((resolve) => {
			resolveEffort = resolve;
		});
	await backend.act(async () => {
		world.radios().find((n) => world.q.textOf(n) === '低').props.onClick();
		world.radios().find((n) => world.q.textOf(n) === '低').props.onClick();
		world.radios().find((n) => world.q.textOf(n) === '低').props.onClick();
	});
	const effortCalls = world.directory.__calls.select.filter((s) => s.reasoningEffort === 'low');
	if (effortCalls.length !== 1) throw new Error('duplicate effort activation submitted more than once: ' + JSON.stringify(effortCalls));
	const lowNow = () => world.radios().find((n) => world.q.textOf(n) === '低');
	if (lowNow().props['data-lg-pending'] !== 'true') throw new Error('pending effort level not marked');
	await backend.act(async () => {
		resolveEffort({ ok: true });
	});
	await publishAndSync(world, { current: { provider: 'prov-a', model: 'shared', reasoningEffort: 'low' } });
	if (lowNow().props['data-lg-pending'] !== undefined) throw new Error('pending marker survived effort confirmation');
	const highNow = () => world.radios().find((n) => world.q.textOf(n) === '高');
	if (lowNow().props['aria-checked'] !== 'true' || highNow().props['aria-checked'] !== 'false') throw new Error('effort indicator did not follow projection');
	await world.unmount();
});

scenario('pending: a different target supersedes the pending one', async () => {
	const world = await freshWorld({ snapshot: snapOf({ current: { provider: 'prov-a', model: 'a-2' } }) });
	let resolveFirst = null;
	let resolveSecond = null;
	world.directory.__behavior.select = (selection) =>
		new Promise((resolve) => {
			if (selection.model === 'shared') resolveFirst = resolve;
			else resolveSecond = resolve;
		});
	await world.openPicker();
	await backend.act(async () => {
		world.row('prov-a', 'shared').props.onClick();
	});
	if (world.row('prov-a', 'shared').props['data-lg-pending'] !== 'true') throw new Error('first target not pending');
	await backend.act(async () => {
		world.row('prov-b', 'b-2').props.onClick();
	});
	if (world.directory.__calls.select.length !== 2) throw new Error('superseding target not submitted');
	if (world.row('prov-a', 'shared').props['data-lg-pending'] !== undefined) throw new Error('superseded target still marked pending');
	if (world.row('prov-b', 'b-2').props['data-lg-pending'] !== 'true') throw new Error('superseding target not marked pending');
	/* the stale command's late resolution must not replace the newer feedback */
	if (resolveFirst === null) throw new Error('first command not issued');
	await backend.act(async () => {
		resolveFirst({ ok: true });
	});
	if (world.row('prov-b', 'b-2').props['data-lg-pending'] !== 'true') throw new Error('stale completion replaced newer feedback');
	await backend.act(async () => {
		resolveSecond({ ok: true });
	});
	await publishAndSync(world, { current: { provider: 'prov-b', model: 'b-2' } });
	if (world.row('prov-b', 'b-2').props['aria-checked'] !== 'true') throw new Error('newer target not confirmed');
	await world.unmount();
});

/* --- identity collisions --------------------------------------------------- */

scenario('identity: same model id under two providers is not the same selection', async () => {
	const world = await freshWorld({ snapshot: snapOf({ current: { provider: 'prov-b', model: 'shared' } }) });
	await world.openPicker();
	if (world.row('prov-b', 'shared').props['aria-checked'] !== 'true') throw new Error('current provider row not checked');
	if (world.row('prov-a', 'shared').props['aria-checked'] !== 'false') throw new Error('same model id under another provider wrongly checked');
	world.directory.__behavior.select = () =>
		new Promise(() => {
			/* stays pending */
		});
	await backend.act(async () => {
		world.row('prov-a', 'shared').props.onClick();
	});
	if (world.row('prov-a', 'shared').props['data-lg-pending'] !== 'true') throw new Error('activated row not pending');
	if (world.row('prov-b', 'shared').props['data-lg-pending'] !== undefined) throw new Error('pending leaked to the same id under the current provider');
	if (world.row('prov-b', 'shared').props['aria-checked'] !== 'true') throw new Error('confirmed row lost its check while a collision is pending');
	await publishAndSync(world, { current: { provider: 'prov-a', model: 'shared' } });
	if (world.row('prov-a', 'shared').props['aria-checked'] !== 'true') throw new Error('provider-a row not confirmed after projection');
	if (world.row('prov-b', 'shared').props['aria-checked'] !== 'false') throw new Error('provider-b row still checked after switch');
	await world.unmount();
});

/* --- effective default effort ---------------------------------------------- */

scenario('default effort: a declared default confirms an omitted projection effort', async () => {
	const world = await freshWorld({ snapshot: snapOf({ current: { provider: 'prov-a', model: 'shared' } }) });
	await world.openPicker();
	const high = world.radios().find((n) => world.q.textOf(n) === '高');
	if (high === null) throw new Error('effort radio 高 not found');
	if (high.props['aria-checked'] !== 'true') throw new Error('declared default not shown as the effective effort');
	await backend.act(async () => {
		high.props.onClick();
	});
	/* ack arrives; projection omits reasoningEffort but the model declares high */
	await world.sync();
	await sleep(150);
	const highAfter = () => world.radios().find((n) => world.q.textOf(n) === '高');
	if (world.note('unconfirmed') !== null) throw new Error('declared default did not confirm an omitted projection effort');
	if (highAfter().props['data-lg-pending'] !== undefined) throw new Error('operation did not complete on effective default');
	if (highAfter().props['aria-checked'] !== 'true') throw new Error('default effort lost its check');
	await world.unmount();
});

scenario('default effort: no default is invented when the model declares none', async () => {
	/* prov-b/shared has an efforts ladder but NO defaultEffort; the host
	   projection omits reasoningEffort. A pick of 高 must NOT be treated as
	   confirmed by an invented default. */
	const world = await freshWorld({ snapshot: snapOf({ current: { provider: 'prov-b', model: 'shared' } }) });
	await world.openPicker();
	const high = world.radios().find((n) => world.q.textOf(n) === '高');
	if (high === null) throw new Error('effort radio 高 not found');
	if (high.props['aria-checked'] !== 'false') throw new Error('no-default model shows a checked effort before any choice');
	await backend.act(async () => {
		high.props.onClick();
	});
	/* command acked, projection still omits effort and no default exists */
	await sleep(200);
	const highNow = () => world.radios().find((n) => world.q.textOf(n) === '高');
	if (highNow().props['data-lg-pending'] !== 'true') throw new Error('effort op completed without any confirming fact');
	if (world.note('unconfirmed') !== null) throw new Error('unconfirmed note fired before the 8s window');
	await world.unmount();
});

/* --- the 8-second unconfirmed state ---------------------------------------- */

scenario('unconfirmed: acknowledged but unconfirmed after 8s, later projection resolves it, no rollback', async () => {
	const world = await freshWorld({ snapshot: snapOf({ current: { provider: 'prov-a', model: 'a-2' } }) });
	world.directory.__behavior.select = () => ({ ok: true });
	await world.openPicker();
	await backend.act(async () => {
		world.row('prov-a', 'shared').props.onClick();
	});
	if (world.row('prov-a', 'shared').props['data-lg-pending'] !== 'true') throw new Error('acknowledged command not marked pending');
	await sleep(8300);
	await world.sync();
	const unconfirmed = world.note('unconfirmed');
	if (unconfirmed === null) throw new Error('no unconfirmed note after the 8s window');
	const text = world.q.textOf(unconfirmed);
	if (text.indexOf('8') < 0 || text.indexOf('重试') < 0) throw new Error('unconfirmed note lacks the explanation or retry: ' + text);
	if (world.row('prov-a', 'a-2').props['aria-checked'] !== 'true') throw new Error('unconfirmed state moved the host indicator');
	if (world.row('prov-a', 'shared').props['aria-checked'] !== 'false') throw new Error('unconfirmed state promoted the unconfirmed target');
	if (world.directory.__calls.select.length !== 1) throw new Error('auto-rollback or auto-retry fired extra commands');
	/* a late matching projection resolves it */
	await publishAndSync(world, { current: { provider: 'prov-a', model: 'shared', reasoningEffort: 'high' } });
	if (world.note('unconfirmed') !== null) throw new Error('late projection did not resolve the unconfirmed note');
	if (world.row('prov-a', 'shared').props['aria-checked'] !== 'true') throw new Error('late projection did not confirm');
	await world.unmount();
});

/* --- dismissal and focus ---------------------------------------------------- */

scenario('dismissal: completion after the picker is dismissed updates selection but reopens nothing', async () => {
	const world = await freshWorld({ snapshot: snapOf({ current: { provider: 'prov-a', model: 'a-2' } }) });
	let resolveIt = null;
	world.directory.__behavior.select = () =>
		new Promise((resolve) => {
			resolveIt = resolve;
		});
	await world.openPicker();
	await backend.act(async () => {
		world.row('prov-a', 'shared').props.onClick();
	});
	await world.pressEscape();
	if (world.trigger().props['aria-expanded'] !== 'false') throw new Error('Escape did not dismiss the picker');
	focusLog.length = 0;
	await backend.act(async () => {
		resolveIt({ ok: true });
	});
	await publishAndSync(world, { current: { provider: 'prov-a', model: 'shared' } });
	if (world.trigger().props['aria-expanded'] !== 'false') throw new Error('completion reopened the dismissed picker');
	if (world.dialogs().length !== 0) throw new Error('completion reopened a card');
	if (focusLog.length !== 0) throw new Error('completion stole focus after dismissal: ' + JSON.stringify(focusLog));
	/* reopening proves the authoritative selection still moved with the host */
	await world.openPicker();
	if (world.row('prov-a', 'shared').props['aria-checked'] !== 'true') throw new Error('authoritative selection not updated after dismissal');
	await world.unmount();
});

/* --- session / directory guards --------------------------------------------- */

scenario('stale session: an operation from another session cannot claim a selection', async () => {
	const world = await freshWorld({ snapshot: snapOf({ current: { provider: 'prov-a', model: 'a-2' } }) });
	const directoryB = world.service.directoryFor('session-b');
	directoryB.__publish(snapOf({ current: { provider: 'prov-b', model: 'b-2' } }));
	let resolveIt = null;
	world.directory.__behavior.select = () =>
		new Promise((resolve) => {
			resolveIt = resolve;
		});
	await world.openPicker();
	await backend.act(async () => {
		world.row('prov-a', 'shared').props.onClick();
	});
	if (world.directory.__calls.select.length !== 1) throw new Error('command not issued on session-a directory');
	/* switch the session under the picker (the 900ms poll picks it up) */
	sessionRef.current = 'session-b';
	await sleep(1100);
	await world.sync();
	if (world.row('prov-b', 'b-2').props['aria-checked'] !== 'true') throw new Error('picker did not follow the session switch');
	await backend.act(async () => {
		resolveIt({ ok: true });
	});
	/* the stale operation may not paint feedback or steal focus for session-b */
	if (world.note('failed') !== null || world.note('unconfirmed') !== null) throw new Error('stale operation painted a notice for the new session');
	if (focusLog.length !== 0) throw new Error('stale operation stole focus');
	if (directoryB.__calls.select.length !== 0) throw new Error('stale operation submitted against the new session directory');
	/* its projection would also be meaningless here; the new session's own
	   current must remain what its directory says */
	await publishAndSync(world, {});
	if (world.row('prov-b', 'b-2').props['aria-checked'] !== 'true') throw new Error('new session selection disturbed by stale outcome');
	await world.unmount();
});

/* --- the all-providers card rule --------------------------------------------- */

scenario('all-card: closes only on acknowledged command AND matching projection; main stays open; focus restored', async () => {
	const world = await freshWorld({
		snapshot: snapOf({ current: { provider: 'prov-a', model: 'a-2' } }),
		quick: { providers: ['prov-a'], models: {} },
	});
	let resolveIt = null;
	world.directory.__behavior.select = () =>
		new Promise((resolve) => {
			resolveIt = resolve;
		});
	await world.openPicker();
	const opener = world.moreOpener();
	if (opener === null) throw new Error('all-providers opener missing with a quick list configured');
	await backend.act(async () => {
		opener.props.onClick();
	});
	if (!world.dialogs().some((n) => n.props['aria-label'] === '所有供应商')) throw new Error('all-card did not open');
	await backend.act(async () => {
		world.row('prov-b', 'b-2').props.onClick();
	});
	if (world.directory.__calls.select.length !== 1) throw new Error('all-card pick not submitted');
	/* projection FIRST: the card must NOT close on a projection alone */
	await publishAndSync(world, { current: { provider: 'prov-b', model: 'b-2' } });
	if (!world.dialogs().some((n) => n.props['aria-label'] === '所有供应商')) throw new Error('all-card closed on projection before the command outcome');
	if (focusLog.length !== 0) throw new Error('focus restored before completion');
	/* ack arrives */
	await backend.act(async () => {
		resolveIt({ ok: true });
	});
	await world.sync();
	if (world.dialogs().some((n) => n.props['aria-label'] === '所有供应商')) throw new Error('all-card did not close on ack+confirm');
	if (!world.dialogs().some((n) => n.props['aria-label'] === '模型')) throw new Error('main card did not stay open');
	if (world.trigger().props['aria-expanded'] !== 'true') throw new Error('picker collapsed after all-card completion');
	if (!focusLog.some((tag) => tag === 'opener')) throw new Error('focus not restored to the all-providers opener: ' + JSON.stringify(focusLog));
	if (world.row('prov-b', 'b-2').props['aria-checked'] !== 'true') throw new Error('all-card pick not confirmed');
	await world.unmount();
});

scenario('all-card: failure keeps the card open (queries retained)', async () => {
	const world = await freshWorld({
		snapshot: snapOf({ current: { provider: 'prov-a', model: 'a-2' } }),
		quick: { providers: ['prov-a'], models: {} },
	});
	world.directory.__behavior.select = () => ({ ok: false, error: 'nope' });
	await world.openPicker();
	await backend.act(async () => {
		world.moreOpener().props.onClick();
	});
	const allSearch = world.allSearchInput();
	if (allSearch === null) throw new Error('all-card search input missing');
	const rowInAll = world.rowInCard('所有供应商', 'prov-b', 'b-2');
	if (rowInAll === null) throw new Error('prov-b/b-2 row missing in the all-card');
	await backend.act(async () => {
		rowInAll.props.onClick();
	});
	if (!world.dialogs().some((n) => n.props['aria-label'] === '所有供应商')) throw new Error('failure closed the all-card');
	if (world.note('failed') === null) throw new Error('failure note missing on all-card pick');
	if (world.allSearchInput() === null) throw new Error('all-card query lost on failure');
	if (world.searchInput() === null) throw new Error('main card query lost on failure');
	await world.unmount();
});

scenario('all-card: completion focus prefers the relevant effort control', async () => {
	const world = await freshWorld({
		snapshot: snapOf({ current: { provider: 'prov-a', model: 'shared' } }),
		quick: { providers: ['prov-b'], models: {} },
	});
	world.directory.__behavior.select = () => ({ ok: true });
	await world.openPicker();
	const high = world.radios().find((n) => world.q.textOf(n) === '高');
	if (high === null) throw new Error('effort radio 高 not found before the all-card pick');
	await backend.act(async () => {
		world.moreOpener().props.onClick();
	});
	const rowInAll = world.rowInCard('所有供应商', 'prov-a', 'shared');
	if (rowInAll === null) throw new Error('prov-a/shared row missing in the all-card');
	await backend.act(async () => {
		rowInAll.props.onClick();
	});
	await publishAndSync(world, { current: { provider: 'prov-a', model: 'shared' } });
	await world.sync();
	if (!world.dialogs().some((n) => n.props['aria-label'] === '模型')) throw new Error('main card gone');
	if (!focusLog.some((tag) => String(tag).indexOf('effort:high') === 0)) throw new Error('effort control not focused on completion: ' + JSON.stringify(focusLog));
	await world.unmount();
});

/* --- catalog states ----------------------------------------------------------- */

scenario('catalog: initial loading before models arrive', async () => {
	const world = await freshWorld({ snapshot: snapOf({ groups: [], status: 'loading', pending: true, current: null }) });
	await world.openPicker();
	const note = world.note('loading');
	if (note === null) throw new Error('no loading note while the directory is loading');
	if (world.q.textOf(note).indexOf('正在读取') < 0) throw new Error('loading note text wrong: ' + world.q.textOf(note));
	const world2 = await freshWorld({ snapshot: snapOf({ groups: [], status: undefined, pending: true, current: null }) });
	await world2.openPicker();
	if (world2.note('loading') === null) throw new Error('undefined status with pending=true not treated as loading');
	await world2.unmount();
	await world.unmount();
});

scenario('catalog: true empty catalog is distinct from loading', async () => {
	const world = await freshWorld({ snapshot: snapOf({ groups: [], status: 'ready', pending: false, current: null }) });
	await world.openPicker();
	const note = world.note('empty');
	if (note === null) throw new Error('ready-with-no-groups not shown as empty');
	if (world.q.textOf(note).indexOf('暂无可用模型') < 0) throw new Error('empty note text wrong');
	if (world.note('loading') !== null) throw new Error('empty catalog also shows loading');
	await world.unmount();
});

scenario('catalog: overall error offers a load()-based retry', async () => {
	const world = await freshWorld({ snapshot: snapOf({ groups: [], status: 'error', pending: false, error: 'network down', current: null }) });
	await world.openPicker();
	const note = world.note('error');
	if (note === null) throw new Error('no error note for a failed catalog');
	if (world.q.textOf(note).indexOf('network down') < 0) throw new Error('error note hides the reason');
	const retry = world.q.all((n) => n.type === 'button' && world.q.textOf(n) === '重试')[0];
	if (retry === null) throw new Error('error note has no retry');
	const before = world.directory.__calls.load;
	await backend.act(async () => {
		retry.props.onClick();
	});
	if (world.directory.__calls.load !== before + 1) throw new Error('retry did not call load()');
	await world.unmount();
});

scenario('catalog: partial provider failures explain without blocking and promise no refresh', async () => {
	const world = await freshWorld({
		snapshot: snapOf({ groups: [PROV_A], failures: { 'prov-b': 'offline' }, current: { provider: 'prov-a', model: 'a-2' } }),
	});
	await world.openPicker();
	const note = world.note('partial');
	if (note === null) throw new Error('no partial-failure note');
	if (world.q.textOf(note).indexOf('prov-b') < 0) throw new Error('partial note does not name the provider');
	const buttons = world.q.all((n) => n.type === 'button' && n.parent === note);
	if (buttons.length !== 0) throw new Error('partial note offers an action — it must not promise a refresh');
	if (world.row('prov-a', 'shared') === null) throw new Error('usable models blocked by the partial note');
	if (world.note('loading') !== null) throw new Error('partial failures read as loading');
	await world.unmount();
});

scenario('catalog: filtered no-match offers to clear the query (main card and all-card)', async () => {
	const world = await freshWorld({ snapshot: snapOf({ current: { provider: 'prov-a', model: 'a-2' } }) });
	await world.openPicker();
	await backend.act(async () => {
		world.searchInput().props.onChange({ target: { value: 'zzz' } });
	});
	const nomatch = world.note('nomatch');
	if (nomatch === null) throw new Error('no no-match note for a query that matches nothing');
	if (world.q.textOf(nomatch).indexOf('zzz') < 0) throw new Error('no-match note does not echo the query');
	const clear = world.q.all((n) => n.type === 'button' && world.q.textOf(n) === '清除搜索')[0];
	if (clear === null) throw new Error('no clear-query affordance');
	await backend.act(async () => {
		clear.props.onClick();
	});
	if (world.note('nomatch') !== null) throw new Error('no-match note survived clearing the query');
	if (world.row('prov-a', 'shared') === null) throw new Error('rows did not return after clearing the query');
	/* the all-card has its own query */
	const world2 = await freshWorld({
		snapshot: snapOf({ current: { provider: 'prov-a', model: 'a-2' } }),
		quick: { providers: ['prov-a'], models: {} },
	});
	await world2.openPicker();
	await backend.act(async () => {
		world2.moreOpener().props.onClick();
	});
	await backend.act(async () => {
		world2.allSearchInput().props.onChange({ target: { value: 'qqq' } });
	});
	if (world2.note('nomatch') === null) throw new Error('all-card no-match not shown');
	const clear2 = world2.q.all((n) => n.type === 'button' && world2.q.textOf(n) === '清除搜索')[0];
	await backend.act(async () => {
		clear2.props.onClick();
	});
	if (world2.note('nomatch') !== null) throw new Error('all-card no-match survived clearing');
	await world2.unmount();
	await world.unmount();
});

scenario('main card: stays open across a confirmed pick from it', async () => {
	const world = await freshWorld({ snapshot: snapOf({ current: { provider: 'prov-a', model: 'a-2' } }) });
	world.directory.__behavior.select = () => ({ ok: true });
	await world.openPicker();
	await backend.act(async () => {
		world.row('prov-a', 'shared').props.onClick();
	});
	await publishAndSync(world, { current: { provider: 'prov-a', model: 'shared' } });
	await world.sync();
	if (world.trigger().props['aria-expanded'] !== 'true') throw new Error('main card closed after its own pick');
	if (!world.dialogs().some((n) => n.props['aria-label'] === '模型')) throw new Error('main card dialog gone after its own pick');
	if (world.searchInput() === null) throw new Error('main card query lost after its own pick');
	await world.unmount();
});

/* ============================================================================
 * 8. Runner.
 * ========================================================================== */

async function main() {
	installGlobals();
	backend = tryRealBackend();
	if (backend === null) {
		console.log('NOTICE: real React 18 not resolvable (env DSH_TEST_REACT_DIR, ./node_modules, tools/.react/node_modules).');
		console.log('        Running with the built-in lifecycle-aware harness (dependency comparison, cleanups, rescheduled updates).');
		console.log('        For real React: npm install --prefix tools/.react react@18.2.0 react-dom@18.2.0 react-test-renderer@18.2.0');
		backend = makeHarnessBackend();
	}
	console.log('picker-feedback-check: backend = ' + backend.kind + ' (' + backend.where + ')');
	createPicker = loadPickerFactory();
	catalog = loadCatalog();

	let passed = 0;
	const failures = [];
	for (const { name, fn } of scenarios) {
		let world = null;
		try {
			await fn();
			passed += 1;
			console.log('  PASS ' + name);
		} catch (error) {
			failures.push({ name, error });
			console.log('  FAIL ' + name);
			console.log('       ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join('\n       ') : String(error)));
		} finally {
			/* worlds unmount themselves; last-resort cleanup of handlers */
			docHandlers.clear();
			winHandlers.clear();
		}
	}
	console.log('');
	console.log('picker-feedback-check: ' + passed + ' passed, ' + failures.length + ' failed (backend: ' + backend.kind + ', ' + backend.where + ')');
	if (failures.length > 0) process.exitCode = 1;
}

main().then(
	() => {
		/* Some scenarios leave the 900ms poll interval or an unflushed store
		   listener alive; exit explicitly instead of hanging on them. */
		process.exit(process.exitCode || 0);
	},
	(error) => {
		console.error('picker-feedback-check crashed:', error);
		process.exit(1);
	},
);
