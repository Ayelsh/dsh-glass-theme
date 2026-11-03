/**
 * Style lifecycle check — bounded recovery and convergence (task 1.1).
 *
 * Runs the BUILT bundle (lib/client.js) inside a stub DOM whose mutation
 * records are delivered asynchronously and whose animation frames and timers
 * are controlled explicitly. This is the level the defect lives at: the
 * original reconciliation moved its own tags and then reacted to the mutation
 * records of those moves, so it never stopped writing. A tag count cannot see
 * that; this check counts actual stylesheet DOM writes over time.
 *
 * It has two halves:
 *
 *   1. A regression record. The ORIGINAL implementation (preserved verbatim
 *      below as `originalMount`) must FAIL the no-external-change convergence
 *      case: with nobody else touching the document, its own echo keeps
 *      rewriting the sheets every frame. The check asserts that defect is
 *      still reproducible, so the suite can never quietly lose the ability to
 *      catch it again.
 *
 *   2. The contract for the shipped implementation: startup settles with zero
 *      further writes across >=10 frames and >=3 compatibility ticks; host
 *      style batches, trailing metadata/scripts, partial and total sheet
 *      removal, and head replacement all recover once and re-converge;
 *      environments without MutationObserver or requestAnimationFrame still
 *      recover; disposal and mount supersession stop everything.
 *
 *   node tools/build.mjs && node tools/style-lifecycle-check.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PACKAGE = 'dsh-glass-theme';
const bundleSource = readFileSync(join(root, 'lib/client.js'), 'utf8');

/* ==================================================================== *
 * Regression record — the ORIGINAL implementation, verbatim.
 * ==================================================================== */

/**
 * PRESERVED ORIGINAL — a verbatim copy of the `mount` function body from
 * src/client.js as it stood before this change (the implementation the
 * exploration proved defective). Do not modernize, do not "fix": its only job
 * is to keep failing the convergence assertions below, on the record. The
 * outer `const mount = () => { ... }` wrapper became this function
 * declaration so the free variables arrive as parameters; every line inside
 * is untouched.
 */
function originalMount(sheets, PACKAGE, document, requestAnimationFrame, MutationObserver, setTimeout, setInterval, clearInterval) {
	let raising = false;

	const raise = () => {
		if (raising) return;
		const head = document.head ?? document.documentElement ?? null;
		if (head === null || typeof document.createElement !== 'function') return;
		raising = true;
		try {
			for (const sheet of sheets) {
				let tag = document.querySelector(`style[data-plugin-css="${sheet.id}"]`);
				if (tag === null || tag === undefined) {
					tag = document.createElement('style');
					tag.dataset.plugin = PACKAGE;
					tag.dataset.pluginCss = sheet.id;
					tag.textContent = sheet.css;
				}
				// Append-or-move: the skin is always the last cascade layer.
				head.appendChild(tag);
			}
		} finally {
			raising = false;
		}
	};

	raise();
	// The shell installs the theme layer during boot; re-raise once the
	// first paint settles so the skin always lands on top of it.
	if (typeof requestAnimationFrame === 'function') requestAnimationFrame(raise);

	const stops = [];

	// Another stylesheet arriving is the normal case, not an error: wait for
	// the batch to finish (rAF) and only then take the last slot back.
	if (typeof MutationObserver === 'function' && document.head !== null && document.head !== undefined) {
		let queued = false;
		const flush = () => {
			queued = false;
			raise();
		};
		const observer = new MutationObserver((records) => {
			if (raising || queued) return;
			let relevant = false;
			for (const record of records) {
				for (const node of record.addedNodes ?? []) {
					const name = node === null || node === undefined ? '' : node.nodeName;
					if (name === 'STYLE' || name === 'LINK') {
						relevant = true;
						break;
					}
				}
				if (relevant) break;
			}
			if (!relevant) return;
			queued = true;
			if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
			else if (typeof setTimeout === 'function') setTimeout(flush, 0);
			else flush();
		});
		observer.observe(document.head, { childList: true });
		stops.push(() => observer.disconnect());
	}

	// Removal cannot be observed as an addition, and a shell rebuild that
	// replaces <head> wholesale fires nothing we can hook. A cheap poll is
	// the backstop; it exits as soon as the document is gone.
	if (typeof setInterval === 'function' && typeof document.querySelectorAll === 'function') {
		const timer = setInterval(() => {
			try {
				if (document.visibilityState === 'hidden') return;
				const live = document.querySelectorAll(`style[data-plugin="${PACKAGE}"]`).length;
				const last = document.head === null || document.head === undefined ? null : document.head.lastElementChild;
				const ours = last !== null && last !== undefined && last.dataset !== undefined && last.dataset.plugin === PACKAGE;
				if (live < sheets.length || !ours) raise();
			} catch (error) {
				/* the document went away mid-poll */
			}
		}, 750);
		stops.push(() => clearInterval(timer));
	}

	return () => {
		for (const stop of stops) {
			try {
				stop();
			} catch (error) {
				/* already stopped */
			}
		}
		for (const tag of document.querySelectorAll(`style[data-plugin="${PACKAGE}"]`)) tag.remove();
	};
}

/* ==================================================================== *
 * Stub world: instrumented DOM + asynchronous records + controlled clocks
 * ==================================================================== */

const dash = (key) => `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

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
		const self = this;
		this.dataset = new Proxy(
			{},
			{
				get: (_, key) => (self.attributes.has(dash(key)) ? self.attributes.get(dash(key)) : undefined),
				set: (_, key, value) => {
					self.attributes.set(dash(key), String(value));
					return true;
				},
				deleteProperty: (_, key) => {
					self.attributes.delete(dash(key));
					return true;
				},
				has: (_, key) => self.attributes.has(dash(key)),
			},
		);
	}

	get textContent() {
		return this._text;
	}
	set textContent(value) {
		this.childNodes.length = 0;
		this._text = String(value ?? '');
		if (this.tagName === 'STYLE') this._world.styleWrite(`text:${this.attributes.get('data-plugin-css') ?? 'host'}`);
	}

	get lastElementChild() {
		for (let i = this.childNodes.length - 1; i >= 0; i--) if (this.childNodes[i].nodeType === 1) return this.childNodes[i];
		return null;
	}

	getAttribute(name) {
		return this.attributes.has(name) ? this.attributes.get(name) : null;
	}
	setAttribute(name, value) {
		this.attributes.set(name, String(value));
	}
	hasAttribute(name) {
		return this.attributes.has(name);
	}
	removeAttribute(name) {
		this.attributes.delete(name);
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

	_emit(record) {
		this._world.pendingRecords.push(record);
	}

	appendChild(child) {
		const old = child.parentNode;
		if (old !== null) {
			const at = old.childNodes.indexOf(child);
			if (at >= 0) old.childNodes.splice(at, 1);
			old._emit({ target: old, addedNodes: [], removedNodes: [child] });
		}
		this.childNodes.push(child);
		child.parentNode = this;
		this._emit({ target: this, addedNodes: [child], removedNodes: [] });
		if (child.tagName === 'STYLE') this._world.styleWrite(`append:${child.getAttribute('data-plugin-css') ?? 'host'}`);
		return child;
	}

	removeChild(child) {
		const at = this.childNodes.indexOf(child);
		if (at >= 0) this.childNodes.splice(at, 1);
		child.parentNode = null;
		this._emit({ target: this, addedNodes: [], removedNodes: [child] });
		if (child.tagName === 'STYLE') this._world.styleWrite(`remove:${child.getAttribute('data-plugin-css') ?? 'host'}`);
		return child;
	}

	remove() {
		if (this.parentNode === null) return;
		this.parentNode.removeChild(this);
	}
}

/** Tolerant selector matching for the shapes the bundle and stubs use. */
const matches = (el, selector) => {
	for (const part of String(selector).split(',').map((s) => s.trim())) {
		if (part === '' || part === '*') continue;
		let rest = part;
		let ok = true;
		const tagMatch = /^([a-zA-Z][\w-]*)/.exec(rest);
		if (tagMatch) {
			if (el.tagName !== tagMatch[1].toUpperCase()) continue;
			rest = rest.slice(tagMatch[1].length);
		}
		const attrRe = /^\[\s*([\w-]+)\s*(?:~?\^?=\s*"([^"]*)"\s*)?\]/g;
		while (rest.startsWith('[')) {
			const m = attrRe.exec(rest);
			if (m === null) {
				ok = false;
				break;
			}
			const [, name, value] = m;
			const actual = el.getAttribute(name);
			if (value === undefined) {
				if (actual === null) {
					ok = false;
					break;
				}
			} else if (m[0].includes('~=')) {
				const tokens = String(actual ?? '').split(/\s+/);
				if (!tokens.includes(value)) {
					ok = false;
					break;
				}
			} else if (actual !== value) {
				ok = false;
				break;
			}
			rest = rest.slice(m[0].length);
		}
		if (rest.startsWith('.')) {
			const cls = rest.slice(1);
			if (!String(el.getAttribute('class') ?? '').split(/\s+/).includes(cls)) continue;
			rest = '';
		}
		if (!ok || rest !== '') continue;
		return true;
	}
	return false;
};

const collectTree = (root, out) => {
	if (root === null || root === undefined || typeof root !== 'object') return out;
	for (const child of root.childNodes ?? []) collectTree(child, out);
	out.push(root);
	return out;
};

const makeWorld = ({ mutationObserver = true, animationFrames = true } = {}) => {
	const world = {
		pendingRecords: [],
		observers: [],
		errors: [],
		consoleErrors: [],
		styleWrites: 0,
		writeLog: [],
		mutationObserverAvailable: mutationObserver,
		animationFramesAvailable: animationFrames,
		registration: null,
		queryCount: 0,
		/* Subsystems outside this check's scope (picker, workspace, stats…)
		 * poll the DOM at mount and can spin forever against a stub that
		 * never satisfies them. A query budget turns that wedge into an
		 * exception their own try/catch already tolerates, so the style
		 * lifecycle under test still runs. */
		queryBudget: 5000,
		styleWrite(kind) {
			world.styleWrites += 1;
			world.writeLog.push(kind);
		},
		mark() {
			const at = world.styleWrites;
			return () => world.styleWrites - at;
		},
	};

	const documentElement = new El(world, 'html');
	const head = new El(world, 'head');
	const body = new El(world, 'body');
	documentElement.appendChild(head);
	documentElement.appendChild(body);
	// appendChild already counted no style writes; start every world at zero.
	world.styleWrites = 0;
	world.writeLog.length = 0;
	world.documentElement = documentElement;
	world.head = head;

	world.document = {
		nodeType: 9,
		visibilityState: 'visible',
		get head() {
			return world.head;
		},
		set head(value) {
			world.head = value;
		},
		get body() {
			return body;
		},
		get documentElement() {
			return documentElement;
		},
		createElement: (tag) => new El(world, tag),
		querySelector(selector) {
			try {
				world.queryCount += 1;
				if (world.queryCount > world.queryBudget) throw new Error('stub DOM: query budget exhausted');
				for (const el of collectTree(documentElement, [])) {
					if (el.nodeType === 1 && matches(el, selector)) return el;
				}
			} catch (error) {
				if (String(error && error.message).includes('query budget')) throw error;
				/* unknown selector shape: nothing matches */
			}
			return null;
		},
		querySelectorAll(selector) {
			const out = [];
			try {
				world.queryCount += 1;
				if (world.queryCount > world.queryBudget) throw new Error('stub DOM: query budget exhausted');
				for (const el of collectTree(documentElement, [])) {
					if (el.nodeType === 1 && matches(el, selector)) out.push(el);
				}
			} catch (error) {
				if (String(error && error.message).includes('query budget')) throw error;
				/* unknown selector shape: nothing matches */
			}
			return out;
		},
		addEventListener() {},
		removeEventListener() {},
	};

	class FakeMutationObserver {
		constructor(callback) {
			this.callback = callback;
			this.targets = new Set();
			this.queue = [];
			world.observers.push(this);
		}
		observe(target) {
			this.targets.add(target);
		}
		disconnect() {
			this.targets.clear();
			this.queue.length = 0;
		}
		takeRecords() {
			const records = this.queue;
			this.queue = [];
			return records;
		}
	}
	world.MutationObserver = mutationObserver ? FakeMutationObserver : undefined;

	/* Frames: callbacks run only when pumped; records deliver first, like a
	 * microtask checkpoint landing before the frame's rAF batch. */
	let rafSeq = 0;
	const rafQueue = new Map();
	world.requestAnimationFrame = animationFrames
		? (fn) => {
				const id = ++rafSeq;
				rafQueue.set(id, fn);
				return id;
			}
		: undefined;
	world.cancelAnimationFrame = animationFrames
		? (id) => rafQueue.delete(id)
		: undefined;
	world.pumpFrames = (count) => {
		for (let i = 0; i < count; i++) {
			world.deliver();
			if (rafQueue.size === 0) continue;
			const batch = [...rafQueue.entries()];
			rafQueue.clear();
			for (const [, fn] of batch) {
				try {
					fn();
				} catch (error) {
					world.errors.push(error);
				}
			}
			world.deliver();
		}
	};

	/* Timers: a virtual clock. advance() runs what is due, in order, with a
	 * record delivery before each batch — never in real time. */
	let timeSeq = 0;
	let now = 0;
	const timers = new Map();
	world.setTimeout = (fn, ms) => {
		const id = ++timeSeq;
		timers.set(id, { at: now + Math.max(0, Math.floor(ms) || 0), fn, interval: false });
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
	world.advance = (ms) => {
		const end = now + ms;
		for (;;) {
			world.deliver();
			let dueId = null;
			let due = null;
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
		}
		now = end;
	};

	/** Deliver pending mutation records — the asynchronous step. */
	world.deliver = () => {
		if (world.pendingRecords.length === 0) return;
		const pending = world.pendingRecords;
		world.pendingRecords = [];
		for (const record of pending) {
			for (const observer of world.observers) {
				if (observer.targets.has(record.target)) observer.queue.push(record);
			}
		}
		for (const observer of [...world.observers]) {
			if (observer.queue.length === 0) continue;
			const records = observer.queue;
			observer.queue = [];
			try {
				observer.callback(records, observer);
			} catch (error) {
				world.errors.push(error);
			}
		}
	};

	world.silentConsole = {
		log() {},
		warn() {},
		error(error) {
			world.consoleErrors.push(String(error && error.message ? error.message : error));
		},
	};

	return world;
};

/** Run the built bundle in a world and apply it once; returns a disposer. */
const applyBundle = (world) => {
	const sandbox = {
		window: {
			__ModuleLoader__: {
				load(record) {
					world.registration = record;
				},
			},
		},
		document: world.document,
		console: world.silentConsole,
		requestAnimationFrame: world.requestAnimationFrame,
		cancelAnimationFrame: world.cancelAnimationFrame,
		MutationObserver: world.MutationObserver,
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
	const disposers = [];
	exported.apply({
		effect(fn) {
			const stop = fn();
			if (typeof stop === 'function') disposers.push(stop);
		},
	});
	return () => {
		for (const stop of disposers.splice(0)) {
			try {
				stop();
			} catch (error) {
				world.errors.push(error);
			}
		}
	};
};

/* ==================================================================== *
 * Assertions
 * ==================================================================== */

const skinTags = (world) =>
	world.head.childNodes.filter(
		(node) =>
			node.nodeType === 1 &&
			node.tagName === 'STYLE' &&
			node.getAttribute('data-plugin') === PACKAGE &&
			node.getAttribute('data-plugin-css') !== null,
	);

const hostSheets = (world) =>
	world.head.childNodes.filter((node) => {
		if (node.nodeType !== 1) return false;
		if (node.tagName === 'STYLE') return node.getAttribute('data-plugin') !== PACKAGE;
		if (node.tagName === 'LINK') return /\bstylesheet\b/i.test(String(node.getAttribute('rel') ?? ''));
		return false;
	});

const assertSettled = (world, declaredOrder) => {
	const tags = skinTags(world);
	if (tags.length !== declaredOrder.length) {
		throw new Error(`expected ${declaredOrder.length} skin sheets, found ${tags.length}`);
	}
	const ids = tags.map((tag) => tag.getAttribute('data-plugin-css'));
	if (new Set(ids).size !== ids.length) throw new Error(`duplicate sheet ids: ${ids.join(', ')}`);
	if (ids.join('|') !== declaredOrder.join('|')) {
		throw new Error(`sheets out of declared order: ${ids.join(', ')}`);
	}
	for (const tag of tags) {
		if (!tag.textContent || tag.textContent.length === 0) throw new Error(`sheet ${tag.getAttribute('data-plugin-css')} is empty`);
	}
	/* No host stylesheet may follow the first skin sheet. */
	const first = world.head.childNodes.indexOf(tags[0]);
	for (const host of hostSheets(world)) {
		if (world.head.childNodes.indexOf(host) > first) {
			throw new Error('a host stylesheet sits after the skin sheets');
		}
	}
	return tags;
};

const hostStyle = (world) => {
	const tag = world.document.createElement('style');
	tag.setAttribute('data-origin', 'host');
	return tag;
};

/* ==================================================================== *
 * Scenarios
 * ==================================================================== */

const scenarios = [];

/** 1. Regression record: the original implementation keeps rewriting. */
scenarios.push(async () => {
	const world = makeWorld();
	const sheets = [
		{ id: `${PACKAGE}/a.css`, css: '/*a*/' },
		{ id: `${PACKAGE}/b.css`, css: '/*b*/' },
		{ id: `${PACKAGE}/c.css`, css: '/*c*/' },
	];
	const dispose = originalMount(
		sheets,
		PACKAGE,
		world.document,
		world.requestAnimationFrame,
		world.MutationObserver,
		world.setTimeout,
		world.setInterval,
		world.clearInterval,
	);
	world.pumpFrames(4);
	const afterWarmup = world.styleWrites;
	world.pumpFrames(8);
	const frameDelta = world.styleWrites - afterWarmup;
	const beforeTicks = world.styleWrites;
	world.advance(750 * 3);
	const tickDelta = world.styleWrites - beforeTicks;
	dispose();
	if (frameDelta <= 0 && tickDelta <= 0) {
		throw new Error(
			`regression NOT reproduced: with no external changes the original converged (frameDelta=${frameDelta}, tickDelta=${tickDelta}) — this check has lost its ability to catch the defect`,
		);
	}
	return `regression reproduced: original wrote ${frameDelta} more times over 8 idle frames and ${tickDelta} more over 3 idle ticks with no external change`;
});

/** 2. Startup settles with no external changes. */
scenarios.push(async () => {
	const world = makeWorld();
	const dispose = applyBundle(world);
	world.pumpFrames(2);
	const declared = skinTags(world).map((tag) => tag.getAttribute('data-plugin-css'));
	if (declared.length < 9) throw new Error(`expected the full sheet set, found ${declared.length}`);
	assertSettled(world, declared);
	const delta = world.mark();
	world.pumpFrames(10);
	world.advance(750 * 3);
	if (delta() !== 0) throw new Error(`startup never settled: ${delta()} extra style writes over 10 frames + 3 ticks (first: ${world.writeLog.slice(-delta())[0]})`);
	assertSettled(world, declared);
	dispose();
	if (skinTags(world).length !== 0) throw new Error('disposal left sheets behind');
	return `settled: 0 writes over 10 frames + 3 ticks, ${declared.length} sheets in order`;
});

/** 3. A batch of host styles arrives together. */
scenarios.push(async () => {
	const world = makeWorld();
	const dispose = applyBundle(world);
	world.pumpFrames(2);
	const declared = skinTags(world).map((tag) => tag.getAttribute('data-plugin-css'));
	const extraA = hostStyle(world);
	const extraB = hostStyle(world);
	world.head.appendChild(extraA);
	world.head.appendChild(extraB);
	const delta = world.mark();
	world.pumpFrames(3);
	assertSettled(world, declared);
	if (hostSheets(world).length !== 2) throw new Error('host sheets were not left alone');
	const idle = world.mark();
	world.pumpFrames(10);
	world.advance(750 * 3);
	if (idle() !== 0) throw new Error(`batch did not converge: ${idle()} extra writes`);
	dispose();
	return 'host batch re-ordered once and re-converged';
});

/** 4. Trailing metadata and scripts never justify a move. */
scenarios.push(async () => {
	const world = makeWorld();
	const dispose = applyBundle(world);
	world.pumpFrames(2);
	const before = skinTags(world).map((tag) => world.head.childNodes.indexOf(tag));
	const meta = world.document.createElement('meta');
	const script = world.document.createElement('script');
	world.head.appendChild(meta);
	world.head.appendChild(script);
	const delta = world.mark();
	world.pumpFrames(10);
	world.advance(750 * 3);
	if (delta() !== 0) throw new Error(`unrelated trailing nodes caused ${delta()} style writes`);
	const after = skinTags(world).map((tag) => world.head.childNodes.indexOf(tag));
	if (before.join(',') !== after.join(',')) throw new Error('skin sheets were moved because a script was last');
	dispose();
	return 'trailing meta/script nodes caused zero moves';
});

/** 5. Removing one sheet recovers exactly once. */
scenarios.push(async () => {
	const world = makeWorld();
	const dispose = applyBundle(world);
	world.pumpFrames(2);
	const declared = skinTags(world).map((tag) => tag.getAttribute('data-plugin-css'));
	skinTags(world)[5].remove();
	world.pumpFrames(3);
	assertSettled(world, declared);
	const idle = world.mark();
	world.pumpFrames(10);
	world.advance(750 * 3);
	if (idle() !== 0) throw new Error(`removal repair did not settle: ${idle()} extra writes`);
	dispose();
	return 'single sheet removal restored once and re-converged';
});

/** 6. Removing every sheet recovers without duplicates. */
scenarios.push(async () => {
	const world = makeWorld();
	const dispose = applyBundle(world);
	world.pumpFrames(2);
	const declared = skinTags(world).map((tag) => tag.getAttribute('data-plugin-css'));
	for (const tag of skinTags(world)) tag.remove();
	world.pumpFrames(3);
	assertSettled(world, declared);
	const idle = world.mark();
	world.pumpFrames(10);
	world.advance(750 * 3);
	if (idle() !== 0) throw new Error(`full-removal repair did not settle: ${idle()} extra writes`);
	dispose();
	return 'all-sheet deletion restored once and re-converged';
});

/** 7. Head replacement: rebuild in the new head and keep observing it. */
scenarios.push(async () => {
	const world = makeWorld();
	const dispose = applyBundle(world);
	world.pumpFrames(2);
	const declared = skinTags(world).map((tag) => tag.getAttribute('data-plugin-css'));
	const oldHead = world.head;
	const newHead = new El(world, 'head');
	newHead.appendChild(hostStyle(world));
	world.documentElement.removeChild(oldHead);
	world.documentElement.appendChild(newHead);
	world.document.head = newHead;
	world.advance(750);
	assertSettled(world, declared);
	/* The observer must be reconnected to the NEW head: a later host sheet
	 * arriving there is repaired through frames alone, before any tick. */
	newHead.appendChild(hostStyle(world));
	world.pumpFrames(3);
	assertSettled(world, declared);
	const idle = world.mark();
	world.pumpFrames(10);
	world.advance(750 * 3);
	if (idle() !== 0) throw new Error(`head replacement did not settle: ${idle()} extra writes`);
	dispose();
	if (skinTags(world).length !== 0) throw new Error('disposal left sheets in the replacement head');
	return 'replaced head rebuilt, observation reconnected, cascade preserved';
});

/** 8. No MutationObserver: the visible-document interval still recovers. */
scenarios.push(async () => {
	const world = makeWorld({ mutationObserver: false });
	const dispose = applyBundle(world);
	world.pumpFrames(2);
	const declared = skinTags(world).map((tag) => tag.getAttribute('data-plugin-css'));
	assertSettled(world, declared);
	skinTags(world)[2].remove();
	const delta = world.mark();
	world.advance(750);
	assertSettled(world, declared);
	const idle = world.mark();
	world.advance(750 * 3);
	if (idle() !== 0) throw new Error(`interval kept rewriting a correct set: ${idle()} writes`);
	dispose();
	return 'without mutation observation the 750ms check restored the sheet and stopped';
});

/** 9. No animation frames: repair falls back to the timeout scheduler. */
scenarios.push(async () => {
	const world = makeWorld({ animationFrames: false });
	const dispose = applyBundle(world);
	world.advance(5);
	const declared = skinTags(world).map((tag) => tag.getAttribute('data-plugin-css'));
	assertSettled(world, declared);
	world.head.appendChild(hostStyle(world));
	world.deliver();
	world.advance(5);
	assertSettled(world, declared);
	const idle = world.mark();
	world.advance(750 * 3);
	if (idle() !== 0) throw new Error(`timeout-scheduled repair did not settle: ${idle()} writes`);
	dispose();
	return 'without rAF the fallback scheduler repaired and settled';
});

/** 10. A pending repair during unload never resurrects the sheets. */
scenarios.push(async () => {
	const world = makeWorld();
	const dispose = applyBundle(world);
	world.pumpFrames(2);
	world.head.appendChild(hostStyle(world));
	world.deliver(); // observer queues the repair frame…
	dispose(); // …but the skin is unloaded before it runs
	const delta = world.mark();
	world.pumpFrames(10);
	world.advance(750 * 3);
	if (delta() !== 0) throw new Error(`late callbacks wrote ${delta()} times after disposal`);
	if (skinTags(world).length !== 0) throw new Error('a late callback resurrected the sheets');
	return 'pending repair cancelled at disposal; nothing came back';
});

/** 11. A newer mount owns the set; the old disposer cannot strip it. */
scenarios.push(async () => {
	const world = makeWorld();
	const disposeA = applyBundle(world);
	world.pumpFrames(2);
	const declared = skinTags(world).map((tag) => tag.getAttribute('data-plugin-css'));
	const disposeB = applyBundle(world); // hot reload: new mount before old dispose
	world.pumpFrames(2);
	assertSettled(world, declared); // reused, not duplicated
	disposeA();
	world.pumpFrames(5);
	world.advance(750 * 3);
	assertSettled(world, declared); // old disposer must not remove the new mount's sheets
	if (world.document.documentElement.dataset.dshGlassTheme !== '') {
		throw new Error('obsolete disposer cleared the active-skin markers');
	}
	disposeB();
	if (skinTags(world).length !== 0) throw new Error('final disposal left sheets behind');
	if (world.document.documentElement.dataset.dshGlassTheme !== undefined) {
		throw new Error('final disposal left the active-skin markers');
	}
	return 'superseded disposer left the newer mount fully intact';
});

/** 12. A hidden document defers recovery; visibility resumes it. */
scenarios.push(async () => {
	const world = makeWorld();
	const dispose = applyBundle(world);
	world.pumpFrames(2);
	const declared = skinTags(world).map((tag) => tag.getAttribute('data-plugin-css'));
	world.document.visibilityState = 'hidden';
	skinTags(world)[1].remove();
	world.advance(750 * 2);
	if (skinTags(world).length !== declared.length - 1) throw new Error('hidden document was repaired anyway');
	world.document.visibilityState = 'visible';
	world.advance(750);
	assertSettled(world, declared);
	dispose();
	return 'hidden deferred recovery; visible restored it';
});

/* ==================================================================== *
 * Runner
 * ==================================================================== */

let failures = 0;
let index = 0;
for (const scenario of scenarios) {
	index += 1;
	console.error(`→ ${index}/${scenarios.length} started`);
	try {
		const note = await scenario();
		console.log(`ok    ${index}. ${note}`);
	} catch (error) {
		failures += 1;
		console.error(`FAIL  ${index}. ${error && error.message ? error.message : error}`);
	}
}
void (() => {})();

if (failures > 0) {
	console.error(`\n${failures} of ${scenarios.length} scenarios failed`);
	process.exitCode = 1;
} else {
	console.log(`\nall ${scenarios.length} scenarios pass`);
}
