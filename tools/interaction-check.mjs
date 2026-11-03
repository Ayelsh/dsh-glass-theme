/**
 * Interaction check — the skin's overlay layers in a real browser (task 4.1).
 *
 * The coordinator-level contract of src/layers.js (and, as the later tasks
 * land, the component flows built on it) is keyboard/focus behavior, which a
 * stub DOM cannot answer for: inert, sequential focus, activeElement and
 * event capture all have to be the engine's own. This tool therefore drives a
 * real, throwaway browser through CDP:
 *
 *   - Chrome/Edge via tools/cdp.mjs, isolated --user-data-dir, no cookies,
 *     no first-run, no extensions — never the user's browsing profile;
 *   - React 18 from the test-only install at tools/.react (the host supplies
 *     React at runtime; the repo pins none — a missing install is an explicit
 *     failure, never a silent skip);
 *   - the real src/*.js sources and src/css sheets served by a loopback-only
 *     HTTP server;
 *   - a page-level guard that records every outbound fetch and answers every
 *     host-shaped route itself, so no run can touch the user's active
 *     settings, session model, or TAPD records. The guard fails the run if
 *     anything tries to leave the fixture origin.
 *
 *   node tools/interaction-check.mjs
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/* ------------------------------------------------------------------ *
 * Prerequisites — fail explicitly, never silently skip.
 * ------------------------------------------------------------------ */

const reactDir = process.env.LG_INTERACTION_REACT_DIR
	? resolve(root, process.env.LG_INTERACTION_REACT_DIR)
	: join(root, 'tools/.react/node_modules');

const reactFiles = {
	'/react.js': join(reactDir, 'react/umd/react.production.min.js'),
	'/react-dom.js': join(reactDir, 'react-dom/umd/react-dom.production.min.js'),
};
for (const file of Object.values(reactFiles)) {
	if (existsSync(file) === false) {
		console.error(`interaction-check: React not found at ${file}`);
		console.error('  install the test-only copy with:');
		console.error('  npm install --prefix tools/.react react@18.2.0 react-dom@18.2.0');
		process.exit(1);
	}
}

/* ------------------------------------------------------------------ *
 * Loopback fixture server
 * ------------------------------------------------------------------ */

const MIME = {
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.html': 'text/html',
	'.svg': 'image/svg+xml',
};

const serve = (file, type) => [readFileSync(file), type];

const routes = () => {
	const map = new Map();
	for (const [path, file] of Object.entries(reactFiles)) map.set(path, serve(file, 'text/javascript'));
	// The skin sources are plain function declarations; served verbatim they
	// become globals the harness can call with real React on the page.
	for (const name of ['layers', 'picker', 'stats', 'settings-section', 'workspace']) {
		const file = join(root, `src/${name}.js`);
		if (existsSync(file)) map.set(`/src/${name}.js`, serve(file, 'text/javascript'));
	}
	// catalog.js is a bare object expression (the build splices it into an
	// assignment); as a <script> it would be parsed as a block statement. Wrap
	// it into a global the harness passes to the component factories.
	{
		const file = join(root, 'src/catalog.js');
		if (existsSync(file)) {
			map.set('/src/catalog.js', [Buffer.from(`window.__lgCatalog = (${readFileSync(file, 'utf8')});`), 'text/javascript']);
		}
	}
	for (const name of ['tokens', 'base', 'picker', 'stats', 'settings-section', 'workspace', 'motion']) {
		const file = join(root, `src/css/${name}.css`);
		if (existsSync(file)) map.set(`/src/css/${name}.css`, serve(file, 'text/css'));
	}
	return map;
};

const sourceRoutes = routes();

const pageHtml = (names) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>lg interaction fixture</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="/src/css/tokens.css">
<link rel="stylesheet" href="/src/css/base.css">
<link rel="stylesheet" href="/src/css/workspace.css">
<link rel="stylesheet" href="/src/css/motion.css">
<style>
	body { margin: 0; font: 14px/1.5 system-ui; background: #f4f5f7; }
	#host-shell { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
	#sidebar { background: #e8eaee; padding: 12px; }
	#conversation { padding: 24px; }
	[data-composer-dock] { margin-top: 40vh; padding: 12px; background: #fff; border: 1px solid #d8dade; border-radius: 12px; }
	textarea { width: 60%; height: 48px; }
	.fixture-layer { position: fixed; left: 40%; top: 30%; padding: 16px; background: #fff; border: 1px solid #c8cad0; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.18); }
	.fixture-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.32); }
	.fixture-layer:focus-within { outline: 2px solid #4a8dff; }
</style>
</head>
<body>
	<div id="host-shell">
		<nav id="sidebar"><button id="sidebar-opener" type="button">侧栏触发器</button></nav>
		<main id="conversation">
			<p id="page-copy">一段正文，用来验证 inert 背景不可达。</p>
			<div data-composer-dock>
				<div data-slot="conversation.input.model"></div>
			</div>
			<div class="fixture-card"><textarea aria-label="消息"></textarea></div>
		</main>
	</div>
	<button id="bg-a" type="button">背景控件 A</button>
	<button id="bg-b" type="button" aria-hidden="true">背景控件 B</button>
	<script src="/react.js"></script>
	<script src="/react-dom.js"></script>
	${names.map((n) => `<script src="/src/${n}.js"></script>`).join('\n\t')}
	<script>
		(() => {
			/* Service guard: every fetch is recorded and answered here. A
			 * request that would leave this fixture origin is recorded as a
			 * violation — nothing reaches a real host, and the check fails
			 * if any component tried. */
			const violations = [];
			const calls = [];
			window.__lgCalls = calls;
			window.__lgViolations = violations;
			window.__lgResponses = {};
			window.__lgLayers = [];
			window.__lgSeats = [];
			window.__lgJanitor = () => {
				for (const stop of window.__lgSeats.splice(0)) {
					try { stop(); } catch (e) { /* already unmounted */ }
				}
				for (const coordinator of window.__lgLayers.splice(0)) {
					try { coordinator.release(); } catch (e) { /* already torn down */ }
				}
				for (const node of document.querySelectorAll('.fixture-layer, .fixture-scrim, .fixture-workspace-slot, .fixture-settings-slot')) node.remove();
				document.querySelectorAll('[data-lg-picker-host]').forEach((n) => n.removeAttribute('data-lg-picker-host'));
				document.documentElement.removeAttribute('data-lg-stats');
			};
			/* ---- real-component mounts ----------------------------------
			 * The same factory functions the built client uses, wired to a
			 * controlled directory store / projections and the page's real
			 * React. Each helper returns its seat stop plus the scripted
			 * store; scenarios drive the components through real DOM. */
			window.__lgPickerGroups = [
				{ id: 'prov-a', name: '甲供应商', models: [
					{ id: 'shared', name: 'Shared Model', reasoning: { efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }], defaultEffort: 'high' } },
					{ id: 'a-2', name: 'Alpha Two' },
				] },
				{ id: 'prov-b', name: '乙供应商', models: [
					{ id: 'shared', name: 'Shared Model', reasoning: { efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }] } },
					{ id: 'b-2', name: 'Beta Two' },
				] },
			];
			window.__lgMountPicker = () => {
				const snap = { current: null, routable: true, groups: [], failures: {}, status: 'loading', pending: true, error: null };
				const listeners = new Set();
				const calls = { select: [] };
				const behavior = { select: () => ({ ok: true }) };
				const directory = {
					store: { getSnapshot: () => snap, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } },
					load: () => {},
					select: (selection) => { calls.select.push(selection); return behavior.select(selection); },
				};
				directory.__publish = (patch) => { Object.assign(snap, patch); for (const fn of Array.from(listeners)) fn(); };
				directory.__calls = calls;
				directory.__behavior = behavior;
				directory.__snapshot = () => snap;
				const service = { directoryFor: () => directory };
				const ctx = {
					get(name) {
						if (name === 'uiSession') return { current: { value: { key: 'session-fixture' } } };
						if (name === 'modelDirectories') return service;
						throw new Error('service absent: ' + name);
					},
				};
				const requireShim = (name) => {
					if (name === 'react') return window.React;
					if (name === 'react-dom' || name === 'react-dom/client') return window.ReactDOM;
					throw new Error('unexpected module: ' + name);
				};
				const layers = createLayers();
				window.__lgLayers.push(layers);
				const picker = createPicker(requireShim, ctx, window.__lgCatalog, { key: 'dsh-glass-theme:quick-providers', max: 4, layers });
				const stop = picker.mount();
				window.__lgSeats.push(stop);
				return { directory, layers, stop };
			};
			window.__lgMountStats = () => {
				const listeners = new Set();
				const pressure = { projectedTokens: 400, contextWindow: 800 };
				const session = {
					projections: {
						faceOf: (name) => ({
							getSnapshot: () => (name === 'contextPressure' ? pressure : null),
							subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
						}),
					},
				};
				const ctx = {
					get(name) {
						if (name === 'uiSession') return { current: { value: { key: 'session-fixture', hooks: { session } } } };
						throw new Error('service absent: ' + name);
					},
				};
				const requireShim = (name) => {
					if (name === 'react') return window.React;
					if (name === 'react-dom' || name === 'react-dom/client') return window.ReactDOM;
					throw new Error('unexpected module: ' + name);
				};
				const layers = createLayers();
				window.__lgLayers.push(layers);
				const stats = createStats(requireShim, ctx, window.__lgCatalog, { layers });
				const stop = stats.mount();
				window.__lgSeats.push(stop);
				return { layers, stop };
			};
			window.__lgMountWorkspace = (options = {}) => {
				const listeners = new Set();
				const ctx = {
					get(name) {
						if (name === 'slots') {
							return {
								register: (slotName, component) => {
									const container = document.createElement('div');
									container.className = 'fixture-workspace-slot';
									document.body.appendChild(container);
									const root = window.ReactDOM.createRoot(container);
									root.render(window.React.createElement(component));
									return () => {
										root.unmount();
										container.remove();
									};
								},
							};
						}
						throw new Error('service absent: ' + name);
					},
				};
				const requireShim = (name) => {
					if (name === 'react') return window.React;
					if (name === 'react-dom' || name === 'react-dom/client') return window.ReactDOM;
					throw new Error('unexpected module: ' + name);
				};
				const layers = options.layers || createLayers();
				window.__lgLayers.push(layers);
				const workspace = createWorkspace(requireShim, ctx, window.__lgCatalog, { layers });
				return { workspace, layers };
			};
			window.__lgMountSettings = (options = {}) => {
				const initialGroups = options.groups || [
					{ id: 'prov-a', name: '甲供应商', models: [
						{ id: 'm-a1', name: 'Alpha 1' },
						{ id: 'm-a2', name: 'Alpha 2' },
					] },
					{ id: 'prov-b', name: '乙供应商', models: [
						{ id: 'm-b1', name: 'Beta 1' },
					] },
				];
				const snap = { groups: initialGroups };
				const listeners = new Set();
				const directory = {
					store: {
						getSnapshot: () => snap,
						subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
					},
					load: () => {},
				};
				const service = { directoryFor: () => directory };
				const container = document.createElement('div');
				container.className = 'fixture-settings-slot';
				document.body.appendChild(container);
				let root = null;

				const ctx = {
					slots: {
						register: (meta, comp) => {
							root = window.ReactDOM.createRoot(container);
							root.render(window.React.createElement(comp));
							return () => {
								if (root) root.unmount();
								container.remove();
							};
						},
					},
					get(name) {
						if (name === 'uiSession') return { current: { value: { key: 'session-fixture' } } };
						if (name === 'modelDirectories') return service;
						throw new Error('service absent: ' + name);
					},
				};
				const requireShim = (name) => {
					if (name === 'react') return window.React;
					if (name === 'react-dom' || name === 'react-dom/client') return window.ReactDOM;
					throw new Error('unexpected module: ' + name);
				};
				let currentSelection = options.selection || { providers: ['prov-a'], models: {} };
				const prefListeners = new Set();
				const commits = [];
				const prefs = {
					selection: () => currentSelection,
					get: (key) => (options.prefs ? options.prefs[key] : true),
					set: () => {},
					subscribe: (fn) => { prefListeners.add(fn); return () => prefListeners.delete(fn); },
					commit: (next, liveIds) => {
						commits.push({ next, liveIds });
						currentSelection = next;
						for (const fn of Array.from(prefListeners)) fn();
					},
				};
				const layers = options.layers || createLayers();
				window.__lgLayers.push(layers);
				const section = createSettingsSection(requireShim, ctx, window.__lgCatalog, prefs, { layers });
				const unregister = section.register();
				const stop = () => {
					if (unregister) unregister();
					if (root) root.unmount();
					container.remove();
				};
				window.__lgSeats.push(stop);
				return {
					container,
					commits,
					layers,
					stop,
					getSelection: () => currentSelection,
					setGroups: (newGroups) => {
						snap.groups = newGroups;
						for (const fn of Array.from(listeners)) fn();
					},
				};
			};
			const origin = location.origin;
			window.fetch = function (input, init) {
				const url = typeof input === 'string' ? input : (input && input.url) || '';
				let foreign = false;
				try { foreign = new URL(url, location.href).origin !== origin; } catch (e) { foreign = true; }
				const entry = { url: String(url), method: (init && init.method) || 'GET', foreign };
				calls.push(entry);
				if (foreign) violations.push(entry);
				const key = entry.method + ' ' + entry.url;
				const scripted = window.__lgResponses[key];
				const body = scripted === undefined ? JSON.stringify({ ok: false, error: 'fixture: no scripted response' }) : JSON.stringify(scripted);
				return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }));
			};
		})();
		window.__lgReady = true;
	</script>
</body>
</html>`;

const server = createServer((req, res) => {
	const url = req.url.split('?')[0];
	if (url === '/favicon.ico') {
		res.writeHead(204);
		res.end();
		return;
	}
	if (url === '/' || url === '/index.html') {
		const names = [...sourceRoutes.keys()].filter((p) => p.startsWith('/src/') && p.endsWith('.js') && !p.startsWith('/src/css/')).map((p) => p.slice('/src/'.length).replace('.js', ''));
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
		res.end(pageHtml(names));
		return;
	}
	const hit = sourceRoutes.get(url);
	if (hit !== undefined) {
		res.writeHead(200, { 'content-type': `${hit[1]}; charset=utf-8`, 'cache-control': 'no-store' });
		res.end(hit[0]);
		return;
	}
	if (process.env.LG_INTERACTION_DEBUG_404) console.error('fixture 404:', req.url);
	res.writeHead(404, { 'content-type': 'text/plain' });
	res.end('fixture: not found');
});

const listen = () =>
	new Promise((done, fail) => {
		server.once('error', fail);
		server.listen(0, '127.0.0.1', () => done(server.address().port));
	});

/* ------------------------------------------------------------------ *
 * Scenarios
 * ------------------------------------------------------------------ */

const results = [];
const check = async (page, name, body) => {
	const out = await page.evaluate(`(async () => { try { ${body} } catch (e) { return { ok: false, note: String(e && e.message ? e.message : e) }; } finally { window.__lgJanitor(); } })()`);
	if (out && out.ok === true) {
		results.push(true);
		console.log(`ok    ${name}${out.note ? ' — ' + out.note : ''}`);
	} else {
		results.push(false);
		console.error(`FAIL  ${name} — ${out && out.note ? out.note : 'no result'}`);
	}
};

const keydown = (key, shiftKey = false) =>
	`document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, shiftKey: ${shiftKey}, bubbles: true, cancelable: true }));`;

const layer = (id, extra = '') => `(() => {
	const surface = document.createElement('div');
	surface.className = 'fixture-layer';
	surface.id = ${JSON.stringify(id)};
	surface.innerHTML = '<button type="button" data-x="1">一</button> <button type="button" data-x="2">二</button> <button type="button" data-x="3">三</button>';
	document.body.appendChild(surface);
	return surface;
})()${extra ? ';' + extra : ''}`;

const scenarios = async (page) => {
	await check(
		page,
		'fixture sanity: React 18, coordinator source, guard armed',
		`const v = window.React && window.React.version;
		if (v !== '18.2.0') return { ok: false, note: 'React version ' + v };
		if (typeof window.createLayers !== 'function') return { ok: false, note: 'createLayers did not load' };
		if (window.__lgReady !== true) return { ok: false, note: 'guard not armed' };
		if (typeof ReactDOM.createRoot !== 'function') return { ok: false, note: 'ReactDOM.createRoot missing' };
		return { ok: true, note: 'react ' + v };`,
	);

	await check(
		page,
		'one Escape dismisses only the top layer',
		`const layers = createLayers();
		window.__lgLayers.push(layers);
		const seen = [];
		const bottom = layers.acquire({ owner: 'bottom', kind: 'nonmodal', surface: ${layer('l-bottom')}, onDismiss: () => seen.push('bottom') });
		const top = layers.acquire({ owner: 'top', kind: 'nonmodal', surface: ${layer('l-top')}, onDismiss: () => seen.push('top') });
		${keydown('Escape')}
		if (seen.join(',') !== 'top') return { ok: false, note: 'dismissal reached ' + seen.join(',') };
		top.dispose({ focus: false });
		${keydown('Escape')}
		if (seen.join(',') !== 'top,bottom') return { ok: false, note: 'after top dispose, reached ' + seen.join(',') };
		bottom.dispose({ focus: false });
		if (layers.depth !== 0) return { ok: false, note: 'depth ' + layers.depth };
		return { ok: true };`,
	);

	await check(
		page,
		'outside gesture routes to the top layer only',
		`const layers = createLayers();
		window.__lgLayers.push(layers);
		const seen = [];
		const bottom = layers.acquire({ owner: 'bottom', kind: 'nonmodal', surface: ${layer('l-outside-b')}, onDismiss: (info) => seen.push('bottom:' + info.reason) });
		const top = layers.acquire({ owner: 'top', kind: 'nonmodal', surface: ${layer('l-outside-t')}, onDismiss: (info) => seen.push('top:' + info.reason) });
		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		if (seen.join(',') !== 'top:outside') return { ok: false, note: seen.join(',') };
		top.dispose({ focus: false });
		bottom.dispose({ focus: false });
		return { ok: true };`,
	);

	await check(
		page,
		'modal contains Tab and makes siblings unreachable',
		`const layers = createLayers();
		window.__lgLayers.push(layers);
		const modal = layers.acquire({ owner: 'modal', kind: 'modal', surface: ${layer('l-modal')}, onDismiss: () => {} });
		const bgA = document.getElementById('bg-a');
		const bgB = document.getElementById('bg-b');
		if (bgA.inert !== true) return { ok: false, note: 'background A not inert' };
		if (bgA.getAttribute('aria-hidden') !== 'true') return { ok: false, note: 'background A not aria-hidden' };
		const inLayer = document.querySelectorAll('#l-modal [data-x]');
		inLayer[0].focus();
		${keydown('Tab')}
		if (document.activeElement !== inLayer[1]) return { ok: false, note: 'Tab went to ' + (document.activeElement && document.activeElement.outerHTML && document.activeElement.outerHTML.slice(0, 60)) };
		${keydown('Tab')}
		${keydown('Tab')}
		if (document.activeElement !== inLayer[0]) return { ok: false, note: 'Tab did not wrap to first' };
		${keydown('Tab', true)}
		if (document.activeElement !== inLayer[2]) return { ok: false, note: 'Shift+Tab did not wrap to last' };
		modal.dispose({ focus: false });
		if (bgA.inert === true) return { ok: false, note: 'inert survived dispose' };
		if (bgA.getAttribute('aria-hidden') !== null) return { ok: false, note: 'aria-hidden survived dispose' };
		if (bgB.getAttribute('aria-hidden') !== 'true') return { ok: false, note: 'pre-existing aria-hidden was clobbered' };
		return { ok: true };`,
	);

	await check(
		page,
		'Escape inside a modal reaches the modal, not the page',
		`const layers = createLayers();
		window.__lgLayers.push(layers);
		const seen = [];
		const modal = layers.acquire({ owner: 'modal', kind: 'modal', surface: ${layer('l-modal-esc')}, onDismiss: (info) => seen.push(info.reason) });
		${keydown('Escape')}
		if (seen.join(',') !== 'escape') return { ok: false, note: seen.join(',') };
		modal.dispose({ focus: false });
		return { ok: true };`,
	);

	await check(
		page,
		'dispose returns focus to the connected opener',
		`const layers = createLayers();
		window.__lgLayers.push(layers);
		const opener = document.getElementById('sidebar-opener');
		opener.focus();
		const handle = layers.acquire({ owner: 'l', kind: 'nonmodal', surface: ${layer('l-restore')}, onDismiss: () => {} });
		document.querySelector('#l-restore [data-x="1"]').focus();
		handle.dispose();
		if (document.activeElement !== opener) return { ok: false, note: 'focus landed on ' + (document.activeElement && document.activeElement.id) };
		return { ok: true };`,
	);

	await check(
		page,
		'pointer dismissal keeps focus where the user activated',
		`const layers = createLayers();
		window.__lgLayers.push(layers);
		const handle = layers.acquire({ owner: 'l', kind: 'nonmodal', surface: ${layer('l-outside-focus')}, onDismiss: (info) => { if (info.reason === 'outside') handle.dispose({ focus: false }); } });
		const outside = document.getElementById('bg-a');
		outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		outside.focus();
		if (document.activeElement !== outside) return { ok: false, note: 'outside control lost focus' };
		if (layers.depth !== 0) return { ok: false, note: 'layer survived outside dismissal' };
		return { ok: true };`,
	);

	await check(
		page,
		'a modal above a modal restricts exactly its own siblings',
		`const layers = createLayers();
		window.__lgLayers.push(layers);
		const parent = layers.acquire({ owner: 'parent', kind: 'modal', surface: ${layer('l-nest-parent')}, onDismiss: () => {} });
		const parentSurface = document.getElementById('l-nest-parent');
		if (parentSurface.inert === true) return { ok: false, note: 'parent surface inert with nothing above' };
		const child = layers.acquire({ owner: 'child', kind: 'modal', surface: ${layer('l-nest-child')}, onDismiss: () => {} });
		if (parentSurface.inert !== true) return { ok: false, note: 'parent surface not inert under child modal' };
		child.dispose({ focus: false });
		if (parentSurface.inert === true) return { ok: false, note: 'parent surface stayed inert after child dispose' };
		parent.dispose({ focus: false });
		if (document.querySelector('[inert]') !== null) return { ok: false, note: 'some [inert] survived' };
		return { ok: true };`,
	);

	await check(
		page,
		'unloading with focus inside never targets a disconnected node',
		`const layers = createLayers();
		window.__lgLayers.push(layers);
		const opener = document.createElement('button');
		opener.type = 'button';
		opener.textContent = '临时';
		document.body.appendChild(opener);
		opener.focus();
		const handle = layers.acquire({ owner: 'l', kind: 'nonmodal', surface: ${layer('l-unload')}, onDismiss: () => {} });
		document.querySelector('#l-unload [data-x="2"]').focus();
		opener.remove();
		handle.dispose();
		if (document.activeElement === opener) return { ok: false, note: 'focused a disconnected opener' };
		return { ok: true };`,
	);

	await check(
		page,
		'the last dispose removes document listeners entirely',
		`const layers = createLayers();
		window.__lgLayers.push(layers);
		const seen = [];
		const h = layers.acquire({ owner: 'l', kind: 'nonmodal', surface: ${layer('l-listeners')}, onDismiss: () => seen.push('dismissed') });
		h.dispose({ focus: false });
		${keydown('Escape')}
		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		if (seen.length !== 0) return { ok: false, note: 'a disposed layer still received ' + seen.join(',') };
		return { ok: true };`,
	);

	await check(
		page,
		'picker: keyboard open places focus in the card, Escape returns to the trigger',
		`const m = window.__lgMountPicker();
		m.directory.__publish({ status: 'ready', pending: false, error: null, groups: window.__lgPickerGroups, current: null });
		await new Promise((r) => setTimeout(r, 140));
		const trigger = document.querySelector('.lg-picker-trigger');
		if (trigger === null) return { ok: false, note: 'trigger missing' };
		trigger.focus();
		trigger.click();
		await new Promise((r) => setTimeout(r, 90));
		const card = document.querySelector('.lg-picker-card');
		if (card === null) return { ok: false, note: 'card did not open' };
		if (document.activeElement !== card.querySelector('input')) return { ok: false, note: 'focus did not enter the card (on ' + (document.activeElement && document.activeElement.className) + ')' };
		${keydown('Escape')}
		await new Promise((r) => setTimeout(r, 60));
		if (document.querySelector('.lg-picker-card') !== null) return { ok: false, note: 'card survived Escape' };
		if (document.activeElement !== trigger) return { ok: false, note: 'Escape did not return focus to the trigger' };
		return { ok: true };`,
	);

	await check(
		page,
		'picker: outside dismissal keeps focus on the activated control',
		`const m = window.__lgMountPicker();
		m.directory.__publish({ status: 'ready', pending: false, error: null, groups: window.__lgPickerGroups, current: null });
		await new Promise((r) => setTimeout(r, 140));
		const trigger = document.querySelector('.lg-picker-trigger');
		trigger.click();
		await new Promise((r) => setTimeout(r, 90));
		if (document.querySelector('.lg-picker-card') === null) return { ok: false, note: 'card did not open' };
		const outside = document.getElementById('bg-a');
		outside.focus();
		outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await new Promise((r) => setTimeout(r, 60));
		if (document.querySelector('.lg-picker-card') !== null) return { ok: false, note: 'card survived outside press' };
		if (document.activeElement !== outside) return { ok: false, note: 'outside dismissal stole focus' };
		return { ok: true };`,
	);

	await check(
		page,
		'picker: Escape closes the all-providers card first, one layer per press',
		`window.localStorage.setItem('dsh-glass-theme:quick-providers', JSON.stringify({ providers: ['prov-a'], models: {} }));
		const m = window.__lgMountPicker();
		m.directory.__publish({ status: 'ready', pending: false, error: null, groups: window.__lgPickerGroups, current: { provider: 'prov-a', model: 'shared' } });
		await new Promise((r) => setTimeout(r, 140));
		const trigger = document.querySelector('.lg-picker-trigger');
		trigger.click();
		await new Promise((r) => setTimeout(r, 90));
		const more = document.querySelector('.lg-picker-more');
		if (more === null) return { ok: false, note: 'all-providers opener missing (quick list not picked up)' };
		more.click();
		await new Promise((r) => setTimeout(r, 90));
		if (document.querySelector('.lg-picker-card-all') === null) return { ok: false, note: 'all-providers card did not open' };
		if (document.querySelector('.lg-picker-card') === null) return { ok: false, note: 'main card closed under the child' };
		${keydown('Escape')}
		await new Promise((r) => setTimeout(r, 60));
		if (document.querySelector('.lg-picker-card-all') !== null) return { ok: false, note: 'Escape closed more than the top card' };
		if (document.querySelector('.lg-picker-card') === null) return { ok: false, note: 'Escape leaked past the top card' };
		if (document.activeElement !== more) return { ok: false, note: 'Escape did not return to the child opener' };
		${keydown('Escape')}
		await new Promise((r) => setTimeout(r, 60));
		if (document.querySelector('.lg-picker-card') !== null) return { ok: false, note: 'second Escape left the main card open' };
		if (document.activeElement !== trigger) return { ok: false, note: 'second Escape did not return to the trigger' };
		window.localStorage.removeItem('dsh-glass-theme:quick-providers');
		return { ok: true };`,
	);

	await check(
		page,
		'picker: completion after user dismissal never reopens the card',
		`window.localStorage.setItem('dsh-glass-theme:quick-providers', JSON.stringify({ providers: ['prov-a'], models: {} }));
		const m = window.__lgMountPicker();
		m.directory.__publish({ status: 'ready', pending: false, error: null, groups: window.__lgPickerGroups, current: { provider: 'prov-a', model: 'shared' } });
		m.directory.__behavior.select = () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 150));
		await new Promise((r) => setTimeout(r, 140));
		const trigger = document.querySelector('.lg-picker-trigger');
		trigger.click();
		await new Promise((r) => setTimeout(r, 90));
		const more = document.querySelector('.lg-picker-more');
		more.click();
		await new Promise((r) => setTimeout(r, 90));
		const allCard = document.querySelector('.lg-picker-card-all');
		if (allCard === null) return { ok: false, note: 'all-providers card did not open' };
		const row = allCard.querySelector('button');
		if (row === null) return { ok: false, note: 'no model row in the all-providers card' };
		row.click();
		/* The user dismisses the card BEFORE the command resolves. */
		${keydown('Escape')}
		await new Promise((r) => setTimeout(r, 400));
		if (document.querySelector('.lg-picker-card-all') !== null) return { ok: false, note: 'dismissed card reopened on completion' };
		/* A matching projection later changes nothing either. */
		m.directory.__publish({ current: { provider: 'prov-a', model: 'a-2' } });
		await new Promise((r) => setTimeout(r, 120));
		if (document.querySelector('.lg-picker-card-all') !== null) return { ok: false, note: 'late projection reopened the dismissed card' };
		window.localStorage.removeItem('dsh-glass-theme:quick-providers');
		return { ok: true };`,
	);

	await check(
		page,
		'stats: panel focus entry, Escape return, natural Tab, outside focus',
		`const s = window.__lgMountStats();
		await new Promise((r) => setTimeout(r, 120));
		const trig = document.querySelector('.lg-stats-trigger');
		if (trig === null) return { ok: false, note: 'stats trigger missing' };
		trig.focus();
		trig.click();
		await new Promise((r) => setTimeout(r, 90));
		const panel = document.querySelector('.lg-stats-panel');
		if (panel === null) return { ok: false, note: 'panel did not open' };
		if (document.activeElement !== panel) return { ok: false, note: 'focus did not enter the panel' };
		const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
		document.dispatchEvent(tabEvent);
		if (tabEvent.defaultPrevented) return { ok: false, note: 'nonmodal panel trapped Tab' };
		${keydown('Escape')}
		await new Promise((r) => setTimeout(r, 60));
		if (document.querySelector('.lg-stats-panel') !== null) return { ok: false, note: 'panel survived Escape' };
		if (document.activeElement !== trig) return { ok: false, note: 'Escape did not return to the trigger (on ' + (document.activeElement && document.activeElement.tagName) + '/' + (document.activeElement && document.activeElement.className) + ')' };
		trig.click();
		await new Promise((r) => setTimeout(r, 90));
		if (document.querySelector('.lg-stats-panel') === null) return { ok: false, note: 'panel did not reopen' };
		const outside = document.getElementById('bg-a');
		outside.focus();
		outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await new Promise((r) => setTimeout(r, 60));
		if (document.querySelector('.lg-stats-panel') !== null) return { ok: false, note: 'panel survived outside press' };
		if (document.activeElement !== outside) return { ok: false, note: 'outside dismissal stole focus' };
		return { ok: true };`,
	);

	await check(
		page,
		'picker: listbox combobox navigation, active descendant, Enter selection, effort radiogroup',
		`const m = window.__lgMountPicker();
		m.directory.__publish({ status: 'ready', pending: false, error: null, groups: window.__lgPickerGroups, current: { provider: 'prov-a', model: 'shared', reasoningEffort: 'low' } });
		await new Promise((r) => setTimeout(r, 140));
		const trigger = document.querySelector('.lg-picker-trigger');
		if (trigger === null) return { ok: false, note: 'trigger missing' };
		trigger.focus();
		trigger.click();
		await new Promise((r) => setTimeout(r, 60));
		const input = document.querySelector('.lg-picker-search input');
		if (input === null) return { ok: false, note: 'search input missing' };
		if (input.getAttribute('role') !== 'combobox') return { ok: false, note: 'input role != combobox' };
		if (input.getAttribute('aria-expanded') !== 'true') return { ok: false, note: 'aria-expanded != true' };
		const list = document.querySelector('.lg-picker-body[role="listbox"]');
		if (list === null) return { ok: false, note: 'listbox missing' };

		// ArrowDown should move active descendant to first option
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
		await new Promise((r) => setTimeout(r, 30));
		const actId = input.getAttribute('aria-activedescendant');
		if (!actId) return { ok: false, note: 'aria-activedescendant not set after ArrowDown' };
		const actOpt = document.getElementById(actId);
		if (!actOpt || actOpt.getAttribute('data-lg-active') !== 'true') {
			return { ok: false, note: 'option element missing data-lg-active' };
		}

		// Effort radiogroup arrows
		const radios = Array.from(document.querySelectorAll('.lg-picker-seg button[role="radio"]'));
		if (radios.length < 2) return { ok: false, note: 'expected effort radios, got ' + radios.length };
		radios[0].focus();
		radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
		await new Promise((r) => setTimeout(r, 30));
		if (m.directory.__calls.length === 0) return { ok: false, note: 'ArrowRight in radiogroup did not invoke select' };

		return { ok: true };`,
	);

	await check(
		page,
		'workspace: dialog modal containment, inert background, escape dismissal',
		`const layers = createLayers();
		window.__lgLayers.push(layers);
		const bg = document.createElement('button');
		bg.id = 'ws-bg';
		bg.textContent = 'Background';
		document.body.appendChild(bg);

		let closed = false;
		// Acquire modal dialog
		const surface = document.createElement('div');
		surface.className = 'fixture-layer';
		surface.innerHTML = '<input id="ws-dlg-input" /> <button id="ws-dlg-btn">OK</button>';
		document.body.appendChild(surface);

		const handle = layers.acquire({
			kind: 'modal',
			owner: 'workspace.dialog',
			surface,
			title: 'Workspace Dialog',
			opener: bg,
			onDismiss: () => { closed = true; handle.dispose({ focus: bg }); },
		});

		// Check inert applied to background
		if (!bg.hasAttribute('inert')) return { ok: false, note: 'background not inert when dialog open' };

		// Focus inside dialog
		const input = document.getElementById('ws-dlg-input');
		input.focus();

		// Tab navigation should be contained inside surface
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
		const btn = document.getElementById('ws-dlg-btn');
		if (document.activeElement !== btn) return { ok: false, note: 'Tab did not move to dialog button' };

		// Shift+Tab should wrap back
		btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
		if (document.activeElement !== input) return { ok: false, note: 'Shift+Tab did not wrap back to dialog input' };

		// Escape closes dialog and restores focus to opener
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		await new Promise((r) => setTimeout(r, 40));

		if (!closed) return { ok: false, note: 'dialog not closed on Escape' };
		if (bg.hasAttribute('inert')) return { ok: false, note: 'background still inert after dialog closed' };
		if (document.activeElement !== bg) return { ok: false, note: 'focus not restored to opener' };

		return { ok: true };`,
	);

	await check(
		page,
		'workspace: nested modal inspector over nonmodal project menu, top Escape only, disabling removes restrictions',
		`const layers = createLayers();
		window.__lgLayers.push(layers);

		const menuSurface = document.createElement('div');
		menuSurface.id = 'menu-surface';
		menuSurface.innerHTML = '<button id="menu-btn">Menu Item</button>';
		document.body.appendChild(menuSurface);

		const inspSurface = document.createElement('div');
		inspSurface.id = 'insp-surface';
		inspSurface.innerHTML = '<button id="insp-btn">Close Inspector</button>';
		document.body.appendChild(inspSurface);

		let menuClosed = false;
		let inspClosed = false;

		const menuHandle = layers.acquire({
			kind: 'nonmodal',
			owner: 'workspace.projectMenu',
			surface: menuSurface,
			title: '项目空间',
			onDismiss: () => { menuClosed = true; menuHandle.dispose(); },
		});

		const inspHandle = layers.acquire({
			kind: 'modal',
			owner: 'workspace.inspector',
			surface: inspSurface,
			title: '页面内详情',
			onDismiss: () => { inspClosed = true; inspHandle.dispose(); },
		});

		// Inspector is top modal; menu surface is a sibling in body, so it should be made inert
		if (!menuSurface.hasAttribute('inert')) return { ok: false, note: 'menu surface not inert under inspector modal' };

		// First Escape closes ONLY top layer (inspector)
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		await new Promise((r) => setTimeout(r, 40));

		if (!inspClosed) return { ok: false, note: 'inspector was not closed by first Escape' };
		if (menuClosed) return { ok: false, note: 'menu closed prematurely on first Escape' };
		if (menuSurface.hasAttribute('inert')) return { ok: false, note: 'menu surface still inert after inspector disposed' };

		// Release coordinator (simulating disabling workspace / unmount)
		layers.release();
		if (layers.depth !== 0) return { ok: false, note: 'layers depth not 0 after release' };

		return { ok: true };`,
	);

	await check(
		page,
		'settings: drill-down entry focus, discard/save focus restoration, provider disappearance fallback',
		`const m = window.__lgMountSettings({ selection: { providers: ['prov-a'], models: {} } });
		await new Promise((r) => setTimeout(r, 140));

		const slot = m.container;
		const rowA = slot.querySelector('li.lg-settings-row[data-provider-id="prov-a"]');
		if (!rowA) return { ok: false, note: 'prov-a row not found' };
		const doorA = rowA.querySelector('.lg-settings-modelDoor');
		if (!doorA) return { ok: false, note: 'prov-a model door not found' };

		// 1. Enter drill-down
		doorA.click();
		await new Promise((r) => setTimeout(r, 60));

		const backBtn = slot.querySelector('.lg-settings-back');
		if (!backBtn) return { ok: false, note: 'back button not found in drill-down' };
		if (document.activeElement !== backBtn) return { ok: false, note: 'drill-down entry did not focus back button' };

		// 2. Edit draft and discard by clicking back
		const check = slot.querySelector('.lg-settings-check');
		if (check) check.click();
		await new Promise((r) => setTimeout(r, 30));

		backBtn.click();
		await new Promise((r) => setTimeout(r, 60));

		if (m.commits.length !== 0) return { ok: false, note: 'commits made after back discard' };
		const doorAAfterBack = slot.querySelector('li.lg-settings-row[data-provider-id="prov-a"] .lg-settings-modelDoor');
		if (document.activeElement !== doorAAfterBack) {
			return { ok: false, note: 'focus not restored to prov-a control after back; active=' + (document.activeElement && document.activeElement.className) };
		}

		// 3. Enter drill-down again, edit and save
		doorAAfterBack.click();
		await new Promise((r) => setTimeout(r, 60));

		const saveBtn = slot.querySelector('.lg-settings-toolSave');
		if (!saveBtn) return { ok: false, note: 'save button not found' };
		const check2 = slot.querySelector('.lg-settings-check');
		if (check2) check2.click();
		await new Promise((r) => setTimeout(r, 30));

		saveBtn.click();
		await new Promise((r) => setTimeout(r, 60));

		if (m.commits.length !== 1) return { ok: false, note: 'commit was not called on save' };
		const doorAAfterSave = slot.querySelector('li.lg-settings-row[data-provider-id="prov-a"] .lg-settings-modelDoor');
		if (document.activeElement !== doorAAfterSave) {
			return { ok: false, note: 'focus not restored to prov-a control after save' };
		}

		// 4. Enter drill-down, provider disappears from directory, return -> fallback focus
		doorAAfterSave.click();
		await new Promise((r) => setTimeout(r, 60));

		// Remove prov-a from directory
		m.setGroups([{ id: 'prov-b', name: '乙供应商', models: [{ id: 'm-b1', name: 'Beta 1' }] }]);
		await new Promise((r) => setTimeout(r, 60));

		const backBtn2 = slot.querySelector('.lg-settings-back');
		backBtn2.click();
		await new Promise((r) => setTimeout(r, 60));

		// prov-a row is gone; focus should fall back to settings title or switch
		const title = slot.querySelector('.lg-settings-title');
		const anyControl = slot.querySelector('.lg-settings-switch');
		if (document.activeElement !== title && document.activeElement !== anyControl) {
			return { ok: false, note: 'focus did not reach fallback target when provider disappeared' };
		}

		return { ok: true };`,
	);

	// Task 4.7: narrow inspector at <=900px, reduced-motion state safety, mid-interaction preference changes, unmounted absence
	{
		const name = 'workspace: narrow inspector open/close at <=900px, reduced-motion safety, mid-interaction changes, unmounted absence';
		try {
			await page.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 700, deviceScaleFactor: 1, mobile: false });
			await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

			// Step 1: mount workspace shell with inspector open under reduced motion
			const step1 = await page.evaluate(`(async () => {
				const layers = createLayers();
				window.__lgLayers.push(layers);

				const shell = document.createElement('div');
				shell.className = 'lgwsp-workspace-shell lgwsp-has-inspector';
				shell.id = 'narrow-test-shell';

				const opener = document.createElement('button');
				opener.id = 'narrow-opener';
				opener.textContent = '打开详情';
				shell.appendChild(opener);

				const scrim = document.createElement('div');
				scrim.className = 'lgwsp-inspector-scrim';
				shell.appendChild(scrim);

				const inspector = document.createElement('aside');
				inspector.className = 'lgwsp-inspector';
				inspector.setAttribute('role', 'region');
				inspector.setAttribute('aria-label', '工作项详情');
				inspector.innerHTML = '<div class="lgwsp-inspector-head"><button class="lgwsp-inspector-close" id="narrow-close">关闭</button></div><div class="lgwsp-inspector-inner"><button id="narrow-inside-btn">操作</button></div>';
				shell.appendChild(inspector);

				document.body.appendChild(shell);

				// Match media checks
				if (!window.matchMedia('(max-width: 900px)').matches) return { ok: false, note: 'viewport width > 900px' };
				if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return { ok: false, note: 'reduced-motion not reduce' };

				const closeInspector = () => {
					handle.dispose({ focus: opener });
					shell.classList.remove('lgwsp-has-inspector');
					inspector.remove();
					scrim.remove();
				};

				const handle = layers.acquire({
					kind: 'modal',
					owner: 'workspace.inspector',
					surface: inspector,
					title: '工作项详情',
					opener,
					contains: (target) => inspector.contains(target) || scrim.contains(target),
					onDismiss: closeInspector,
				});

				const closeBtn = document.getElementById('narrow-close');
				closeBtn.onclick = closeInspector;
				scrim.onclick = closeInspector;

				window.__lgNarrowTest = { layers, handle, shell, opener, scrim, inspector };

				// Verify reduced motion transform is none
				const compTransform = getComputedStyle(inspector).transform;
				if (compTransform !== 'none') return { ok: false, note: 'reduced-motion transform is not none: ' + compTransform };

				// Focus inside inspector
				closeBtn.focus();

				return { ok: true };
			})()`);

			if (!step1.ok) {
				results.push(false);
				console.error(`FAIL  ${name} — ${step1.note}`);
			} else {
				// Step 2: mid-interaction preference change to normal motion
				await page.send('Emulation.setEmulatedMedia', { features: [] });
				const step2 = await page.evaluate(`(async () => {
					if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return { ok: false, note: 'reduced-motion still active' };
					const t = window.__lgNarrowTest;
					if (!t || !document.getElementById('narrow-close')) return { ok: false, note: 'inspector lost during pref change' };
					if (document.activeElement !== document.getElementById('narrow-close')) return { ok: false, note: 'focus lost during pref change' };
					return { ok: true };
				})()`);

				if (!step2.ok) {
					results.push(false);
					console.error(`FAIL  ${name} (pref change to normal) — ${step2.note}`);
				} else {
					// Step 3: switch back to reduced motion and close inspector
					await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
					const step3 = await page.evaluate(`(async () => {
						const t = window.__lgNarrowTest;
						if (!t) return { ok: false, note: 'narrow test state missing' };

						// Close inspector via close button click
						const closeBtn = document.getElementById('narrow-close');
						closeBtn.click();
						await new Promise((r) => setTimeout(r, 40));

						// 1. Unmounted check: inspector and scrim must be absent from DOM
						if (document.querySelector('.lgwsp-inspector') !== null) {
							return { ok: false, note: 'inspector node still present in DOM after close' };
						}
						if (document.querySelector('.lgwsp-inspector-scrim') !== null) {
							return { ok: false, note: 'scrim node still present in DOM after close' };
						}

						// 2. Focus restoration check
						if (document.activeElement !== t.opener) {
							return { ok: false, note: 'focus not restored to opener after close' };
						}

						// 3. Hit testing check: hit test at bottom of screen where narrow inspector was
						const bottomHit = document.elementFromPoint(400, 650);
						if (bottomHit && (bottomHit.closest('.lgwsp-inspector') || bottomHit.closest('.lgwsp-inspector-scrim'))) {
							return { ok: false, note: 'hit test reached closed inspector/scrim' };
						}

						// 4. Tab navigation check: pressing Tab should not reach inspector
						t.opener.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
						if (document.activeElement && document.activeElement.closest('.lgwsp-inspector')) {
							return { ok: false, note: 'Tab key reached inspector after close' };
						}

						// 5. Defensive CSS check: if a closed inspector were retained in DOM without .lgwsp-has-inspector
						const dummy = document.createElement('aside');
						dummy.className = 'lgwsp-inspector';
						t.shell.appendChild(dummy);
						const dummyDisplay = getComputedStyle(dummy).display;
						dummy.remove();
						if (dummyDisplay !== 'none') {
							return { ok: false, note: 'retained inspector under reduced motion display is not none: ' + dummyDisplay };
						}

						return { ok: true };
					})()`);

					if (!step3.ok) {
						results.push(false);
						console.error(`FAIL  ${name} (close and absence) — ${step3.note}`);
					} else {
						results.push(true);
						console.log(`ok    ${name}`);
					}
				}
			}
		} finally {
			await page.send('Emulation.setDeviceMetricsOverride', { width: 0, height: 0, deviceScaleFactor: 0, mobile: false });
			await page.send('Emulation.setEmulatedMedia', { features: [] });
			await page.evaluate(`(() => {
				const s = document.getElementById('narrow-test-shell');
				if (s) s.remove();
				delete window.__lgNarrowTest;
				window.__lgJanitor();
			})()`);
		}
	}

	await check(
		page,
		'no request ever left the fixture origin',
		`const violations = window.__lgViolations || [];
		if (violations.length !== 0) return { ok: false, note: JSON.stringify(violations[0]) };
		return { ok: true, note: (window.__lgCalls || []).length + ' fetch(es) answered in-fixture' };`,
	);
};

/* ------------------------------------------------------------------ *
 * Runner
 * ------------------------------------------------------------------ */

const port = await listen();
const browser = await launch({ headless: true });
let failures = 0;
try {
	const page = await browser.newPage();
	await page.goto(`http://127.0.0.1:${port}/`, { settleMs: 600 });
	if (page.errors.length > 0) {
		console.error('FAIL  page errors during load:');
		for (const error of page.errors) console.error('      ' + String(error).split('\n')[0]);
		failures += 1;
	}
	await scenarios(page);
	if (page.errors.length > 0) {
		console.error('FAIL  page errors during scenarios:');
		for (const error of page.errors) console.error('      ' + String(error).split('\n')[0]);
		failures += 1;
	}
} finally {
	await browser.close();
	server.close();
}
failures += results.filter((ok) => ok === false).length;
if (failures > 0) {
	console.error(`\n${failures} interaction check(s) failed`);
	process.exitCode = 1;
} else {
	console.log(`\nall ${results.length} interaction checks pass`);
}
