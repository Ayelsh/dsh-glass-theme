/**
 * Team shell check — the team sidebar surface against the BUILT bundle
 * (tasks 1.3, 2.4, 3.5, 4.4, 5.5, 6.5, 7.4).
 *
 * Runs lib/client.js inside a stub DOM world (same construction as
 * style-lifecycle-check) extended with captured window/document listeners,
 * a scripted fetch queue, a localStorage-backed preference mirror, a working
 * configForms form for the host preference namespace, and a uiSession stub.
 * The team surface must mount, render from GET payloads, mutate through POST
 * bodies, contain its own failures, and honor the preference contract — all
 * without touching the ordinary session list.
 *
 *   node tools/build.mjs && node tools/team-shell-check.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const bundleSource = readFileSync(join(root, 'lib/client.js'), 'utf8');

/* ==================================================================== *
 * Stub world
 * ==================================================================== */

const dash = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`); // no data- prefix here: the dataset proxy adds it

class El {
	constructor(world, tag) {
		this._world = world;
		this.nodeType = 1;
		this.nodeName = String(tag).toUpperCase();
		this.tagName = this.nodeName;
		this.parentNode = null;
		this.childNodes = [];
		this.attributes = new Map();
		this._text = '';
		this._innerHTML = '';
		this.value = '';
		this._listeners = new Map();
		this._style = new Map();
		const self = this;
		this.dataset = new Proxy(
			{},
			{
				get: (_, key) => (self.attributes.has(`data-${dash(key)}`) ? self.attributes.get(`data-${dash(key)}`) : undefined),
				set: (_, key, v) => {
					self.attributes.set(`data-${dash(key)}`, String(v));
					return true;
				},
				deleteProperty: (_, key) => {
					self.attributes.delete(`data-${dash(key)}`);
					return true;
				},
				has: (_, key) => self.attributes.has(`data-${dash(key)}`),
			},
		);
		this.style = {
			setProperty: (k, v) => {
				self._style.set(k, String(v));
			},
			getPropertyValue: (k) => self._style.get(k) ?? '',
			removeProperty: (k) => {
				self._style.delete(k);
			},
		};
		Object.defineProperty(this.style, 'width', {
			get: () => self._style.get('width') ?? '',
			set: (v) => {
				self._style.set('width', String(v));
			},
		});
	}

	get id() {
		return this.getAttribute('id') ?? '';
	}
	set id(v) {
		this.setAttribute('id', String(v));
	}
	get className() {
		return this.getAttribute('class') ?? '';
	}
	set className(v) {
		this.setAttribute('class', String(v));
	}
	get classList() {
		const self = this;
		const tokens = () => String(self.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
		return {
			contains: (t) => tokens().includes(t),
			add: (...ts) => self.setAttribute('class', [...new Set([...tokens(), ...ts])].join(' ')),
			remove: (...ts) => self.setAttribute('class', tokens().filter((t) => !ts.includes(t)).join(' ')),
			toggle: (t) => {
				const next = tokens().includes(t) ? tokens().filter((x) => x !== t) : [...tokens(), t];
				self.setAttribute('class', next.join(' '));
			},
		};
	}
	get hidden() {
		return this.hasAttribute('hidden');
	}
	set hidden(v) {
		if (v) this.setAttribute('hidden', '');
		else this.removeAttribute('hidden');
	}
	get textContent() {
		let out = this._text;
		for (const child of this.childNodes) out += child.textContent ?? '';
		return out;
	}
	set textContent(v) {
		this.childNodes.length = 0;
		this._text = String(v ?? '');
		this._innerHTML = '';
	}
	get innerHTML() {
		return (
			this._innerHTML +
			this._text +
			this.childNodes
				.map((c) => {
					if (c.nodeType === 1) return c.innerHTML;
					if (c.nodeType === 77) return c.html;
					return c.textContent ?? '';
				})
				.join('')
		);
	}
	set innerHTML(v) {
		this.childNodes.length = 0;
		this._text = '';
		this._innerHTML = String(v ?? '');
	}
	get lastElementChild() {
		for (let i = this.childNodes.length - 1; i >= 0; i--) if (this.childNodes[i].nodeType === 1) return this.childNodes[i];
		return null;
	}
	get firstElementChild() {
		for (const child of this.childNodes) if (child.nodeType === 1) return child;
		return null;
	}
	querySelector(selector) {
		if (this.nodeType === 1 && matches(this, selector)) return this;
		for (const el of collectTree(this, [])) {
			if (el !== this && el.nodeType === 1 && matches(el, selector)) return el;
		}
		return null;
	}
	querySelectorAll(selector) {
		return collectTree(this, []).filter((el) => el !== this && el.nodeType === 1 && matches(el, selector));
	}
	getBoundingClientRect() {
		return { left: 0, top: 0, right: this._rectWidth ?? 260, bottom: 600, width: this._rectWidth ?? 260, height: 600 };
	}
	getAttribute(n) {
		return this.attributes.has(n) ? this.attributes.get(n) : null;
	}
	setAttribute(n, v) {
		this.attributes.set(n, String(v));
	}
	hasAttribute(n) {
		return this.attributes.has(n);
	}
	removeAttribute(n) {
		this.attributes.delete(n);
	}
	get parentNode() {
		return this._parent ?? null;
	}
	set parentNode(v) {
		this._parent = v;
	}
	get parentElement() {
		return this._parent ?? null;
	}
	get isConnected() {
		let at = this;
		while (at !== null) {
			if (at === this._world.documentElement) return true;
			at = at.parentNode;
		}
		return false;
	}
	contains(node) {
		let at = node;
		while (at !== null) {
			if (at === this) return true;
			at = at.parentNode;
		}
		return false;
	}
	closest(selector) {
		let at = this;
		while (at !== null) {
			if (at.nodeType === 1 && matches(at, selector)) return at;
			at = at.parentNode;
		}
		return null;
	}
	focus() {}
	select() {}
	click() {
		this.dispatchEvent({ type: 'click', bubbles: true });
	}
	setPointerCapture() {}
	releasePointerCapture() {}
	insertAdjacentHTML(position, html) {
		// Synthetic node carrying raw markup so later appendChild calls cannot
		// wipe it (a real DOM parses the string into child nodes).
		const text = String(html ?? '');
		this.childNodes.push({ nodeType: 77, html: text, textContent: '' });
	}
	addEventListener(type, fn) {
		const list = this._listeners.get(type) ?? [];
		list.push(fn);
		this._listeners.set(type, list);
	}
	removeEventListener(type, fn) {
		this._listeners.set(type, (this._listeners.get(type) ?? []).filter((f) => f !== fn));
	}
	dispatchEvent(event) {
		// real Event objects always carry these; bare payload objects get defaults
		if (typeof event.preventDefault !== 'function') event.preventDefault = () => { event.defaultPrevented = true; };
		if (typeof event.stopPropagation !== 'function') event.stopPropagation = () => { event._stopped = true; };
		if (typeof event.stopImmediatePropagation !== 'function') event.stopImmediatePropagation = () => { event._stopped = true; };
		if (event.target === undefined || event.target === null) event.target = this;
		let node = this;
		while (node !== null && node.nodeType === 1) {
			if (event._stopped === true) break;
			event.currentTarget = node;
			for (const fn of [...(node._listeners.get(event.type) ?? [])]) {
				try {
					fn.call(node, event);
				} catch (error) {
					const at = String(error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : '');
					this._world.errors.push(`${error && error.message ? error.message : String(error)} :: ${at}`);
				}
			}
			node = node.parentNode;
		}
		return true;
	}
	appendChild(child) {
		if (child.parentNode !== null) child.parentNode.removeChild(child);
		this.childNodes.push(child);
		child.parentNode = this;
		this._innerHTML = '';
		return child;
	}
	insertBefore(child, ref) {
		const at = ref ? this.childNodes.indexOf(ref) : -1;
		if (at < 0) return this.appendChild(child);
		this.childNodes.splice(at, 0, child);
		child.parentNode = this;
		this._innerHTML = '';
		return child;
	}
	removeChild(child) {
		const at = this.childNodes.indexOf(child);
		if (at >= 0) this.childNodes.splice(at, 1);
		child.parentNode = null;
		return child;
	}
	remove() {
		if (this.parentNode !== null) this.parentNode.removeChild(this);
	}
}

/** Tolerant selector matching for the shapes team.js uses. */
const matches = (el, selector) => {
	for (const part of String(selector).split(',').map((s) => s.trim())) {
		if (part === '' || part === '*') continue;
		let rest = part;
		const idMatch = /^#([\w-]+)/.exec(rest);
		if (idMatch) {
			if (el.getAttribute('id') !== idMatch[1]) continue;
			rest = rest.slice(idMatch[0].length);
		}
		const tagMatch = /^([a-zA-Z][\w-]*)/.exec(rest);
		if (tagMatch) {
			if (el.tagName !== tagMatch[1].toUpperCase()) continue;
			rest = rest.slice(tagMatch[1].length);
		}
		const attrRe = /\[\s*([\w-]+)\s*(?:(~|\^|\*)?=\s*(?:"([^"]*)"|'([^']*)')\s*)?\]/g;
		attrRe.lastIndex = 0; // fresh per call: /g lastIndex must not leak across matches() invocations
		let ok = true;
		while (rest.startsWith('[')) {
			const m = attrRe.exec(rest);
			if (m === null) {
				ok = false;
				break;
			}
			const [, name, op, dq, sq] = m;
			const value = dq !== undefined ? dq : sq;
			const actual = el.getAttribute(name);
			if (value === undefined) {
				if (actual === null) ok = false;
			} else if (op === '~') {
				if (!String(actual ?? '').split(/\s+/).includes(value)) ok = false;
			} else if (op === '^') {
				if (!String(actual ?? '').startsWith(value)) ok = false;
			} else if (op === '*') {
				if (!String(actual ?? '').includes(value)) ok = false;
			} else if (actual !== value) {
				ok = false;
			}
			rest = rest.slice(m[0].length);
			if (!ok) break;
		}
		if (!ok) continue;
		if (rest.startsWith('.')) {
			const cls = rest.slice(1).split(/[\s.]+/)[0] ?? '';
			if (!String(el.getAttribute('class') ?? '').split(/\s+/).includes(cls)) continue;
			rest = rest.slice(1 + cls.length);
		}
		if (rest === '') return true;
	}
	return false;
};

const collectTree = (node, out) => {
	if (node === null || node === undefined || typeof node !== 'object') return out;
	out.push(node);
	for (const child of node.childNodes ?? []) collectTree(child, out);
	return out;
};

// POSTs made while the scripted queue is drained resolve as unhandled
// rejections inside the bundle; record them instead of crashing the run.
const UNHANDLED = [];
process.on('unhandledRejection', (reason) => {
	UNHANDLED.push(reason instanceof Error ? reason : new Error(String(reason)));
});

const makeWorld = () => {
	const world = {
		errors: [],
		listenerLog: [],
		queryLog: [],
		fetchCalls: [],
		fetchQueue: [],
		storage: new Map(),
		services: new Map(),
		registration: null,
	};
	const documentElement = new El(world, 'html');
	const head = new El(world, 'head');
	const body = new El(world, 'body');
	documentElement.appendChild(head);
	documentElement.appendChild(body);
	world.documentElement = documentElement;
	world.head = head;
	world.body = body;

	const deliverWindow = (type, event) => {
		for (const fn of [...(world.window._listeners.get(type) ?? [])]) {
			try {
				fn.call(world.window, event);
			} catch (error) {
				world.errors.push(error);
			}
		}
	};

	world.document = {
		nodeType: 9,
		visibilityState: 'visible',
		get head() {
			return world.head;
		},
		get body() {
			return world.body;
		},
		get documentElement() {
			return documentElement;
		},
		createElement: (tag) => new El(world, tag),
		createTextNode: (text) => ({ nodeType: 3, textContent: String(text), nodeName: '#text' }),
		querySelector(selector) {
			world.queryLog.push(selector);
			for (const el of collectTree(documentElement, [])) {
				if (el.nodeType === 1 && matches(el, selector)) return el;
			}
			return null;
		},
		querySelectorAll(selector) {
			world.queryLog.push(selector);
			return collectTree(documentElement, []).filter((el) => el.nodeType === 1 && matches(el, selector));
		},
		addEventListener(type, fn) {
			world.listenerLog.push({ surface: 'document', type });
			documentElement.addEventListener(type, fn);
		},
		removeEventListener(type, fn) {
			documentElement.removeEventListener(type, fn);
		},
	};
	world.keydown = (event) => documentElement.dispatchEvent({ bubbles: true, ...event, type: 'keydown' });
	world.pointerdownAt = (event) => documentElement.dispatchEvent({ bubbles: true, ...event, type: 'pointerdown' });

	const winListeners = new Map();
	world.window = {
		_listeners: winListeners,
		innerWidth: 1440,
		innerHeight: 900,
		__ModuleLoader__: {
			load(record) {
				world.registration = record;
			},
		},
		addEventListener(type, fn) {
			world.listenerLog.push({ surface: 'window', type });
			const list = winListeners.get(type) ?? [];
			list.push(fn);
			winListeners.set(type, list);
		},
		removeEventListener(type, fn) {
			winListeners.set(type, (winListeners.get(type) ?? []).filter((f) => f !== fn));
		},
		localStorage: {
			getItem: (k) => (world.storage.has(k) ? world.storage.get(k) : null),
			setItem: (k, v) => world.storage.set(k, String(v)),
			removeItem: (k) => world.storage.delete(k),
		},
	};

	let lastTeamBody = null;
	// Minimal server-side team state: POST /team mutations apply so a following
	// render reflects them the way the real route would.
	let serverTeam = null;
	let serverSeq = 0;
	const applyServerMutation = (body) => {
		if (!body || typeof body !== 'object') return { ok: true };
		const kind = body.kind;
		if (kind === 'profile-add') {
			if (!serverTeam) return { ok: false, error: 'no team' };
			if (!String(body.name ?? '').trim()) return { ok: false, error: 'name required' };
			serverSeq += 1;
			serverTeam.profiles = [
				...(serverTeam.profiles ?? []),
				{ id: `p_${serverSeq}`, name: String(body.name).trim(), role: String(body.role ?? 'member'), instructions: String(body.instructions ?? ''), avatar: '', sessionId: '', createdAt: serverSeq },
			];
			return { ok: true };
		}
		if (kind === 'room-add') {
			if (!serverTeam) return { ok: false, error: 'no team' };
			if (!String(body.name ?? '').trim()) return { ok: false, error: 'name required' };
			serverSeq += 1;
			serverTeam.rooms = [
				...(serverTeam.rooms ?? []),
				{ id: `r_${serverSeq}`, name: String(body.name).trim(), memberIds: [], sessionId: '', goal: String(body.goal ?? ''), createdAt: serverSeq },
			];
			return { ok: true };
		}
		// memory/learning/checkpoint/side/seen only echo ok — assertions read the POST bodies.
		return { ok: true };
	};
	world.fetch = (url, opts) => {
		const request = { url: String(url), opts: opts ?? {} };
		world.fetchCalls.push(request);
		const method = String(request.opts.method ?? 'GET').toUpperCase();
		if (request.url === '/dsh-glass-theme/team' && method === 'GET') {
			const next = world.fetchQueue.shift();
			if (next instanceof Error) return Promise.reject(next);
			if (next === undefined || next === null) {
				return Promise.reject(new Error(`unexpected fetch ${request.url}`));
			}
			lastTeamBody = next;
			if (serverTeam === null && next && next.team) serverTeam = JSON.parse(JSON.stringify(next.team));
			return Promise.resolve({ ok: true, status: 200, json: async () => next });
		}
		if (request.url === '/dsh-glass-theme/team' && method === 'POST') {
			let body = {};
			try {
				body = JSON.parse(String(request.opts.body ?? '{}'));
			} catch {}
			const result = applyServerMutation(body);
			const payload = result.ok === true ? { ok: true, ...(serverTeam ? { team: JSON.parse(JSON.stringify(serverTeam)) } : {}) } : { ok: false, error: result.error ?? 'refused' };
			return Promise.resolve({ ok: result.ok !== false, status: result.ok === false ? 400 : 200, json: async () => payload });
		}
		// Everything else (workspace status/diag) answers generically
		// so background traffic cannot eat seeded GET payloads.
		return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
	};
	world.drain = async () => {
		for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve));
	};
	world.postBodies = () =>
		world.fetchCalls
			.filter((c) => String(c.opts.method ?? 'GET') === 'POST')
			.map((c) => {
				try {
					return JSON.parse(String(c.opts.body ?? '{}'));
				} catch {
					return {};
				}
			});

	const timers = new Map();
	let timeSeq = 0;
	let now = 0;
	world.setTimeout = (fn, ms) => {
		const id = ++timeSeq;
		timers.set(id, { at: now + Math.max(0, Math.floor(ms) || 0), fn, interval: false, every: 0 });
		return id;
	};
	world.clearTimeout = (id) => timers.delete(id);
	world.setInterval = (fn, ms) => {
		const id = ++timeSeq;
		const every = Math.max(1, Math.floor(ms) || 1);
		timers.set(id, { at: now + every, fn, interval: true, every });
		return id;
	};
	world.clearInterval = (id) => timers.delete(id);
	world.advance = async (ms) => {
		const end = now + ms;
		for (;;) {
			let due = null;
			let dueId = null;
			for (const [id, timer] of timers) {
				if (timer.at <= end && (due === null || timer.at < due.at)) {
					due = timer;
					dueId = id;
				}
			}
			if (due === null) break;
			now = Math.max(now, due.at);
			if (due.interval) due.at = now + due.every;
			else timers.delete(dueId);
			try {
				due.fn();
			} catch (error) {
				world.errors.push(error);
			}
			await world.drain();
		}
		now = end;
	};
	return world;
};

/** A working configForms form carrying the host team preferences. */
const makeForm = (doc) => {
	const form = {
		_doc: { ...doc },
		_subs: [],
		// the production prefs adapter requires {status:'ready', value:{...}} and reads value[field]
		getSnapshot() {
			return { status: 'ready', value: { ...this._doc } };
		},
		subscribe(fn) {
			this._subs.push(fn);
			return () => {
				this._subs = this._subs.filter((f) => f !== fn);
			};
		},
		set(field, value) {
			this._doc[field] = value;
			const snap = this.getSnapshot();
			for (const fn of [...this._subs]) fn(snap);
		},
		mutate(ops) {
			for (const op of ops ?? []) {
				if (op?.op === 'set') this._doc[op.path?.[0] ?? op.field] = op.value;
			}
			const snap = this.getSnapshot();
			for (const fn of [...this._subs]) fn(snap);
		},
	};
	return form;
};

/** Seed payloads a fresh team GET would serve. */
const seedTeam = () => ({
	version: 1,
	profiles: [
		{ id: 'p_lead', name: 'Lead', role: 'lead', instructions: '', avatar: '', sessionId: 'session-lead', createdAt: 1 },
		{ id: 'p_scout', name: 'Scout', role: '侦察', instructions: '', avatar: '', sessionId: 'session-scout', createdAt: 2 },
		{ id: 'p_writer', name: 'Writer', role: '写作', instructions: '', avatar: 'data:image/svg+xml;base64,PERJVg==', sessionId: '', createdAt: 3 },
	],
	rooms: [
		{ id: 'r_impl', name: '实现室', memberIds: ['p_scout', 'p_writer'], sessionId: 'session-room', goal: '把侧栏团队做完', createdAt: 4 },
	],
	memory: { p_scout: [{ id: 'm_1', text: '路由前缀固定', time: 10 }] },
	sideChats: { p_scout: [{ role: 'assistant', text: '收到', time: 11 }] },
	learning: [{ id: 'l_1', memberId: 'p_scout', text: '学会提及标记优先', time: 12, status: 'pending' }],
	checkpoints: [{ id: 'c_1', memberId: 'p_scout', text: '检查点：路由完成', time: 13 }],
	seen: {},
});
const seedLive = () => ({
	sessions: [
		{ id: 'session-lead', origin: 'user', title: 'Lead 会话', seq: 30, lastActivityMs: 1, teammate: false, presence: 'idle' },
		{ id: 'session-scout', origin: 'subagent', title: 'Scout 会话', seq: 44, lastActivityMs: 2, teammate: true, presence: 'working' },
		{ id: 'session-room', origin: 'user', title: '实现室会话', seq: 7, lastActivityMs: 3, teammate: false, presence: 'idle' },
	],
	mentions: { 'session-scout': 1, 'session-room': 2 },
	unread: { 'session-room': 5 },
	now: 100,
});
const seedPrefs = () => ({
	doc: { teamSidebar: true, teamFeatures: ['palette', 'memory', 'sideChat', 'handoff'], teamCollapsed: false },
	reconciled: false,
});

/** Minimal React surface for the slot components (no rendering). */
const makeReactShim = () => {
	const createElement = (tag, props = null, ...children) => {
		const next = { ...(props ?? {}) };
		if (children.length > 0) next.children = children.length === 1 ? children[0] : children;
		return { tag, props: next };
	};
	return {
		createElement,
		Component: class {
			setState() {}
		},
	};
};

/** Slots stub: captures registrations like the app's slot store would. */
const makeSlots = () => {
	const entries = [];
	const events = [];
	const injects = [];
	const slots = {
		entries,
		events,
		inject(name, factory) {
			let cleanup = null;
			let started = false;
			const handle = {
				start() {
					if (started) return;
					started = true;
					try {
						cleanup = factory() ?? null;
					} catch (error) {
						events.push({ type: 'inject-error', name, message: String(error) });
					}
					events.push({ type: 'inject-start', name });
				},
				stop() {
					if (!started) return;
					started = false;
					if (typeof cleanup === 'function') cleanup();
					cleanup = null;
					events.push({ type: 'inject-stop', name });
				},
			};
			injects.push(handle);
			// The real app mounts an inject as soon as the slot exists, so the
			// stub runs the factory right away; start() stays idempotent.
			handle.start();
			return handle;
		},
		register(spec, component) {
			const entry = { spec, component };
			entries.push(entry);
			if (typeof slots.onRegister === 'function') {
				try { slots.onRegister(entry); } catch {}
			}
			return () => {
				const at = entries.findIndex((item) => item === entry || item.spec.id === spec.id);
				if (at >= 0) entries.splice(at, 1);
				if (typeof slots.onUnregister === 'function') {
					try { slots.onUnregister(entry); } catch {}
				}
			};
		},
	};
	return slots;
};

/** Apply the bundle with a working team context; returns {world, team, form, slots, regionHost, regionElement, dispose}. */
const bootTeam = ({ hostDoc = seedPrefs().doc, mirror = null, fetchQueue = null, teamPayload = null, extraServices = null, requireMap = null, ctxSlots = null } = {}) => {
	const world = makeWorld();
	if (mirror !== null) world.window.localStorage.setItem('dsh-glass-theme:team', JSON.stringify(mirror));
	const form = makeForm(hostDoc);
	world.services.set('configForms', { get: (ns) => (ns === 'ui-skin-glass-theme' ? form : null) });
	world.services.set('uiSession', { current: { value: { sessionId: 'session-lead' } } });
	if (extraServices !== null) for (const [k, v] of Object.entries(extraServices)) world.services.set(k, v);
	const baseTeam = teamPayload ? { ...seedTeam(), ...teamPayload } : seedTeam();
	world.fetchQueue = fetchQueue ?? [
		{ ok: true, team: baseTeam, live: seedLive() },
		{ ok: true, team: baseTeam, live: seedLive() },
		{ ok: true, team: baseTeam, live: seedLive() },
	];
	const slots = ctxSlots ?? makeSlots();
	const maps = { react: makeReactShim(), ...(requireMap ?? {}) };
	const sandbox = {
		window: world.window,
		document: world.document,
		console: { log() {}, warn() {}, error: (...parts) => world.errors.push(parts.map(String).join(' ')) },
		fetch: world.fetch,
		localStorage: world.window.localStorage,
		setTimeout: world.setTimeout,
		clearTimeout: world.clearTimeout,
		setInterval: world.setInterval,
		clearInterval: world.clearInterval,
		requestAnimationFrame: (fn) => world.setTimeout(fn, 16),
		cancelAnimationFrame: world.clearTimeout,
	};
	vm.createContext(sandbox);
	vm.runInContext(bundleSource, sandbox, { filename: 'lib/client.js' });
	const exported = world.registration.factory((name) => {
		if (maps[name] !== undefined) return maps[name];
		throw new Error(`no service: ${name}`);
	});
	const disposers = [];
	const applyCtx = {
		get: (name) => world.services.get(name) ?? null,
		effect(fn) {
			const stop = fn();
			if (typeof stop === 'function') disposers.push(stop);
			return stop;
		},
		slots,
	};
	exported.apply(applyCtx);
	/* Simulate the app rendering the region entry: instantiate the boundary,
	 * call render, and drive the ref with a host div under body. */
	let regionHost = null;
	let regionElement = null;

	const mountRegion = (entry) => {
		if (entry.spec.name !== 'sidebar.workspaces') return;
		if (regionHost !== null) return;
		try {
			const boundary = new entry.component();
			regionElement = boundary.render();
			regionHost = world.document.createElement('div');
			regionHost.className = 'lg-team-regionHost';
			world.document.body.appendChild(regionHost);
			if (regionElement && typeof regionElement.props.ref === 'function') regionElement.props.ref(regionHost);
		} catch {}
	};
	const unmountRegion = (entry) => {
		if (entry.spec.name !== 'sidebar.workspaces') return;
		if (regionHost === null) return;
		try {
			if (regionElement && typeof regionElement.props.ref === 'function') regionElement.props.ref(null);
			if (regionHost.parentElement) regionHost.parentElement.removeChild(regionHost);
		} catch {}
		regionHost = null;
		regionElement = null;
	};

	slots.onRegister = mountRegion;
	slots.onUnregister = unmountRegion;

	const regionEntry = slots.entries.find((entry) => entry.spec.name === 'sidebar.workspaces');
	if (regionEntry !== undefined) mountRegion(regionEntry);

	const teamErrors = world.errors.filter((line) => /team/i.test(line));
	if (teamErrors.length > 0) throw new Error(`mount errors: ${teamErrors.join(' | ')}`);
	return {
		world,
		get team() {
			return world.window.__lgTeamRoot ?? (regionHost !== null ? regionHost.querySelector('#lg-team-root') : world.document.querySelector('#lg-team-root'));
		},
		form,
		slots,
		get regionHost() { return regionHost; },
		get regionElement() { return regionElement; },
		dispose: () => disposers.splice(0).forEach((stop) => stop()),
	};
};

/* ==================================================================== *
 * Scenario helpers
 * ==================================================================== */

const rows = (team, cls) => collectTree(team, []).filter((el) => el.nodeType === 1 && matches(el, `[class~="${cls}"]`));
const byClass = (team, cls) => rows(team, cls)[0] ?? null;
const click = (el) => el.dispatchEvent({ type: 'click', bubbles: true, button: 0 });
const keyOn = (el, key, extra = {}) => el.dispatchEvent({ type: 'keydown', bubbles: true, key, ...extra });
const inputOn = (el, value) => {
	el.value = value;
	el.dispatchEvent({ type: 'input', bubbles: true });
};
const menuOpen = (world) => world.document.querySelector('[class~="lg-team-menu"]');
const paletteOpen = (world) => world.document.querySelector('[class~="lg-team-palette"]');
const sessionRowQueries = (world) => world.queryLog.filter((s) => String(s).includes('sessionRow')).length;
const clickMenuItem = (world, label) => {
	const menu = menuOpen(world);
	if (menu === null) return false;
	const item = collectTree(menu, []).find(
		(n) => n.nodeType === 1 && matches(n, '[class~="lg-team-menuItem"]') && n.textContent.includes(label),
	);
	if (item === undefined) return false;
	click(item);
	return true;
};
const drainQueue = (world, payload) => {
	world.fetchQueue.length = 0;
	world.fetchQueue.push(payload);
};

const scenarios = [];

/* 1. Mount + containment: a poisoned team surface must not disturb the app. */
scenarios.push(async () => {
	const world = makeWorld();
	const form = makeForm({});
	world.services.set('configForms', { get: () => form });
	world.fetchQueue = [new Error('team route down'), new Error('team route down')];
	const sandbox = {
		window: world.window,
		document: world.document,
		console: { log() {}, warn() {}, error() {} },
		fetch: world.fetch,
		localStorage: world.window.localStorage,
		setTimeout: world.setTimeout,
		clearTimeout: world.clearTimeout,
		setInterval: world.setInterval,
		clearInterval: world.clearInterval,
	};
	vm.createContext(sandbox);
	vm.runInContext(bundleSource, sandbox, { filename: 'lib/client.js' });
	const exported = world.registration.factory(() => {
		throw new Error('no service');
	});
	let threw = null;
	try {
		exported.apply({
			get: () => null,
			effect(fn) {
				return fn();
			},
		});
	} catch (error) {
		threw = error;
	}
	if (threw !== null) throw new Error(`apply threw under deprivation: ${threw.message}`);
	await world.advance(6000);
	if (world.errors.length !== 0) throw new Error(`uncontained errors: ${world.errors.map(String).join('; ')}`);
	const hostSheets = world.head.childNodes.filter((n) => n.nodeType === 1 && n.tagName === 'STYLE');
	if (hostSheets.length < 9) throw new Error(`session-adjacent stylesheets missing: ${hostSheets.length}`);
	if (sessionRowQueries(world) !== 0) throw new Error('deprived team reached for session rows');
	return `containment holds: apply survives, ${hostSheets.length} sheets intact, fetch failures swallowed`;
});

/* 2. Healthy mount: roster lead-first, presence mapped, identicons deterministic. */
scenarios.push(async () => {
	const a = bootTeam();
	const { world, team } = a;
	await world.advance(2600);
	if (team === null) throw new Error('team root did not mount');
	if (team.hidden) throw new Error('team root mounted hidden with teamSidebar true');
	const roster = rows(team, 'lg-team-row');
	if (roster.length !== 3) {
		const calls = world.fetchCalls.map((c) => `${c.opts.method ?? 'GET'} ${c.url}`).join(', ');
		throw new Error(`expected 3 roster rows, got ${roster.length} — calls: [${calls}] errors: ${world.errors.join(' | ') || 'none'}`);
	}
	if (!roster[0].classList.contains('is-lead')) throw new Error('lead row is not marked is-lead first');
	if (!roster[0].textContent.includes('Lead') || !roster[1].textContent.includes('Scout') || !roster[2].textContent.includes('Writer')) {
		throw new Error(`member order wrong: ${roster.map((r) => r.textContent).join(' | ')}`);
	}
	if (!roster[1].innerHTML.includes('<svg')) throw new Error('Scout row lacks an identicon svg');
	if (!roster[2].innerHTML.includes('data:image/svg+xml')) throw new Error('Writer avatar override did not take');
	const dot = byClass(roster[1], 'lg-team-dot');
	if (dot === null || dot.dataset.presence !== 'working') throw new Error('Scout presence is not working');
	if (roster[0].dataset.presence !== undefined && roster[0].dataset.presence !== '') {
		const leadDot = byClass(roster[0], 'lg-team-dot');
		if (leadDot !== null && leadDot.dataset.presence !== 'idle') throw new Error('lead presence should fall back to idle');
	}
	const b = bootTeam();
	await b.world.advance(2600);
	const rosterB = rows(b.team, 'lg-team-row');
	if (rosterB[1].innerHTML !== roster[1].innerHTML) throw new Error('identicon not deterministic across worlds');
	a.dispose();
	b.dispose();
	return 'roster lead-first, presence mapped, identicons deterministic, avatar override wins';
});

/* 3. Badges: mention outranks unread; focusing the scope posts seen and clears. */
scenarios.push(async () => {
	const w = bootTeam();
	const { world, team } = w;
	await world.advance(2600);
	const scoutRow = rows(team, 'lg-team-row')[1];
	if (!scoutRow.innerHTML.includes('is-mention') || !scoutRow.innerHTML.includes('@1')) {
		const badges = collectTree(team, []).filter((n) => n.nodeType === 1 && matches(n, '[class~="lg-team-badge"]'));
		throw new Error(`mention marker did not surface on Scout — badges:${badges.length} meta:${JSON.stringify(scoutRow.innerHTML.slice(-320))}`);
	}
	const roomRow = byClass(team, 'lg-team-room');
	if (!roomRow.innerHTML.includes('@2')) throw new Error('room mention marker missing');
	if (world.postBodies().filter((b) => b.kind === 'seen').length !== 0) throw new Error('seen posted without focus');
	world.services.get('uiSession').current.value = { sessionId: 'session-scout' };
	await world.advance(2600);
	const seen = world.postBodies().filter((b) => b.kind === 'seen');
	if (seen.length === 0) throw new Error('auto-seen did not post for the focused scope');
	if (seen[0].scope !== 'session-scout' || seen[0].seq !== 44) throw new Error(`seen payload wrong: ${JSON.stringify(seen[0])}`);
	const cleared = seedLive();
	cleared.mentions = {};
	cleared.unread = {};
	drainQueue(world, { ok: true, team: seedTeam(), live: cleared });
	await world.advance(2600);
	const scoutAfter = rows(team, 'lg-team-row')[1];
	if (scoutAfter.innerHTML.includes('lg-team-badge')) throw new Error(`badge did not clear on focus: ${scoutAfter.innerHTML.slice(0, 200)}`);
	w.dispose();
	return 'mention marker outranks unread; focus posts seen and clears the badge';
});

/* 4. Rooms: goal line, chips, removal is bookkeeping only. */
scenarios.push(async () => {
	const w = bootTeam();
	const { world, team } = w;
	await world.advance(2600);
	const room = byClass(team, 'lg-team-room');
	if (room === null) throw new Error('room row missing');
	if (!room.textContent.includes('把侧栏团队做完')) throw new Error('goal line not rendered');
	if (!room.textContent.includes('Scout') || !room.textContent.includes('Writer')) throw new Error('member chips missing');
	const removal = seedTeam();
	removal.rooms = [];
	drainQueue(world, { ok: true, team: removal, live: seedLive() });
	await world.advance(2600);
	if (rows(team, 'lg-team-room').length !== 0) {
		const calls = world.fetchCalls.map((c) => `${c.opts.method ?? 'GET'}${String(c.opts.body ?? '').slice(0, 40)}`).join(' | ');
		const roomsHost = team.querySelector('.lg-team-rooms');
		throw new Error(`removed room still rendered — calls:[${calls}] queueLeft:${world.fetchQueue.length} roomsHost:${roomsHost ? roomsHost.innerHTML.slice(0, 300) : 'null'} errors:${world.errors.filter((e) => /team/i.test(String(e))).join(' ; ') || 'none'}`);
	}
	if (sessionRowQueries(world) !== 0) throw new Error('room removal touched the session list');
	if (rows(team, 'lg-team-row').length !== 3) throw new Error('room removal disturbed the roster');
	w.dispose();
	return 'rooms render goal+chips; removal is bookkeeping only';
});

/* 5. Menu: row click opens with the right entries; Escape and outside close. */
scenarios.push(async () => {
	const w = bootTeam();
	const { world, team } = w;
	await world.advance(2600);
	const probe = [];
	const targetRow = rows(team, 'lg-team-row')[1];
	const cc = targetRow ? targetRow.closest('[data-action]') : null;
	const dump = targetRow ? [...targetRow.attributes.entries()].map(([k, v]) => `${k}=${String(v).slice(0, 12)}`).join('|') : 'row-missing';
	const argRead = targetRow ? `${targetRow.dataset.arg} | closest=${cc === targetRow ? 'self' : cc === null ? 'null' : `other:${cc.getAttribute('class')}`} | direct=${matches(targetRow, '[data-action]')} | attr=${targetRow.getAttribute('data-action')} | attrs[${dump}]` : 'row-missing';
	click(targetRow);
	const menu = menuOpen(world);
	if (menu === null) {
		throw new Error(`member context menu did not open — argRead:${argRead} errors:${world.errors.filter((e) => !/no service|could not/.test(e)).join(' ; ') || 'none'}`);
	}
	if (!menu.textContent.includes('打开面板') || !menu.textContent.includes('移出团队')) throw new Error('menu entries wrong');
	if (!menu.textContent.includes('清空记忆')) throw new Error('menu lacks the clear-memory entry');
	world.keydown({ key: 'Escape' });
	if (menuOpen(world) !== null) {
		throw new Error(`menu survived Escape — listeners:${JSON.stringify(world.listenerLog)} errors:${world.errors.join(' ; ') || 'none'}`);
	}
	click(byClass(team, 'lg-team-room'));
	if (menuOpen(world) === null) throw new Error('room context menu did not open');
	if (!menuOpen(world).textContent.includes('解散房间')) throw new Error('room menu entries wrong');
	world.pointerdownAt({ target: world.document.body });
	if (menuOpen(world) !== null) throw new Error('menu survived outside pointerdown');
	// destructive actions go through the in-root confirm card and are cancellable
	click(rows(team, 'lg-team-row')[1]);
	clickMenuItem(world, '移出团队');
	const confirmCard = byClass(team, 'lg-team-confirm');
	if (confirmCard === null || !confirmCard.textContent.includes('移出团队')) throw new Error('confirm card did not appear for member removal');
	click(rows(confirmCard, 'lg-team-btn').find((b) => b.dataset.action === 'confirm-no'));
	if (byClass(team, 'lg-team-confirm') !== null) throw new Error('confirm card did not close on cancel');
	if (world.postBodies().some((b) => b.kind === 'profile-remove')) throw new Error('cancel still mutated the store');
	click(rows(team, 'lg-team-row')[1]);
	clickMenuItem(world, '移出团队');
	const confirmCard2 = byClass(team, 'lg-team-confirm');
	click(rows(confirmCard2, 'lg-team-btn').find((b) => b.dataset.action === 'confirm-yes'));
	await world.drain();
	if (!world.postBodies().some((b) => b.kind === 'profile-remove')) throw new Error('confirmed removal did not post profile-remove');
	// 清空记忆 also confirms and posts memory-clear
	click(rows(team, 'lg-team-row')[1]);
	clickMenuItem(world, '清空记忆');
	const confirmCard3 = byClass(team, 'lg-team-confirm');
	if (confirmCard3 === null) throw new Error('confirm card did not appear for memory clear');
	click(rows(confirmCard3, 'lg-team-btn').find((b) => b.dataset.action === 'confirm-yes'));
	await world.drain();
	if (!world.postBodies().some((b) => b.kind === 'memory-clear' && b.memberId === 'p_scout')) throw new Error('memory-clear not posted');
	w.dispose();
	return 'context menus open on rows with correct entries; Escape/outside dismiss; destructive actions confirm and are cancellable';
});

/* 6. Palette: Ctrl+K opens, filter narrows, Enter runs member and room entries. */
scenarios.push(async () => {
	const w = bootTeam();
	const { world, team } = w;
	await world.advance(2600);
	world.keydown({ key: 'k', ctrlKey: true });
	const palette = paletteOpen(world);
	if (palette === null) {
		const keys = world.listenerLog.filter((l) => l.type === 'keydown').map((l) => l.surface).join(',');
		const bodyKids = world.body.childNodes.map((n) => `${n.nodeType}:${n.getAttribute ? n.getAttribute('class') : '?'}`).join('|');
		throw new Error(`palette did not open on Ctrl+K — keydownOn[${keys}] body[${bodyKids}] errors:${world.errors.filter((e) => !/no service|could not/.test(e)).join(' ; ') || 'none'}`);
	}
	const listText = () => palette.textContent;
	if (!listText().includes('Lead') || !listText().includes('实现室') || !listText().includes('收纳')) {
		throw new Error('palette missing member/room/entry kinds');
	}
	const field = collectTree(palette, []).find((n) => n.tagName === 'INPUT');
	inputOn(field, '实现');
	if (listText().includes('Lead') || !listText().includes('实现室')) throw new Error('palette filter did not narrow');
	keyOn(field, 'Enter');
	if (paletteOpen(world) !== null) throw new Error('palette did not close after Enter');
	if (sessionRowQueries(world) === 0) throw new Error('room entry did not attempt to focus the bound conversation');
	world.keydown({ key: 'k', ctrlKey: true });
	const palette2 = paletteOpen(world);
	const field2 = collectTree(palette2, []).find((n) => n.tagName === 'INPUT');
	inputOn(field2, 'Writer');
	keyOn(field2, 'Enter');
	const panel = byClass(team, 'lg-team-panel');
	if (panel === null || !panel.textContent.includes('Writer')) throw new Error('member entry did not open the panel');
	w.dispose();
	return 'palette opens with Ctrl+K, filters, runs room and member entries';
});

/* 7. New member box: capability hint without a team service; create still works. */
scenarios.push(async () => {
	const w = bootTeam();
	const { world, team } = w;
	await world.advance(2600);
	const memberBtn = rows(team, 'lg-team-btn').find((b) => b.dataset.action === 'member-add');
	click(memberBtn);
	const box = byClass(team, 'lg-team-newBox');
	if (box === null) throw new Error('new member box did not open');
	if (!box.textContent.includes('此环境没有暴露创建成员的能力')) throw new Error('capability hint missing');
	const nameInput = box.querySelector("[data-new-input='name']");
	inputOn(nameInput, '新人');
	const createBtn = rows(box, 'lg-team-btn').find((b) => b.dataset.action === 'member-create');
	click(createBtn);
	await world.drain();
	const posts = world.postBodies().filter((b) => b.kind === 'profile-add');
	if (posts.length === 0 || posts[0].name !== '新人') throw new Error(`member-create did not post profile-add: ${JSON.stringify(world.postBodies())}`);
	if (rows(team, 'lg-team-row').length !== 4) throw new Error('new member did not join the roster');
	if (byClass(team, 'lg-team-newBox') !== null) throw new Error('new box did not close after create');
	w.dispose();

	// with the capability exposed, creating a member also attempts the real spawn
	const spawned = [];
	const w2 = bootTeam({ extraServices: { agentTeam: { spawn: (payload) => spawned.push(payload) } } });
	const { world: world2, team: team2 } = w2;
	await world2.advance(2600);
	click(rows(team2, 'lg-team-btn').find((b) => b.dataset.action === 'member-add'));
	const box2 = byClass(team2, 'lg-team-newBox');
	if (box2.textContent.includes('此环境没有暴露创建成员的能力')) throw new Error('hint shown even with the capability exposed');
	inputOn(box2.querySelector("[data-new-input='name']"), '侦察兵');
	inputOn(box2.querySelector("[data-new-input='instructions']"), '负责外围侦察');
	click(rows(box2, 'lg-team-btn').find((b) => b.dataset.action === 'member-create'));
	await world2.drain();
	if (spawned.length !== 1 || spawned[0].name !== '侦察兵' || spawned[0].instructions !== '负责外围侦察') {
		throw new Error(`spawn not invoked with the profile: ${JSON.stringify(spawned)}`);
	}
	w2.dispose();
	return 'member creation shows the capability hint and still stores the profile; exposed capability triggers the real spawn';
});

/* 8. Panels: memory round-trip, learning card transition, conversation untouched. */
scenarios.push(async () => {
	const w = bootTeam();
	const { world, team } = w;
	await world.advance(2600);
	click(rows(team, 'lg-team-row')[1]);
	if (!clickMenuItem(world, '打开面板')) throw new Error('menu lacked the open-panel entry');
	let panel = byClass(team, 'lg-team-panel');
	if (!panel.textContent.includes('路由前缀固定')) throw new Error('seeded memory entry missing');
	if (!panel.textContent.includes('学会提及标记优先')) throw new Error('pending learning card missing');
	const accept = rows(panel, 'lg-team-btn').find((b) => b.dataset.action === 'learning-accept');
	click(accept);
	await world.drain();
	// the accept path re-renders the panel; re-query so composer references are live
	panel = byClass(team, 'lg-team-panel');
	if (panel === null) throw new Error('panel vanished after accept render');
	const posts = world.postBodies();
	if (!posts.some((b) => b.kind === 'learning-set' && b.status === 'accepted')) throw new Error('accept did not post learning-set');
	if (!posts.some((b) => b.kind === 'memory-add' && b.text === '学会提及标记优先')) throw new Error('accept did not move the text into memory');
	const composerInput = panel.querySelector("[data-panel-input='memory']");
	inputOn(composerInput, '记住路由前缀');
	keyOn(composerInput, 'Enter');
	await world.drain();
	if (!world.postBodies().some((b) => b.kind === 'memory-add' && b.text === '记住路由前缀')) throw new Error('memory composer did not post');
	// memory edit: start shows a prefilled composer, cancel restores, save posts memory-edit
	panel = byClass(team, 'lg-team-panel');
	const editStart = rows(panel, 'lg-team-btn').find((b) => b.dataset.action === 'memory-edit-start');
	if (editStart === undefined) throw new Error('memory entry lacks the edit affordance');
	click(editStart);
	panel = byClass(team, 'lg-team-panel');
	const editInput = panel.querySelector("[data-panel-input='memory-edit']");
	if (editInput === null || String(editInput.value ?? '') !== '路由前缀固定') throw new Error(`edit composer not prefilled: ${String(editInput ? editInput.value : 'missing')}`);
	click(rows(panel, 'lg-team-btn').find((b) => b.dataset.action === 'memory-edit-cancel'));
	panel = byClass(team, 'lg-team-panel');
	if (world.postBodies().some((b) => b.kind === 'memory-edit')) throw new Error('cancel posted a memory edit');
	if (!panel.textContent.includes('路由前缀固定')) throw new Error('cancel did not restore the stored text');
	click(rows(panel, 'lg-team-btn').find((b) => b.dataset.action === 'memory-edit-start'));
	panel = byClass(team, 'lg-team-panel');
	inputOn(panel.querySelector("[data-panel-input='memory-edit']"), '改后的记忆');
	click(rows(panel, 'lg-team-btn').find((b) => b.dataset.action === 'memory-edit-save'));
	await world.drain();
	if (!world.postBodies().some((b) => b.kind === 'memory-edit' && b.text === '改后的记忆' && b.id === 'm_1' && b.memberId === 'p_scout')) {
		throw new Error('save did not post memory-edit');
	}
	if (sessionRowQueries(world) !== 0) throw new Error('panel work touched the main conversation');
	w.dispose();
	return 'memory round-trips, learning card transitions, conversation untouched';
});

/* 9. Side chat + checkpoint isolation: own transcript only, never the main thread. */
scenarios.push(async () => {
	const w = bootTeam();
	const { world, team } = w;
	await world.advance(2600);
	click(rows(team, 'lg-team-row')[1]);
	if (!clickMenuItem(world, '打开面板')) throw new Error('menu lacked the open-panel entry');
	let panel = byClass(team, 'lg-team-panel');
	if (panel === null) throw new Error('member panel did not open');
	if (!panel.textContent.includes('旁聊')) throw new Error('side-chat section missing');
	const sideInput = panel.querySelector("[data-panel-input='side']");
	inputOn(sideInput, '顺便问一句');
	keyOn(sideInput, 'Enter');
	await world.drain();
	if (!world.postBodies().some((b) => b.kind === 'side-send' && b.text === '顺便问一句' && b.role === 'user')) {
		throw new Error('side-send not posted');
	}
	// side-send re-renders the panel; re-query before touching the checkpoint composer
	panel = byClass(team, 'lg-team-panel');
	if (panel === null) throw new Error('panel vanished after side-send render');
	const ckptInput = panel.querySelector("[data-panel-input='checkpoint']");
	if (!panel.textContent.includes('检查点：路由完成')) throw new Error('seeded checkpoint card missing');
	inputOn(ckptInput, '手动交接说明');
	keyOn(ckptInput, 'Enter');
	await world.drain();
	if (!world.postBodies().some((b) => b.kind === 'checkpoint-add' && b.text === '手动交接说明')) throw new Error('checkpoint note not posted');
	const kinds = world.postBodies().map((b) => b.kind);
	if (kinds.some((k) => String(k).includes('session') && k !== 'seen')) throw new Error('side work attempted a main-conversation mutation');
	if (sessionRowQueries(world) !== 0) throw new Error('side work reached for session rows');
	w.dispose();
	return 'side chat and checkpoints write only their own stores';
});

/* 10. Preferences: host drives switch+stow via the open attribute; unrecorded
 * stow defaults to stowed; mirror first-paint then host wins with one-time flag. */
scenarios.push(async () => {
	const a = bootTeam();
	const { world, team, form } = a;
	const openAttr = () => world.document.documentElement.getAttribute('data-lg-team-open');
	await world.advance(2600);
	if (openAttr() === null) throw new Error('open attribute missing while enabled+expanded');
	form.set('teamSidebar', false);
	await world.advance(100);
	if (!team.hidden) throw new Error('switch off did not hide the team root');
	if (openAttr() !== null) throw new Error('switch off did not clear the open attribute');
	form.set('teamSidebar', true);
	await world.advance(2600);
	if (openAttr() === null) throw new Error('switch on did not restore the open attribute');
	form.set('teamCollapsed', true);
	await world.advance(2600);
	if (openAttr() !== null) throw new Error('host collapsed=true did not stow the panel');
	form.set('teamCollapsed', false);
	await world.advance(2600);
	if (openAttr() !== 'true') throw new Error('host collapsed=false did not unfold the panel');
	a.dispose();

	// No recorded stow choice (host entry lacks the key, no mirror) => stowed
	// by default; the session browser must own the first paint.
	const a2 = bootTeam({ hostDoc: { teamSidebar: true, teamFeatures: ['palette', 'memory', 'sideChat', 'handoff'] } });
	await a2.world.advance(2600);
	if (a2.world.document.documentElement.getAttribute('data-lg-team-open') !== null) {
		throw new Error('unrecorded stow choice did not default to stowed');
	}
	a2.form.set('teamCollapsed', false);
	await a2.world.advance(2600);
	if (a2.world.document.documentElement.getAttribute('data-lg-team-open') !== 'true') {
		throw new Error('first explicit unfold did not open the region');
	}
	a2.dispose();

	const b = bootTeam({ mirror: { collapsed: true, enabled: false }, hostDoc: {} });
	await b.world.advance(2600);
	if (!b.team.hidden) throw new Error('mirror enabled:false did not suppress first paint');
	if (b.world.document.documentElement.getAttribute('data-lg-team-open') !== null) {
		throw new Error('mirror collapsed first paint should not open the region');
	}
	b.form.set('teamSidebar', true);
	await b.world.advance(100);
	const mirrored = JSON.parse(b.world.window.localStorage.getItem('dsh-glass-theme:team') ?? '{}');
	if (mirrored.enabled !== true || mirrored.collapsed !== true) throw new Error(`mirror not reconciled toward host: ${JSON.stringify(mirrored)}`);
	if (!b.world.window.localStorage.getItem('dsh-glass-theme:team-reconciled')) throw new Error('one-time reconcile flag not planted');
	b.dispose();
	return 'host drives switch+stow via the open attribute; mirror first-paint then host wins with one-time flag';
});

/* 11. Sidebar integration: slots claim region+footer, the host mounts the
 * root inside the region area, and the footer toggle stows via the open
 * attribute. */
scenarios.push(async () => {
	const w = bootTeam();
	const { world, team, slots, regionHost, regionElement, dispose } = w;
	const openAttr = () => world.document.documentElement.getAttribute('data-lg-team-open');
	const workspaces = slots.entries.find((entry) => entry.spec.name === 'sidebar.workspaces');
	const footer = slots.entries.find((entry) => entry.spec.name === 'sidebar.footer.action');
	if (workspaces === undefined || footer === undefined) {
		throw new Error(`slots not claimed: ${slots.entries.map((entry) => entry.spec.name).join(',')}`);
	}
	if (regionHost === null || regionElement === null) throw new Error('region host did not mount');
	let at = team;
	let inside = false;
	while (at) {
		if (at === regionHost) {
			inside = true;
			break;
		}
		at = at.parentElement;
	}
	if (!inside) throw new Error('team root is not inside the region host');
	if (openAttr() !== 'true') throw new Error(`open attribute wrong on start: ${openAttr()}`);
	// Footer toggle: pressed while open, click stows and clears the attribute.
	const toggleEl = footer.component();
	if (String(toggleEl.props['aria-pressed']) !== 'true') throw new Error('footer toggle should start pressed');
	const fakeNode = { attrs: {}, setAttribute(key, value) { this.attrs[key] = value; } };
	toggleEl.props.onClick({ currentTarget: fakeNode });
	if (openAttr() !== null) throw new Error('footer toggle did not clear the open attribute');
	if (String(fakeNode.attrs['aria-pressed']) !== 'false') throw new Error('footer toggle aria state did not flip');
	// The head button unfolds again (the only affordance while stowed).
	const collapseBtn = () => team.querySelector('.lg-team-collapseBtn');
	collapseBtn().click();
	if (openAttr() !== 'true') throw new Error('head button did not unfold the panel');
	// Boundary unmount detaches the plain-DOM root for a later remount.
	regionElement.props.ref(null);
	if (team.parentElement !== null) throw new Error('boundary unmount did not detach the team root');
	regionElement.props.ref(regionHost);
	if (team.parentElement !== regionHost) throw new Error('boundary remount did not reattach the team root');
	dispose();
	const leftover = slots.entries.filter((entry) => entry.spec.name === 'sidebar.workspaces' || entry.spec.name === 'sidebar.footer.action');
	if (leftover.length !== 0) throw new Error(`dispose did not release the team slot entries: ${leftover.map((entry) => entry.spec.name).join(',')}`);
	if (!slots.events.some((event) => event.type === 'inject-stop' && event.name === 'sidebar.workspaces')) throw new Error('dispose did not stop the slot inject');
	return 'slots claim region+footer; host mounts inside the region area; footer toggle stows; dispose releases entries';
});

/* 12. Disposal: stop hides the root, clears the open attribute, closes overlays, unbinds keys. */
scenarios.push(async () => {
	const w = bootTeam();
	const { world, team, dispose } = w;
	await world.advance(2600);
	click(rows(team, 'lg-team-row')[1]);
	if (!clickMenuItem(world, '打开面板')) throw new Error('menu lacked the open-panel entry');
	if (byClass(team, 'lg-team-panel') === null) throw new Error('panel did not open for disposal test');
	dispose();
	if (!team.hidden) throw new Error('disposal left the root visible');
	if (world.document.documentElement.getAttribute('data-lg-team-open') !== null) {
		throw new Error('disposal left the open attribute set');
	}
	if (byClass(team, 'lg-team-panel') !== null) throw new Error('disposal left the panel mounted');
	world.keydown({ key: 'k', ctrlKey: true });
	if (paletteOpen(world) !== null) throw new Error('disposal left the Ctrl+K handler bound');
	return 'disposal hides the root, clears the open attribute, closes overlays, unbinds keys';
});

/* 13. Settings section: the team group renders and writes the host entry. */
scenarios.push(async () => {
	const slots = makeSlots();
	// Minimal React: one render, hooks record state, handlers close over it.
	const shim = { index: 0, states: [], effects: [] };
	const React = {
		createElement(tag, props = null, ...children) {
			if (children.length > 0) props = { ...(props ?? {}), children: children.length === 1 ? children[0] : children };
			return { tag, props, children };
		},
		Component: class {
			setState() {}
		},
		useState(init) {
			const i = shim.index++;
			if (!(i in shim.states)) shim.states[i] = typeof init === 'function' ? init() : init;
			const set = (next) => {
				shim.states[i] = typeof next === 'function' ? next(shim.states[i]) : next;
			};
			return [shim.states[i], set];
		},
		useEffect(fn) {
			shim.effects.push(fn);
		},
		useLayoutEffect() {},
		useRef(value) {
			return { current: value };
		},
		useCallback(fn) {
			return fn;
		},
		useMemo(fn) {
			return fn();
		},
	};
	const w = bootTeam({ requireMap: { react: React }, ctxSlots: slots });
	const section = slots.entries.find((c) => c.spec.id === 'liquid-glass');
	if (section === undefined) throw new Error(`settings section did not register: ${slots.entries.map((c) => c.spec.id).join(',')}`);
	const tree = section.component({});
	const nodes = [];
	const flatten = (node) => {
		if (node === null || node === undefined || node === false || node === true || typeof node === 'number') return;
		if (typeof node === 'string') return;
		if (Array.isArray(node)) {
			for (const child of node) flatten(child);
			return;
		}
		nodes.push(node);
		if (node.props && node.props.children !== undefined) flatten(node.props.children);
	};
	flatten(tree);
	const classes = (n) => String((n.props && n.props.className) ?? '').split(/\s+/);
	const textOf = (n) => {
		let out = '';
		const walk = (c) => {
			if (typeof c === 'string' || typeof c === 'number') out += String(c);
			else if (Array.isArray(c)) c.forEach(walk);
			else if (c && c.props && c.props.children !== undefined) walk(c.props.children);
		};
		walk(n.children);
		return out;
	};
	const byRole = (role, label) =>
		nodes.find((n) => n.props && n.props.role === role && (label === undefined || n.props['aria-label'] === label));
	const switchNode = byRole('switch', '团队');
	const allSwitches = nodes.filter((n) => n.props && n.props.role === 'switch').map((n) => `${n.props['aria-label']}=${n.props['aria-checked']}`);
	if (switchNode === undefined || switchNode.props['aria-checked'] !== 'true') throw new Error(`team switch missing or not on by default — switches:[${allSwitches.join(',')}] nodes:${nodes.length}`);
	if (nodes.some((n) => classes(n).includes('lg-settings-teamForm'))) throw new Error('form radios should be gone in the panel model');
	if (nodes.some((n) => n.props && String(n.props['aria-label'] ?? '').includes('团队列宽度'))) throw new Error('width input should be gone in the panel model');
	const features = nodes.filter((n) => n.props && n.props.role === 'checkbox');
	if (features.length !== 4 || features.some((b) => b.props['aria-checked'] !== 'true')) throw new Error('feature toggles wrong');
	const featureByLabel = (label) => features.find((b) => textOf(b).includes(label));
	if (featureByLabel('记忆') === undefined) throw new Error('memory feature toggle missing');
	const resetNode = nodes.find((n) => n.props && classes(n).includes('lg-settings-reset'));
	if (resetNode === undefined) throw new Error('reset button missing');
	// Interactions write the host entry through the shared prefs adapter.
	switchNode.props.onClick();
	if (w.form._doc.teamSidebar !== false) throw new Error(`switch did not write teamSidebar: ${w.form._doc.teamSidebar}`);
	featureByLabel('记忆').props.onClick();
	if (JSON.stringify(w.form._doc.teamFeatures) !== JSON.stringify(['palette', 'sideChat', 'handoff'])) {
		throw new Error(`feature toggle wrote the wrong list: ${JSON.stringify(w.form._doc.teamFeatures)}`);
	}
	resetNode.props.onClick();
	if (w.form._doc.teamSidebar !== true || JSON.stringify(w.form._doc.teamFeatures) !== JSON.stringify(['palette', 'memory', 'sideChat', 'handoff'])) {
		throw new Error(`reset did not restore defaults: ${JSON.stringify({ on: w.form._doc.teamSidebar, features: w.form._doc.teamFeatures })}`);
	}
	w.dispose();
	return 'settings team group renders (switch, features, reset) and writes the host entry';
});

/* 14. Collapse: the panel stows back to the session browser and the choice persists. */
scenarios.push(async () => {
	const w = bootTeam();
	const { world, team, dispose } = w;
	const openAttr = () => world.document.documentElement.getAttribute('data-lg-team-open');
	const collapseBtn = () => team.querySelector('.lg-team-collapseBtn');
	if (team.dataset.collapsed !== 'false') throw new Error(`panel should start expanded: ${team.dataset.collapsed}`);
	if (openAttr() !== 'true') throw new Error('panel should start open');
	collapseBtn().click();
	if (team.dataset.collapsed !== 'true') throw new Error('collapse button did not fold the panel');
	if (openAttr() !== null) throw new Error('collapse did not clear the open attribute');
	if (w.form._doc.teamCollapsed !== true) throw new Error(`collapse did not write the host entry: ${w.form._doc.teamCollapsed}`);
	if (w.world.window.localStorage.getItem('dsh-glass-theme:team') === null || !JSON.parse(w.world.window.localStorage.getItem('dsh-glass-theme:team')).collapsed) {
		throw new Error('collapse did not update the mirror');
	}
	collapseBtn().click();
	if (team.dataset.collapsed !== 'false') throw new Error('collapse button did not unfold the panel');
	if (openAttr() !== 'true') throw new Error('unfold did not restore the open attribute');
	dispose();
	// mirror first paint: collapsed:true with an empty host stays stowed
	const w2 = bootTeam({ mirror: { collapsed: true }, hostDoc: {} });
	const t2 = w2.team;
	if (t2.dataset.collapsed !== 'true') throw new Error(`mirror collapsed first paint failed: ${t2.dataset.collapsed}`);
	if (w2.world.document.documentElement.getAttribute('data-lg-team-open') !== null) {
		throw new Error('mirror collapsed first paint should keep the session browser');
	}
	// host wins once it speaks
	w2.form.set('teamCollapsed', false);
	await w2.world.advance(2600);
	if (t2.dataset.collapsed !== 'false') throw new Error('host collapsed=false did not unfold the panel');
	if (w2.world.document.documentElement.getAttribute('data-lg-team-open') !== 'true') {
		throw new Error('host unfold did not open the region');
	}
	w2.dispose();
	return 'collapse stows back to the session browser, persists via host+mirror, mirror first paints stowed, host wins';
});

/* 15. Rename member and rename room: inline prefilled form and update in place. */
scenarios.push(async () => {
	const teamPayload = {
		profiles: [
			{ id: 'p_lead', name: '主控', role: 'lead', instructions: '统筹任务' },
			{ id: 'p_worker', name: '开发', role: 'member', instructions: '编写代码' },
		],
		rooms: [
			{ id: 'r_dev', name: '功能开发室', memberIds: ['p_worker'], goal: '实现侧边栏' },
		],
	};
	const w = bootTeam({ teamPayload });
	const { world, team, dispose } = w;
	await world.advance(2600);

	// Rename member
	const memberRow = rows(team, 'lg-team-row').find((r) => r.textContent.includes('开发'));
	if (!memberRow) throw new Error('worker row not found');
	click(memberRow);
	if (!clickMenuItem(world, '重命名')) throw new Error('重命名 menu item missing');

	const newBox = byClass(team, 'lg-team-newBox');
	if (!newBox || newBox.dataset.kind !== 'rename-member') throw new Error('rename-member newbox not opened');
	const nameInput = newBox.querySelector('[data-new-input="name"]');
	const instrInput = newBox.querySelector('[data-new-input="instructions"]');
	if (!nameInput || nameInput.value !== '开发') throw new Error(`name input not prefilled: ${nameInput?.value}`);
	if (!instrInput || instrInput.value !== '编写代码') throw new Error('instructions input not prefilled');

	inputOn(nameInput, '资深开发');
	const saveBtn = newBox.querySelector('[data-action="member-update"]');
	if (!saveBtn) throw new Error('member-update save button missing');
	click(saveBtn);
	await world.advance(50);
	if (!world.postBodies().some((b) => b.kind === 'profile-update' && b.id === 'p_worker' && b.patch?.name === '资深开发')) {
		throw new Error(`profile-update not posted: ${JSON.stringify(world.postBodies())}`);
	}

	// Rename room with member subscription chips
	const roomRow = rows(team, 'lg-team-room')[0];
	if (!roomRow) throw new Error('room row not found');
	click(roomRow);
	if (!clickMenuItem(world, '编辑目标')) throw new Error('编辑目标 menu item missing');

	const roomBox = byClass(team, 'lg-team-newBox');
	if (!roomBox || roomBox.dataset.kind !== 'rename-room') throw new Error('rename-room newbox not opened');
	const roomGoalInput = roomBox.querySelector('[data-new-input="goal"]');
	if (!roomGoalInput || roomGoalInput.value !== '实现侧边栏') throw new Error('room goal not prefilled');

	// Toggle member chip
	const chips = roomBox.querySelectorAll('[data-action="room-chip-toggle"]');
	if (chips.length !== 2) throw new Error(`expected 2 member chips, got ${chips.length}`);
	const leadChip = chips.find((c) => c.dataset.memberId === 'p_lead');
	if (!leadChip || leadChip.classList.contains('is-selected')) throw new Error('lead chip should start unselected');
	click(leadChip);
	if (!leadChip.classList.contains('is-selected')) throw new Error('clicking chip did not toggle is-selected');

	inputOn(roomGoalInput, '完成侧边栏全部功能');
	const roomSaveBtn = roomBox.querySelector('[data-action="room-update"]');
	if (!roomSaveBtn) throw new Error('room-update save button missing');
	click(roomSaveBtn);
	await world.advance(50);
	if (!world.postBodies().some((b) => b.kind === 'room-update' && b.id === 'r_dev' && b.patch?.goal === '完成侧边栏全部功能' && b.patch?.memberIds?.includes('p_lead'))) {
		throw new Error(`room-update not posted: ${JSON.stringify(world.postBodies())}`);
	}

	dispose();
	return 'rename-member and rename-room open prefilled, toggle chips, and update cleanly';
});

/* 16. Autonomy mode and watchdog: header toggle and preference persistence. */
scenarios.push(async () => {
	const w = bootTeam();
	const { world, team, form, dispose } = w;

	const modeBtn = team.querySelector('.lg-team-modeBtn');
	if (!modeBtn) throw new Error('header autonomy mode button missing');
	if (modeBtn.dataset.mode !== 'observe') throw new Error(`expected default observe mode, got ${modeBtn.dataset.mode}`);

	click(modeBtn);
	if (modeBtn.dataset.mode !== 'auto') throw new Error('clicking modeBtn did not switch to auto');
	if (form._doc.teamAutonomyMode !== 'auto') throw new Error(`mode toggle did not write teamAutonomyMode: ${form._doc.teamAutonomyMode}`);

	click(modeBtn);
	if (modeBtn.dataset.mode !== 'observe') throw new Error('clicking modeBtn did not switch back to observe');
	if (form._doc.teamAutonomyMode !== 'observe') throw new Error('mode toggle did not write observe');

	dispose();
	return 'autonomy mode toggles between observe and auto in header and persists to host';
});

/* 17. Super-agent roles, ticket count, pass-through pills, quick approval. */
scenarios.push(async () => {
	const teamPayload = {
		profiles: [
			{ id: 'p_lead', name: '主控', role: 'lead' },
			{ id: 'p_worker', name: '开发', role: 'member' },
		],
		rooms: [
			{ id: 'r_dev', name: '功能开发室', memberIds: ['p_worker'], subscribedWorkerIds: ['p_worker'], goal: '开发' },
		],
		tickets: [
			{ id: 'tkt_obs', title: '待批工单', workerId: 'p_worker', status: 'observed', summary: '待批准' },
			{ id: 'tkt_work', title: '执行中工单', workerId: 'p_worker', status: 'working', summary: '进行中' },
		],
	};
	const w = bootTeam({ teamPayload });
	const { world, team, dispose } = w;
	await world.advance(2600);

	const leadRow = rows(team, 'lg-team-row').find((r) => r.textContent.includes('主控'));
	const workerRow = rows(team, 'lg-team-row').find((r) => r.textContent.includes('开发'));
	if (!leadRow) throw new Error('lead row missing');
	if (!workerRow) throw new Error('worker row missing');

	const leadBadge = byClass(leadRow, 'lg-team-roleBadge');
	const workerBadge = byClass(workerRow, 'lg-team-roleBadge');
	if (!leadBadge || !leadBadge.classList.contains('is-lead')) throw new Error('lead role badge missing');
	if (!workerBadge || !workerBadge.classList.contains('is-member')) throw new Error('worker role badge missing');

	// Active ticket pill (1 working ticket)
	const ticketBadge = byClass(workerRow, 'lg-team-ticketBadge');
	if (!ticketBadge || !ticketBadge.textContent.includes('1 工单')) throw new Error(`active ticket badge missing or wrong: ${ticketBadge?.textContent}`);

	// Pass-through pill
	const passPill = byClass(workerRow, 'lg-team-passPill');
	if (!passPill || !passPill.textContent.includes('直通')) throw new Error('pass-through pill missing on subscribed worker');

	// Room pass-through chip
	const roomRow = rows(team, 'lg-team-room')[0];
	const passChip = byClass(roomRow, 'lg-team-passChip');
	if (!passChip || !passChip.textContent.includes('直通')) throw new Error('pass-through chip missing on subscribed room');

	// Quick approval button for observed ticket
	const quickApproveBtn = byClass(workerRow, 'lg-team-quickApprove');
	if (!quickApproveBtn) throw new Error('quick approval button missing for observed ticket');
	click(quickApproveBtn);
	await world.advance(50);
	if (!world.postBodies().some((b) => b.kind === 'ticket-approve' && b.id === 'tkt_obs')) {
		throw new Error(`ticket-approve not posted: ${JSON.stringify(world.postBodies())}`);
	}

	dispose();
	return 'super-agent roles, ticket badges, pass-through pills, and quick approval render and act cleanly';
});

/* 18. Chain of Recall: inline summary, recall chips, spill expansion, watchdog actions. */
scenarios.push(async () => {
	const teamPayload = {
		profiles: [
			{ id: 'p_worker', name: '开发', role: 'member' },
		],
		tickets: [
			{
				id: 'tkt_1',
				title: '重构侧边栏组件',
				workerId: 'p_worker',
				status: 'stalled',
				summary: '精简 DOM 树并绑定毛玻璃 token',
				recallRefs: {
					triggerIds: ['trg_1', 'trg_2'],
					threadId: 'thd_dev',
					mandateId: 'mnd_1',
					ticketId: 'tkt_1',
					workerId: 'p_worker',
					sessionId: '',
				},
				spill: { details: '详细日志：第三次重试超时', continuation: { step: 4 } },
				retryCount: 3,
				watchdogReason: 'retry_cap',
			},
		],
	};
	const w = bootTeam({ teamPayload });
	const { world, team, dispose } = w;
	await world.advance(2600);

	const workerRow = rows(team, 'lg-team-row')[0];
	if (!workerRow) throw new Error('worker row not found');
	click(workerRow);
	if (!clickMenuItem(world, '工单 / 召回')) throw new Error('工单 / 召回 menu item missing');

	const panel = byClass(team, 'lg-team-panel');
	if (!panel) throw new Error('detail panel not opened');

	const recallSection = byClass(panel, 'lg-team-recallSection');
	if (!recallSection) throw new Error('recall section missing in panel');

	const ticketCard = byClass(recallSection, 'lg-team-ticketCard');
	if (!ticketCard || !ticketCard.classList.contains('is-stalled')) throw new Error('stalled ticket card missing');

	// Inline summary
	const summary = byClass(ticketCard, 'lg-team-ticketSummary');
	if (!summary || !summary.textContent.includes('精简 DOM 树')) throw new Error('inline summary missing');

	// Recall chips
	const recallChips = rows(ticketCard, 'lg-team-chip');
	if (recallChips.length < 3) throw new Error(`expected at least 3 recall chips, got ${recallChips.length}`);

	// Spill expansion toggle
	const spillToggle = ticketCard.querySelector('[data-action="ticket-spill-toggle"]');
	if (!spillToggle) throw new Error('ticket-spill-toggle button missing');
	if (byClass(ticketCard, 'lg-team-spillDetails')) throw new Error('spill details should start collapsed');

	click(spillToggle);
	const freshPanel = byClass(team, 'lg-team-panel');
	const freshCard = byClass(freshPanel, 'lg-team-ticketCard');
	const spillDetails = byClass(freshCard, 'lg-team-spillDetails');
	if (!spillDetails || !spillDetails.textContent.includes('详细日志：第三次重试超时')) {
		throw new Error('clicking spill toggle did not reveal continuation details');
	}

	// Watchdog recovery buttons on stalled ticket
	const retryBtn = freshCard.querySelector('[data-action="watchdog-retry"]');
	if (!retryBtn) throw new Error('watchdog-retry button missing');
	click(retryBtn);
	await world.advance(50);
	if (!world.postBodies().some((b) => b.kind === 'watchdog-resolve' && b.id === 'tkt_1' && b.action === 'retry')) {
		throw new Error(`watchdog-resolve retry not posted: ${JSON.stringify(world.postBodies())}`);
	}

	dispose();
	return 'chain of recall renders inline summaries, recall chips, spill expansion, and watchdog recovery';
});

/* ==================================================================== *
 * Runner
 * ==================================================================== */

let failures = 0;
let index = 0;
for (const scenario of scenarios) {
	index += 1;
	try {
		const note = await scenario();
		console.log(`ok    ${index}. ${note}`);
	} catch (error) {
		failures += 1;
		console.error(`FAIL  ${index}. ${error && error.stack ? error.stack.split('\n').slice(0, 4).join('\n') : error}`);
	}
}
if (failures > 0) {
	console.error(`\n${failures} of ${scenarios.length} scenarios failed`);
	process.exitCode = 1;
} else {
	console.log(`\nall ${scenarios.length} scenarios pass`);
}
if (UNHANDLED.length > 0) {
	console.error(`note: ${UNHANDLED.length} unhandled rejection(s) escaped the bundle`);
	for (const reason of UNHANDLED.slice(0, 4)) console.error(`  - ${reason.message}`);
}
