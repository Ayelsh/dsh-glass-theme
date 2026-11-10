import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Verify CSS Tokens & Apple Liquid Glass Rules
test('team.css complies with design tokens and Liquid Glass geometry', () => {
	const cssPath = path.join(rootDir, 'src', 'css', 'team.css');
	const css = fs.readFileSync(cssPath, 'utf8');

	// Must NOT contain undefined variables
	assert.ok(!css.includes('--dsw-alias-accent'), 'Must not reference undefined --dsw-alias-accent');
	assert.ok(!css.includes('--dsw-alias-label-invert'), 'Must not reference undefined --dsw-alias-label-invert');
	assert.ok(!css.includes('--lg-surface-hover'), 'Must not reference undefined --lg-surface-hover');

	// Must NOT contain hardcoded status colors
	assert.ok(!css.includes('#f59e0b'), 'Must not contain hardcoded #f59e0b (amber)');
	assert.ok(!css.includes('#10b981'), 'Must not contain hardcoded #10b981 (emerald)');
	assert.ok(!css.includes('#ef4444'), 'Must not contain hardcoded #ef4444 (red)');

	// Must contain semantic tokens
	assert.ok(css.includes('var(--lg-accent)'), 'Must use --lg-accent');
	assert.ok(css.includes('var(--lg-selection-label)'), 'Must use --lg-selection-label');
	assert.ok(css.includes('var(--lg-warning)'), 'Must use --lg-warning');
	assert.ok(css.includes('var(--lg-success)'), 'Must use --lg-success');
	assert.ok(css.includes('var(--lg-danger)'), 'Must use --lg-danger');

	// Concentric geometry rule: r_inner = r_outer - gap
	assert.ok(css.includes('calc(var(--lg-r-panel) - 8px)'), 'Must have concentric inner radii');

	// Motion and press scaling
	assert.ok(css.includes('--lg-ease-spring'), 'Must use spring easing');
	assert.ok(css.includes('scale(0.97)'), 'Must implement physical active press scaling');

	// Reduced motion and transparency media queries
	assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'Must support prefers-reduced-motion');
	assert.ok(css.includes('@media (prefers-reduced-transparency: reduce)'), 'Must support prefers-reduced-transparency');
});

// 2. Verify Locales
test('locales have 100% team key parity and include super-agent phrases', () => {
	const zh = JSON.parse(fs.readFileSync(path.join(rootDir, 'locale', 'zh.json'), 'utf8'));
	const en = JSON.parse(fs.readFileSync(path.join(rootDir, 'locale', 'en.json'), 'utf8'));

	assert.ok(zh.team, 'zh.json must have team dictionary');
	assert.ok(en.team, 'en.json must have team dictionary');

	const zhKeys = Object.keys(zh.team).sort();
	const enKeys = Object.keys(en.team).sort();
	assert.deepEqual(zhKeys, enKeys, 'zh and en team keys must be identical');

	// Key Super-agent terms
	const expectedKeys = [
		'routerTitle', 'routerRole', 'workerRole', 'quickTaskPlaceholder',
		'dispatch', 'targetAuto', 'tabPulse', 'tabRecall', 'tabCognition',
		'thinkingStreamTitle', 'toolTimelineTitle', 'sessionBindingTitle',
		'openNativeSession', 'expandMissionControl', 'closeMissionControl',
	];
	for (const key of expectedKeys) {
		assert.ok(zhKeys.includes(key), `Missing expected locale key: ${key}`);
	}
});

// 3. Client UI DOM & Workflow Tests
// Create a minimal lightweight DOM mock
function createMockElement(tagName = 'div', className = '') {
	const children = [];
	const listeners = {};
	const attributes = {};
	const style = {};
	const dataset = {};
	let _textContent = '';
	let _value = '';

	const el = {
		tagName: tagName.toUpperCase(),
		className,
		dataset,
		style,
		get classList() {
			return {
				add(...classes) {
					const parts = new Set(el.className ? el.className.split(/\s+/) : []);
					for (const c of classes) parts.add(c);
					el.className = Array.from(parts).join(' ');
				},
				remove(...classes) {
					const parts = new Set(el.className ? el.className.split(/\s+/) : []);
					for (const c of classes) parts.delete(c);
					el.className = Array.from(parts).join(' ');
				},
				toggle(cls, force) {
					const parts = new Set(el.className ? el.className.split(/\s+/) : []);
					const has = parts.has(cls);
					const shouldAdd = force !== undefined ? force : !has;
					if (shouldAdd) parts.add(cls);
					else parts.delete(cls);
					el.className = Array.from(parts).join(' ');
					return shouldAdd;
				},
				contains(cls) {
					const parts = el.className ? el.className.split(/\s+/) : [];
					return parts.includes(cls);
				},
			};
		},
		get parentElement() {
			return el._parent || null;
		},
		get childNodes() {
			return children;
		},
		get textContent() {
			if (_textContent) return _textContent;
			return children.map((c) => c.textContent).join('');
		},
		set textContent(val) {
			_textContent = String(val);
			children.length = 0;
		},
		get value() {
			return _value;
		},
		set value(val) {
			_value = String(val);
		},
		get innerHTML() {
			return children.map((c) => `<${c.tagName.toLowerCase()} class="${c.className}">${c.textContent}</${c.tagName.toLowerCase()}>`).join('');
		},
		set innerHTML(val) {
			children.length = 0;
			if (val === '') {
				_textContent = '';
			} else {
				_textContent = val;
			}
		},
		appendChild(child) {
			if (child) {
				child._parent = el;
				children.push(child);
			}
			return child;
		},
		insertBefore(newChild, refChild) {
			if (!newChild) return newChild;
			newChild._parent = el;
			const idx = refChild ? children.indexOf(refChild) : -1;
			if (idx >= 0) {
				children.splice(idx, 0, newChild);
			} else {
				children.push(newChild);
			}
			return newChild;
		},
		removeChild(child) {
			const idx = children.indexOf(child);
			if (idx >= 0) {
				children.splice(idx, 1);
				child._parent = null;
			}
			return child;
		},
		setAttribute(name, value) {
			attributes[name] = String(value);
		},
		getAttribute(name) {
			return attributes[name] || null;
		},
		removeAttribute(name) {
			delete attributes[name];
		},
		addEventListener(type, fn) {
			if (!listeners[type]) listeners[type] = [];
			listeners[type].push(fn);
		},
		removeEventListener(type, fn) {
			if (listeners[type]) {
				listeners[type] = listeners[type].filter((f) => f !== fn);
			}
		},
		dispatchEvent(event) {
			event.target = el;
			if (listeners[event.type]) {
				for (const fn of listeners[event.type]) fn(event);
			}
			if (el._parent) el._parent.dispatchEvent(event);
		},
		click() {
			el.dispatchEvent({ type: 'click', target: el });
		},
		focus() {},
		setSelectionRange() {},
		closest(selector) {
			let cur = el;
			while (cur) {
				if (matchesSelector(cur, selector)) return cur;
				cur = cur.parentElement;
			}
			return null;
		},
		contains(target) {
			let cur = target;
			while (cur) {
				if (cur === el) return true;
				cur = cur.parentElement;
			}
			return false;
		},
		querySelector(selector) {
			const res = el.querySelectorAll(selector);
			return res.length > 0 ? res[0] : null;
		},
		querySelectorAll(selector) {
			const results = [];
			function walk(node) {
				for (const child of node.childNodes) {
					if (matchesSelector(child, selector)) {
						results.push(child);
					}
					walk(child);
				}
			}
			walk(el);
			return results;
		},
		insertAdjacentHTML(pos, html) {
			const span = createMockElement('span');
			span.innerHTML = html;
			el.appendChild(span);
		},
	};
	return el;
}

function matchesSelector(el, selector) {
	if (!selector) return false;
	const parts = selector.split(',').map((s) => s.trim());
	for (const part of parts) {
		if (part.startsWith('.')) {
			const cls = part.slice(1);
			if (el.classList.contains(cls)) return true;
		} else if (part.startsWith('#')) {
			if (el.id === part.slice(1)) return true;
		} else if (part.startsWith('[') && part.endsWith(']')) {
			const inside = part.slice(1, -1);
			if (inside.includes('=')) {
				const [k, v] = inside.split('=').map((s) => s.replace(/['"]/g, ''));
				if (k.startsWith('data-')) {
					const dataKey = k.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
					if (el.dataset[dataKey] === v) return true;
				}
				if (el.getAttribute(k) === v) return true;
			} else {
				if (inside.startsWith('data-')) {
					const dataKey = inside.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
					if (el.dataset[dataKey] !== undefined) return true;
				}
				if (el.getAttribute(inside) !== null) return true;
			}
		} else if (el.tagName.toLowerCase() === part.toLowerCase()) {
			return true;
		}
	}
	return false;
}

test('createTeam UI renders Router Card, Isolated Workers, and Slide-Over Drawer', async () => {
	// Setup global DOM environment
	const docBody = createMockElement('body');
	globalThis.document = {
		createElement: createMockElement,
		getElementById(id) {
			const all = docBody.querySelectorAll('#' + id);
			return all.length > 0 ? all[0] : (docBody.id === id ? docBody : null);
		},
		querySelectorAll(sel) {
			return docBody.querySelectorAll(sel);
		},
		body: docBody,
		activeElement: null,
	};
	globalThis.window = {
		document: globalThis.document,
		__DSH_AGENT_TEAM__: null,
	};
	globalThis.React = {
		Component: class Component {},
		createElement: (type, props, ...children) => ({ type, props, children }),
	};
	globalThis.fetch = async () => ({
		ok: true,
		status: 200,
		json: async () => ({ team: {}, live: {} }),
	});

	const teamSource = fs.readFileSync(path.join(rootDir, 'src', 'team.js'), 'utf8');
	const createTeamFactory = new Function(`${teamSource}\nreturn createTeam;`);
	const createTeam = createTeamFactory();

	let selectedSession = null;
	const postedCalls = [];

	const ctx = {
		get(name) {
			if (name === 'uiSession') {
				return {
					selectSession(id) {
						selectedSession = id;
					},
				};
			}
			return null;
		},
		slots: {
			inject: (slotName, fn) => {
				const cleanup = fn();
				return { start() {}, stop() { if (cleanup) cleanup(); } };
			},
			register: () => () => {},
		},
	};

	const shared = {
		state: {
			currentSessionId: 'ses_main',
		},
		on: () => () => {},
		emit: () => {},
	};

	const prefs = {
		read: () => ({}),
		write: () => {},
	};

	const catalog = {};

	const req = (mod) => (mod === 'react' ? globalThis.React : null);
	const instance = createTeam(req, ctx, catalog, shared, prefs);
	const teamApi = instance.register();
	const __lg = teamApi.__lg;

	// Populate team state
	__lg.state.team = {
		profiles: [
			{ id: 'lead', name: 'Lead Router', role: 'lead', sessionId: 'ses_lead' },
			{ id: 'worker1', name: 'Coder Worker', role: 'member', sessionId: 'ses_w1' },
			{ id: 'worker2', name: 'Reviewer Worker', role: 'member', sessionId: 'ses_w2' },
		],
		rooms: [],
		tickets: [
			{ id: 'tkt_1', title: 'Refactor UI', status: 'working', workerId: 'worker1', summary: 'Working on UI' },
			{ id: 'tkt_2', title: 'Review Code', status: 'observed', workerId: 'worker2', summary: 'Observed ticket' },
		],
	};

	// Mock live telemetry
	__lg.state.live = {
		telemetry: {
			ses_w1: {
				sessionId: 'ses_w1',
				thinking: 'Thinking about optimizing layout...',
				tools: [
					{ name: 'read_file', status: 'done', inputSummary: 'src/team.js' },
				],
				messages: [{ role: 'assistant', text: 'Working on it' }],
				phase: 'thinking',
				presence: 'working',
			},
		},
		sessions: [
			{ id: 'ses_lead', title: 'Lead Session' },
			{ id: 'ses_w1', title: 'Worker 1 Session' },
			{ id: 'ses_w2', title: 'Worker 2 Session' },
		],
	};

	// 1. Check DOM structure of roster & router card
	__lg.buildDom();
	__lg.renderRoster();
	const root = __lg.root;
	assert.ok(root, 'Team root DOM must exist');

	// Router Card should be rendered
	const routerCard = root.querySelector('.lg-team-routerCard');
	assert.ok(routerCard, 'Router console card must be rendered in router slot');
	assert.ok(routerCard.textContent.includes('Lead Router'), 'Router card must show lead name');
	assert.ok(routerCard.textContent.includes('主控 (Router)'), 'Router card must show Router role');

	// Task intake input & target select
	const routerInput = routerCard.querySelector('.lg-team-routerInput');
	const routerTarget = routerCard.querySelector('.lg-team-routerTarget');
	const routerDispatch = routerCard.querySelector('.lg-team-routerDispatch');
	assert.ok(routerInput, 'Router intake input must exist');
	assert.ok(routerTarget, 'Router worker select must exist');
	assert.ok(routerDispatch, 'Router dispatch button must exist');

	// Workers roster
	const roster = root.querySelector('.lg-team-roster');
	const workerRows = roster.querySelectorAll('.lg-team-row');
	assert.equal(workerRows.length, 2, 'Roster must contain exactly 2 workers (lead excluded)');
	assert.ok(!roster.textContent.includes('Lead Router'), 'Lead must not be listed in worker roster');
	assert.ok(roster.textContent.includes('Coder Worker'), 'Worker 1 must be in roster');
	assert.ok(roster.textContent.includes('Reviewer Worker'), 'Worker 2 must be in roster');

	// Worker 1 should show live telemetry snippet
	assert.ok(workerRows[0].textContent.includes('Thinking about optimizing'), 'Worker 1 caption must show thinking telemetry');

	// Primary click on worker row opens panel
	__lg.dispatch('row-select', 'worker1');
	assert.ok(__lg.state.panel, 'Panel state must be set on row-select');
	assert.equal(__lg.state.panel.id, 'worker1');
	assert.equal(__lg.state.inspectorTab, 'pulse', 'Default inspector tab must be pulse');

	// Render inspector panel
	__lg.renderPanel();
	const inspector = root.querySelector('.lg-team-inspector');
	assert.ok(inspector, 'Slide-over inspector drawer must be rendered');

	// 3-way segmented control
	const segBtns = inspector.querySelectorAll('.lg-team-segBtn');
	assert.equal(segBtns.length, 3, 'Must render 3 segment buttons (pulse, recall, cognition)');

	// Pulse tab content
	assert.ok(inspector.textContent.includes('Thinking about optimizing layout'), 'Inspector must show thinking stream');
	assert.ok(inspector.textContent.includes('read_file'), 'Inspector must show tool timeline');

	// Session binding selector
	const sessionSelect = inspector.querySelector('.lg-team-sessionSelect');
	assert.ok(sessionSelect, 'Inspector must have session binding selector');

	// Open native session button
	const openNativeBtn = inspector.querySelector('.lg-team-openNativeSession');
	assert.ok(openNativeBtn, 'Inspector must have open native session button');
	__lg.dispatch('focus-session', 'ses_w1');
	assert.equal(selectedSession, 'ses_w1', 'focus-session must call uiSession.selectSession');

	// Switch to Recall tab
	__lg.dispatch('seg-tab', 'recall');
	assert.equal(__lg.state.inspectorTab, 'recall');
	__lg.renderPanel();
	const recallInspector = root.querySelector('.lg-team-inspector');
	assert.ok(recallInspector.textContent.includes('Refactor UI'), 'Worker 1 recall tab must show Worker 1 ticket');
	assert.ok(!recallInspector.textContent.includes('Review Code'), 'Worker 1 recall tab must NOT show Worker 2 ticket (strict filtering)');

	// Inspect Lead - Recall tab shows Global Queue
	__lg.dispatch('row-select', 'lead');
	__lg.dispatch('seg-tab', 'recall');
	__lg.renderPanel();
	const leadInspector = root.querySelector('.lg-team-inspector');
	assert.ok(leadInspector.textContent.includes('全局工单队列'), 'Lead recall tab must be Global Queue');
	assert.ok(leadInspector.textContent.includes('Refactor UI'), 'Lead recall tab must include Worker 1 ticket');
	assert.ok(leadInspector.textContent.includes('Review Code'), 'Lead recall tab must include Worker 2 ticket');

	// Test Mission Control Workbench Toggle
	__lg.toggleWorkbench();
	assert.equal(__lg.state.workbenchOpen, true, 'Workbench should be open');
	const overlay = docBody.querySelector('#lg-team-workbench-overlay');
	assert.ok(overlay, 'Workbench overlay element must exist in document.body');
	assert.ok(overlay.textContent.includes('Super-agent Mission Control'), 'Workbench must have Super-agent Mission Control title');

	// Close Workbench
	__lg.toggleWorkbench();
	assert.equal(__lg.state.workbenchOpen, false, 'Workbench should be closed');
	const closedOverlay = docBody.querySelector('#lg-team-workbench-overlay');
	assert.equal(closedOverlay, null, 'Workbench overlay must be removed when closed');

	teamApi.stop();
});
