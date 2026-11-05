/**
 * Presentation check — typography minimums, composited contrast, restrained
 * settings decoration, and display preferences across themes and viewports (tasks 5.4 & 5.5).
 *
 * Runs against an isolated browser fixture through tools/cdp.mjs:
 *   - React 18 from tools/.react
 *   - Real src/ stylesheets and components
 *   - Composited contrast ratio calculations (WCAG relative luminance)
 *   - Typography role size and line height verification (>= 12px / >= 17px)
 *   - Restrained settings enabled rows & ambient/grain/shadow verification
 *   - Display preferences (reduced motion, reduced transparency, increased contrast)
 *   - Visual matrix screenshots and report data for docs/PRESENTATION-QA.md
 *
 * Usage:
 *   node tools/presentation-check.mjs
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(root, 'out/presentation-qa');
mkdirSync(outDir, { recursive: true });

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
		console.error(`presentation-check: React not found at ${file}`);
		console.error('  install the test-only copy with:');
		console.error('  npm install --prefix tools/.react react@18.2.0 react-dom@18.2.0');
		process.exit(1);
	}
}

/* ------------------------------------------------------------------ *
 * Loopback fixture server
 * ------------------------------------------------------------------ */

const serve = (file, type) => [readFileSync(file), type];

const routes = () => {
	const map = new Map();
	for (const [path, file] of Object.entries(reactFiles)) map.set(path, serve(file, 'text/javascript'));
	for (const name of ['layers', 'picker', 'stats', 'settings-section', 'workspace']) {
		const file = join(root, `src/${name}.js`);
		if (existsSync(file)) map.set(`/src/${name}.js`, serve(file, 'text/javascript'));
	}
	{
		const file = join(root, 'src/catalog.js');
		if (existsSync(file)) {
			const wrapped = Buffer.from(`window.__lgCatalog = (${readFileSync(file, 'utf8')});`, 'utf8');
			map.set('/src/catalog.js', [wrapped, 'text/javascript']);
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
<title>lg presentation fixture</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="/src/css/tokens.css">
<link rel="stylesheet" href="/src/css/base.css">
<link rel="stylesheet" href="/src/css/picker.css">
<link rel="stylesheet" href="/src/css/stats.css">
<link rel="stylesheet" href="/src/css/settings-section.css">
<link rel="stylesheet" href="/src/css/workspace.css">
<link rel="stylesheet" href="/src/css/motion.css">
<style>
	body { margin: 0; font: 14px/1.5 system-ui, -apple-system, sans-serif; background: #f4f5f7; color: #1c1e21; }
	body[data-ds-dark-theme] { background: #181b24; color: #e4e7eb; }
	#host-shell { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
	#sidebar { background: #e8eaee; padding: 12px; }
	body[data-ds-dark-theme] #sidebar { background: #1f232d; }
	#conversation { padding: 24px; position: relative; }
	[data-composer-dock] { margin-top: 20px; padding: 12px; background: #fff; border: 1px solid #d8dade; border-radius: 12px; }
	body[data-ds-dark-theme] [data-composer-dock] { background: #1e222b; border-color: #2b303c; }
	textarea { width: 60%; height: 48px; }
	.fixture-card { margin-top: 10px; }
	.fixture-settings-slot { margin-top: 24px; }
	.fixture-workspace-slot { margin-top: 24px; }
</style>
</head>
<body>
	<div id="host-shell">
		<nav id="sidebar">
			<button id="sidebar-opener" type="button">侧栏</button>
		</nav>
		<main id="conversation">
			<div data-composer-dock>
				<div data-slot="conversation.input.model"></div>
			</div>
			<div class="fixture-card">
				<textarea aria-label="消息"></textarea>
			</div>
			<div id="workspace-container" class="fixture-workspace-slot"></div>
			<div id="settings-container" class="fixture-settings-slot"></div>
		</main>
	</div>

	<script src="/react.js"></script>
	<script src="/react-dom.js"></script>
	${names.map((n) => `<script src="/src/${n}.js"></script>`).join('\n\t')}
	<script>
		(() => {
			window.__lgViolations = [];
			const origFetch = window.fetch;
			window.fetch = (input, init) => {
				const u = typeof input === 'string' ? input : (input && input.url) || '';
				if (!u.startsWith('/') && !u.startsWith(location.origin)) {
					window.__lgViolations.push(u);
					return Promise.reject(new Error('presentation fixture refused external fetch: ' + u));
				}
				return origFetch(input, init);
			};

			window.__lgLayers = [];
			window.__lgSeats = [];
			window.__lgJanitor = () => {
				while (window.__lgSeats.length) {
					const stop = window.__lgSeats.pop();
					try { if (typeof stop === 'function') stop(); } catch {}
				}
				while (window.__lgLayers.length) {
					const l = window.__lgLayers.pop();
					try { l.release(); } catch {}
				}
				const s = document.getElementById('settings-container');
				if (s) s.innerHTML = '';
				const w = document.getElementById('workspace-container');
				if (w) w.innerHTML = '';
				document.querySelectorAll('[data-lg-picker-host]').forEach((n) => n.removeAttribute('data-lg-picker-host'));
				document.documentElement.removeAttribute('data-lg-stats');
			};

			/* ---- Color & Contrast Measurement Helper ------------------- */
			const parseColor = (str) => {
				if (!str || str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
				const m = str.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
				if (m) {
					return {
						r: parseInt(m[1], 10),
						g: parseInt(m[2], 10),
						b: parseInt(m[3], 10),
						a: m[4] !== undefined ? parseFloat(m[4]) : 1,
					};
				}
				return { r: 0, g: 0, b: 0, a: 0 };
			};

			const composite = (over, under) => {
				const a = over.a + under.a * (1 - over.a);
				if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
				const r = Math.round((over.r * over.a + under.r * under.a * (1 - over.a)) / a);
				const g = Math.round((over.g * over.a + under.g * under.a * (1 - over.a)) / a);
				const b = Math.round((over.b * over.a + under.b * under.a * (1 - over.a)) / a);
				return { r, g, b, a };
			};

			const sRGBtoLinear = (c) => {
				const v = c / 255;
				return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
			};

			const relativeLuminance = (rgb) => {
				return 0.2126 * sRGBtoLinear(rgb.r) + 0.7152 * sRGBtoLinear(rgb.g) + 0.0722 * sRGBtoLinear(rgb.b);
			};

			const contrastRatio = (fg, bg) => {
				const l1 = relativeLuminance(fg);
				const l2 = relativeLuminance(bg);
				const lighter = Math.max(l1, l2);
				const darker = Math.min(l1, l2);
				return (lighter + 0.05) / (darker + 0.05);
			};

			window.__lgMeasure = (selector) => {
				const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
				if (!el) return null;
				const cs = getComputedStyle(el);

				// Compute composited background
				const stack = [];
				let curr = el;
				while (curr && curr.nodeType === 1) {
					const c = parseColor(getComputedStyle(curr).backgroundColor);
					if (c.a > 0) stack.unshift(c);
					curr = curr.parentElement;
				}
				const isDark = document.body.hasAttribute('data-ds-dark-theme');
				let compBg = isDark ? { r: 24, g: 27, b: 36, a: 1 } : { r: 244, g: 245, b: 247, a: 1 };
				for (const c of stack) compBg = composite(c, compBg);

				const fg = parseColor(cs.color);
				const compFg = composite(fg, compBg);

				const ratio = contrastRatio(compFg, compBg);
				const fontSize = parseFloat(cs.fontSize);
				const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.minHeight) || 0;
				const rect = el.getBoundingClientRect();

				return {
					text: (el.textContent || '').trim().slice(0, 30),
					fontSize,
					lineHeight,
					color: cs.color,
					backgroundColor: cs.backgroundColor,
					compFg: \`rgb(\${compFg.r}, \${compFg.g}, \${compFg.b})\`,
					compBg: \`rgb(\${compBg.r}, \${compBg.g}, \${compBg.b})\`,
					ratio: Math.round(ratio * 100) / 100,
					box: { width: Math.round(rect.width), height: Math.round(rect.height), left: Math.round(rect.left), right: Math.round(rect.right) },
				};
			};

			/* ---- Mounting Helpers --------------------------------------- */
			window.__lgMountPicker = (options = {}) => {
				const groups = options.groups || [
					{
						id: 'prov-a',
						name: 'DeepSeek 官方',
						models: [
							{
								id: 'deepseek-chat',
								name: 'DeepSeek-V3 · x1.0',
								description: '通用对话与代码能力，响应迅速',
								reasoning: { efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }], defaultEffort: 'high' },
							},
							{
								id: 'deepseek-reasoner',
								name: 'DeepSeek-R1 · x2.5',
								description: '深度思考推理模型，数学解题优秀',
							},
						],
					},
					{
						id: 'prov-b',
						name: 'Anthropic Claude',
						models: [
							{ id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', description: '高智能编程与分析模型', rate: '3.0x' },
						],
					},
				];

				const snap = {
					current: options.current !== undefined ? options.current : { provider: 'prov-a', model: 'deepseek-chat' },
					routable: true,
					groups,
					failures: {},
					status: 'ready',
					pending: false,
					error: null,
				};
				const listeners = new Set();
				const directory = {
					store: { getSnapshot: () => snap, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } },
					load: () => {},
					select: () => ({ ok: true }),
				};
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
				return { stop, layers };
			};

			window.__lgMountSettings = (options = {}) => {
				const container = document.getElementById('settings-container');
				container.innerHTML = '';
				const groups = options.groups || [
					{
						id: 'prov-a',
						name: 'DeepSeek 官方',
						models: [
							{ id: 'deepseek-chat', name: 'DeepSeek-V3' },
							{ id: 'deepseek-reasoner', name: 'DeepSeek-R1' },
						],
					},
					{
						id: 'prov-b',
						name: 'Anthropic Claude',
						models: [
							{ id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
						],
					},
				];
				const snap = { groups };
				const listeners = new Set();
				const directory = {
					store: { getSnapshot: () => snap, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } },
					load: () => {},
				};
				const service = { directoryFor: () => directory };
				let root = null;
				const ctx = {
					slots: {
						register: (meta, comp) => {
							root = window.ReactDOM.createRoot(container);
							root.render(window.React.createElement(comp));
							return () => {
								if (root) root.unmount();
								container.innerHTML = '';
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
				const prefs = {
					max: 4,
					selection: () => currentSelection,
					get: (key) => (options.prefs ? options.prefs[key] : true),
					set: () => {},
					subscribe: (fn) => { prefListeners.add(fn); return () => prefListeners.delete(fn); },
					commit: (next) => {
						currentSelection = next;
						for (const fn of Array.from(prefListeners)) fn();
					},
				};
				const layers = createLayers();
				window.__lgLayers.push(layers);
				const section = createSettingsSection(requireShim, ctx, window.__lgCatalog, prefs, { layers });
				const unregister = section.register();
				const stop = () => {
					if (unregister) unregister();
					if (root) root.unmount();
					container.innerHTML = '';
				};
				window.__lgSeats.push(stop);
				return { stop, layers };
			};

			window.__lgMountWorkspace = (options = {}) => {
				const container = document.getElementById('workspace-container');
				container.innerHTML = \`
					<div class="lgwsp-workspace-shell lgwsp-has-inspector" style="max-width: 1100px;">
						<div class="lgwsp-status-pills">
							<span class="lgwsp-status-pill" id="ws-test-pill"><i class="lgwsp-status-dot"></i>已同步 2 项目</span>
						</div>
						<div class="lgwsp-sync-bar">
							<div class="lgwsp-sync-copy">
								<div class="lgwsp-sync-meta" id="ws-test-sync-meta">最后同步于 16:05:22</div>
							</div>
						</div>
						<div class="lgwsp-item-list">
							<div class="lgwsp-item-row" id="ws-test-item-row">
								<div class="lgwsp-item-primary">
									<div class="lgwsp-item-symbol" style="--item-bg: rgba(230,80,60,.12); --item-color: #c0392b">缺陷</div>
									<div class="lgwsp-item-copy">
										<span class="lgwsp-item-title">跨城市集群数据统计口径不一致</span>
										<div class="lgwsp-item-meta" id="ws-test-item-meta">
											<span class="lgwsp-item-id" id="ws-test-item-id">#1145368483001012673</span>
											<span class="lgwsp-item-meta-sep">/</span>
											<span class="lgwsp-item-chip" id="ws-test-item-chip" style="--chip-bg: rgba(230,80,60,.12); --chip-color: #c0392b">高优</span>
											<span class="lgwsp-item-meta-sep">/</span>
											<span class="lgwsp-item-due" id="ws-test-item-due">今日截止</span>
										</div>
									</div>
								</div>
								<div class="lgwsp-item-side">
									<span class="lgwsp-item-owner" id="ws-test-item-owner">负责人: 张三</span>
									<button class="lgwsp-row-open" id="ws-test-row-open" type="button">详情</button>
								</div>
							</div>
						</div>
						<aside class="lgwsp-inspector" role="region" aria-label="详情">
							<div class="lgwsp-frame-content">
								<div class="lgwsp-detail-id" id="ws-test-detail-id">ID: 1145368483001012673</div>
								<div class="lgwsp-detail-chips">
									<span class="lgwsp-detail-chip" id="ws-test-detail-chip">处理中</span>
								</div>
								<div class="lgwsp-detail-grid">
									<div class="lgwsp-detail-field">
										<div class="lgwsp-detail-field-label" id="ws-test-detail-field-label">创建人</div>
										<div class="lgwsp-detail-field-value">李四</div>
									</div>
								</div>
								<div class="lgwsp-activity">
									<div class="lgwsp-activity-row">
										<div class="lgwsp-activity-dot"></div>
										<div class="lgwsp-activity-copy">
											<span>更新了状态为已确认</span>
											<span class="lgwsp-activity-time" id="ws-test-activity-time">10分钟前</span>
										</div>
									</div>
								</div>
							</div>
						</aside>
					</div>
				\`;
			};
		})();
	</script>
</body>
</html>`;

/* ------------------------------------------------------------------ *
 * Runner
 * ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
	const server = createServer((req, res) => {
		const u = new URL(req.url, 'http://localhost');
		if (u.pathname === '/') {
			const scriptNames = ['layers', 'picker', 'stats', 'settings-section', 'workspace', 'catalog'];
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(pageHtml(scriptNames));
			return;
		}
		const entry = sourceRoutes.get(u.pathname);
		if (entry) {
			res.writeHead(200, { 'Content-Type': entry[1] });
			res.end(entry[0]);
			return;
		}
		res.writeHead(404, { 'Content-Type': 'text/plain' });
		res.end('not found');
	});

	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const port = server.address().port;
	const baseUrl = `http://127.0.0.1:${port}/`;

	console.log(`presentation-check: running on ${baseUrl}`);

	const browser = await launch({ headless: true, width: 1440, height: 960 });
	const page = await browser.newPage();

	const qaEvidence = {
		date: new Date().toISOString(),
		hostVersion: 'DeepSeek Harness Nightly / Electron 44.7.0 / Chromium',
		osVersion: 'Windows 11 Home Build 26300 (AppliedDPI: 96)',
		visualMatrix: [],
		contrastRecords: [],
		typographyRecords: [],
		overlapRecords: [],
	};

	let passedCount = 0;
	let failedCount = 0;

	const testCheck = async (name, fn) => {
		try {
			await fn();
			console.log(`  ✓ ${name}`);
			passedCount++;
		} catch (err) {
			console.error(`  ✗ ${name}`);
			console.error(`    ${err.message}`);
			failedCount++;
		} finally {
			try {
				await page.evaluate(`window.__lgJanitor();`);
			} catch {}
		}
	};

	try {
		await page.goto(baseUrl, { settleMs: 500 });

		/* -------------------------------------------------------------- *
		 * 1. Typography & Contrast in Light Theme
		 * -------------------------------------------------------------- */
		console.log('\n--- 1. Typography & Contrast in Light Theme ---');

		await testCheck('model picker auxiliary text: >=12px/17px, >=4.5:1 composited contrast', async () => {
			await page.evaluate(`(async () => {
				document.body.removeAttribute('data-ds-dark-theme');
				window.__lgMountPicker();
			})()`);
			await sleep(150);

			// Open picker card
			await page.evaluate(`document.querySelector('.lg-picker-trigger').click();`);
			await sleep(150);

			const count = await page.evaluate(`window.__lgMeasure('.lg-picker-count')`);
			const desc = await page.evaluate(`window.__lgMeasure('.lg-picker-desc')`);
			const mult = await page.evaluate(`window.__lgMeasure('.lg-picker-mult')`);

			qaEvidence.typographyRecords.push(
				{ role: 'lg-picker-count', theme: 'light', ...count },
				{ role: 'lg-picker-desc', theme: 'light', ...desc },
				{ role: 'lg-picker-mult', theme: 'light', ...mult }
			);

			if (!count || count.fontSize < 12 || count.lineHeight < 17 || count.ratio < 4.5) {
				throw new Error(`lg-picker-count failed: font-size=${count?.fontSize}px, line-height=${count?.lineHeight}px, ratio=${count?.ratio}:1`);
			}
			if (!desc || desc.fontSize < 12 || desc.lineHeight < 17 || desc.ratio < 4.5) {
				throw new Error(`lg-picker-desc failed: font-size=${desc?.fontSize}px, line-height=${desc?.lineHeight}px, ratio=${desc?.ratio}:1`);
			}
			if (!mult || mult.fontSize < 12 || mult.lineHeight < 17 || mult.ratio < 4.5) {
				throw new Error(`lg-picker-mult failed: font-size=${mult?.fontSize}px, line-height=${mult?.lineHeight}px, ratio=${mult?.ratio}:1`);
			}
		});

		await testCheck('model picker row states: normal, selected, hover, selected+hover contrast >= 4.5:1', async () => {
			await page.evaluate(`(async () => {
				document.body.removeAttribute('data-ds-dark-theme');
				window.__lgMountPicker({ current: { provider: 'prov-a', model: 'deepseek-chat' } });
			})()`);
			await sleep(150);
			await page.evaluate(`document.querySelector('.lg-picker-trigger').click();`);
			await sleep(150);

			// Selected row (.lg-picker-option[aria-selected="true"])
			const selectedDesc = await page.evaluate(`window.__lgMeasure('.lg-picker-option[aria-selected="true"] .lg-picker-desc')`);
			const selectedMult = await page.evaluate(`window.__lgMeasure('.lg-picker-option[aria-selected="true"] .lg-picker-mult')`);

			// Hover unselected row
			const unselectedRowBox = await page.evaluate(`(() => {
				const r = document.querySelectorAll('.lg-picker-option')[1].getBoundingClientRect();
				return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
			})()`);
			await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: unselectedRowBox.x, y: unselectedRowBox.y });
			await sleep(100);
			const hoveredDesc = await page.evaluate(`window.__lgMeasure(document.querySelectorAll('.lg-picker-option')[1].querySelector('.lg-picker-desc'))`);

			// Hover selected row
			const selectedRowBox = await page.evaluate(`(() => {
				const r = document.querySelector('.lg-picker-option[aria-selected="true"]').getBoundingClientRect();
				return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
			})()`);
			await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: selectedRowBox.x, y: selectedRowBox.y });
			await sleep(100);
			const selectedHoverDesc = await page.evaluate(`window.__lgMeasure('.lg-picker-option[aria-selected="true"] .lg-picker-desc')`);

			// Move mouse away
			await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });

			qaEvidence.contrastRecords.push(
				{ state: 'selected', role: 'lg-picker-desc', theme: 'light', ...selectedDesc },
				{ state: 'selected', role: 'lg-picker-mult', theme: 'light', ...selectedMult },
				{ state: 'hover', role: 'lg-picker-desc', theme: 'light', ...hoveredDesc },
				{ state: 'selected+hover', role: 'lg-picker-desc', theme: 'light', ...selectedHoverDesc }
			);

			if (!selectedDesc || selectedDesc.ratio < 4.5) throw new Error(`selected desc contrast failed: ratio=${selectedDesc?.ratio}:1`);
			if (!selectedMult || selectedMult.ratio < 4.5) throw new Error(`selected mult contrast failed: ratio=${selectedMult?.ratio}:1`);
			if (!hoveredDesc || hoveredDesc.ratio < 4.5) throw new Error(`hovered desc contrast failed: ratio=${hoveredDesc?.ratio}:1`);
			if (!selectedHoverDesc || selectedHoverDesc.ratio < 4.5) throw new Error(`selected+hover desc contrast failed: ratio=${selectedHoverDesc?.ratio}:1`);
		});

		await testCheck('settings helper text roles: >=12px/17px, >=4.5:1 composited contrast', async () => {
			await page.evaluate(`(async () => {
				document.body.removeAttribute('data-ds-dark-theme');
				window.__lgMountSettings();
			})()`);
			await sleep(150);

			const count = await page.evaluate(`window.__lgMeasure('.lg-settings-count')`);
			const intro = await page.evaluate(`window.__lgMeasure('.lg-settings-intro')`);
			const note = await page.evaluate(`window.__lgMeasure('.lg-settings-note')`);
			const foot = await page.evaluate(`window.__lgMeasure('.lg-settings-foot')`);

			qaEvidence.typographyRecords.push(
				{ role: 'lg-settings-count', theme: 'light', ...count },
				{ role: 'lg-settings-intro', theme: 'light', ...intro },
				{ role: 'lg-settings-note', theme: 'light', ...note },
				{ role: 'lg-settings-foot', theme: 'light', ...foot }
			);

			if (!count || count.fontSize < 12 || count.lineHeight < 17 || count.ratio < 4.5) throw new Error(`lg-settings-count failed: ratio=${count?.ratio}:1, size=${count?.fontSize}px`);
			if (!intro || intro.fontSize < 12 || intro.lineHeight < 17 || intro.ratio < 4.5) throw new Error(`lg-settings-intro failed: ratio=${intro?.ratio}:1, size=${intro?.fontSize}px`);
			if (!note || note.fontSize < 12 || note.lineHeight < 17 || note.ratio < 4.5) throw new Error(`lg-settings-note failed: ratio=${note?.ratio}:1, size=${note?.fontSize}px`);
			if (!foot || foot.fontSize < 12 || foot.lineHeight < 17 || foot.ratio < 4.5) throw new Error(`lg-settings-foot failed: ratio=${foot?.ratio}:1, size=${foot?.fontSize}px`);
		});

		await testCheck('workspace metadata roles: >=12px/17px, >=4.5:1 composited contrast', async () => {
			await page.evaluate(`(async () => {
				document.body.removeAttribute('data-ds-dark-theme');
				window.__lgMountWorkspace();
			})()`);
			await sleep(150);

			const pill = await page.evaluate(`window.__lgMeasure('#ws-test-pill')`);
			const syncMeta = await page.evaluate(`window.__lgMeasure('#ws-test-sync-meta')`);
			const itemMeta = await page.evaluate(`window.__lgMeasure('#ws-test-item-meta')`);
			const itemId = await page.evaluate(`window.__lgMeasure('#ws-test-item-id')`);
			const itemChip = await page.evaluate(`window.__lgMeasure('#ws-test-item-chip')`);
			const itemDue = await page.evaluate(`window.__lgMeasure('#ws-test-item-due')`);
			const itemOwner = await page.evaluate(`window.__lgMeasure('#ws-test-item-owner')`);
			const detailId = await page.evaluate(`window.__lgMeasure('#ws-test-detail-id')`);
			const detailChip = await page.evaluate(`window.__lgMeasure('#ws-test-detail-chip')`);
			const fieldLabel = await page.evaluate(`window.__lgMeasure('#ws-test-detail-field-label')`);
			const activityTime = await page.evaluate(`window.__lgMeasure('#ws-test-activity-time')`);

			qaEvidence.typographyRecords.push(
				{ role: 'lgwsp-status-pill', theme: 'light', ...pill },
				{ role: 'lgwsp-sync-meta', theme: 'light', ...syncMeta },
				{ role: 'lgwsp-item-meta', theme: 'light', ...itemMeta },
				{ role: 'lgwsp-item-id', theme: 'light', ...itemId },
				{ role: 'lgwsp-item-chip', theme: 'light', ...itemChip },
				{ role: 'lgwsp-item-due', theme: 'light', ...itemDue },
				{ role: 'lgwsp-item-owner', theme: 'light', ...itemOwner },
				{ role: 'lgwsp-detail-id', theme: 'light', ...detailId },
				{ role: 'lgwsp-detail-chip', theme: 'light', ...detailChip },
				{ role: 'lgwsp-detail-field-label', theme: 'light', ...fieldLabel },
				{ role: 'lgwsp-activity-time', theme: 'light', ...activityTime }
			);

			if (!pill || pill.fontSize < 12 || pill.ratio < 4.5) throw new Error(`pill failed: ratio=${pill?.ratio}:1, size=${pill?.fontSize}`);
			if (!syncMeta || syncMeta.fontSize < 12 || syncMeta.lineHeight < 17 || syncMeta.ratio < 4.5) throw new Error(`syncMeta failed: ratio=${syncMeta?.ratio}:1`);
			if (!itemMeta || itemMeta.fontSize < 12 || itemMeta.lineHeight < 17 || itemMeta.ratio < 4.5) throw new Error(`itemMeta failed: ratio=${itemMeta?.ratio}:1`);
			if (!itemId || itemId.fontSize < 12 || itemId.lineHeight < 17 || itemId.ratio < 4.5) throw new Error(`itemId failed: ratio=${itemId?.ratio}:1`);
			if (!itemChip || itemChip.fontSize < 12 || itemChip.ratio < 4.5) throw new Error(`itemChip failed: ratio=${itemChip?.ratio}:1`);
			if (!itemDue || itemDue.fontSize < 12 || itemDue.lineHeight < 17 || itemDue.ratio < 4.5) throw new Error(`itemDue failed: ratio=${itemDue?.ratio}:1`);
			if (!itemOwner || itemOwner.fontSize < 12 || itemOwner.lineHeight < 17 || itemOwner.ratio < 4.5) throw new Error(`itemOwner failed: ratio=${itemOwner?.ratio}:1`);
			if (!detailId || detailId.fontSize < 12 || detailId.lineHeight < 17 || detailId.ratio < 4.5) throw new Error(`detailId failed: ratio=${detailId?.ratio}:1`);
			if (!detailChip || detailChip.fontSize < 12 || detailChip.ratio < 4.5) throw new Error(`detailChip failed: ratio=${detailChip?.ratio}:1`);
			if (!fieldLabel || fieldLabel.fontSize < 12 || fieldLabel.lineHeight < 17 || fieldLabel.ratio < 4.5) throw new Error(`fieldLabel failed: ratio=${fieldLabel?.ratio}:1`);
			if (!activityTime || activityTime.fontSize < 12 || activityTime.lineHeight < 17 || activityTime.ratio < 4.5) throw new Error(`activityTime failed: ratio=${activityTime?.ratio}:1`);
		});

		/* -------------------------------------------------------------- *
		 * 2. Typography & Contrast in Dark Theme
		 * -------------------------------------------------------------- */
		console.log('\n--- 2. Typography & Contrast in Dark Theme ---');

		await testCheck('dark theme: picker, settings, and workspace meet >=12px/17px and >=4.5:1 contrast', async () => {
			await page.evaluate(`(async () => {
				document.body.setAttribute('data-ds-dark-theme', 'true');
				window.__lgMountPicker();
				window.__lgMountSettings();
				window.__lgMountWorkspace();
			})()`);
			await sleep(150);

			await page.evaluate(`document.querySelector('.lg-picker-trigger').click();`);
			await sleep(150);

			const pickerDesc = await page.evaluate(`window.__lgMeasure('.lg-picker-desc')`);
			const pickerMult = await page.evaluate(`window.__lgMeasure('.lg-picker-mult')`);
			const settingsIntro = await page.evaluate(`window.__lgMeasure('.lg-settings-intro')`);
			const settingsNote = await page.evaluate(`window.__lgMeasure('.lg-settings-note')`);
			const wsItemMeta = await page.evaluate(`window.__lgMeasure('#ws-test-item-meta')`);
			const wsDetailId = await page.evaluate(`window.__lgMeasure('#ws-test-detail-id')`);

			qaEvidence.typographyRecords.push(
				{ role: 'lg-picker-desc', theme: 'dark', ...pickerDesc },
				{ role: 'lg-picker-mult', theme: 'dark', ...pickerMult },
				{ role: 'lg-settings-intro', theme: 'dark', ...settingsIntro },
				{ role: 'lg-settings-note', theme: 'dark', ...settingsNote },
				{ role: 'lgwsp-item-meta', theme: 'dark', ...wsItemMeta },
				{ role: 'lgwsp-detail-id', theme: 'dark', ...wsDetailId }
			);

			if (!pickerDesc || pickerDesc.ratio < 4.5) throw new Error(`dark pickerDesc failed: ratio=${pickerDesc?.ratio}:1`);
			if (!pickerMult || pickerMult.ratio < 4.5) throw new Error(`dark pickerMult failed: ratio=${pickerMult?.ratio}:1`);
			if (!settingsIntro || settingsIntro.ratio < 4.5) throw new Error(`dark settingsIntro failed: ratio=${settingsIntro?.ratio}:1`);
			if (!settingsNote || settingsNote.ratio < 4.5) throw new Error(`dark settingsNote failed: ratio=${settingsNote?.ratio}:1`);
			if (!wsItemMeta || wsItemMeta.ratio < 4.5) throw new Error(`dark wsItemMeta failed: ratio=${wsItemMeta?.ratio}:1`);
			if (!wsDetailId || wsDetailId.ratio < 4.5) throw new Error(`dark wsDetailId failed: ratio=${wsDetailId?.ratio}:1`);
		});

		/* -------------------------------------------------------------- *
		 * 3. Restrained Settings Enabled Rows & Switch Indicators
		 * -------------------------------------------------------------- */
		console.log('\n--- 3. Restrained Settings Enabled Rows & Switch Indicators ---');

		await testCheck('settings enabled rows: faint gradient, switch indicator, neutral name/glyph, visible focus', async () => {
			await page.evaluate(`(async () => {
				document.body.removeAttribute('data-ds-dark-theme');
				window.__lgMountSettings({ selection: { providers: ['prov-a'], models: {} } });
			})()`);
			await sleep(150);

			const evaluation = await page.evaluate(`(() => {
				const rows = document.querySelectorAll('li.lg-settings-row');
				const enabledRow = rows[0]; // prov-a
				const disabledRow = rows[1]; // prov-b

				const enCs = getComputedStyle(enabledRow);
				const disCs = getComputedStyle(disabledRow);

				const enName = enabledRow.querySelector('.lg-settings-name');
				const enNameCs = getComputedStyle(enName);

				const enSwitch = enabledRow.querySelector('.lg-settings-switch');
				const isSwitchChecked = enSwitch ? (enSwitch.getAttribute('data-on') === 'true' || enSwitch.getAttribute('aria-checked') === 'true') : false;

				return {
					enabledRowBg: enCs.backgroundImage,
					enabledRowOutline: enCs.outlineStyle,
					enabledNameWeight: parseInt(enNameCs.fontWeight, 10),
					isSwitchChecked,
					disabledRowBg: disCs.backgroundImage,
				};
			})()`);

			if (!evaluation.isSwitchChecked) throw new Error('enabled row switch is not checked');
			if (evaluation.enabledNameWeight > 500) throw new Error(`enabled name weight is too heavy: ${evaluation.enabledNameWeight}`);
			if (evaluation.enabledRowOutline !== 'none') throw new Error(`enabled row should not have accent outline: ${evaluation.enabledRowOutline}`);

			// Verify keyboard focus on switch is distinguishable
			await page.evaluate(`document.querySelector('li.lg-settings-row:first-child .lg-settings-switch').focus();`);
			await sleep(50);
			const focusInfo = await page.evaluate(`(() => {
				const sw = document.querySelector('li.lg-settings-row:first-child .lg-settings-switch');
				return { active: document.activeElement === sw };
			})()`);
			if (!focusInfo.active) throw new Error('switch did not receive focus');
		});

		/* -------------------------------------------------------------- *
		 * 4. Display Preferences (Motion, Transparency, Contrast)
		 * -------------------------------------------------------------- */
		console.log('\n--- 4. Display Preferences & Reduced Transparency ---');

		await testCheck('reduced transparency: settings board has alpha 1.0, no backdrop blur/glow/grain', async () => {
			await page.send('Emulation.setEmulatedMedia', {
				media: 'screen',
				features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
			});

			await page.evaluate(`(async () => {
				document.body.removeAttribute('data-ds-dark-theme');
				window.__lgMountSettings();
			})()`);
			await sleep(150);

			const lightPrefs = await page.evaluate(`(() => {
				const board = document.querySelector('.lg-settings-board');
				const cs = getComputedStyle(board);
				const glow = document.querySelector('.lg-settings-glow');
				const glowCs = glow ? getComputedStyle(glow) : null;
				const beforeCs = getComputedStyle(board, '::before');
				const afterCs = getComputedStyle(board, '::after');
				return {
					bgColor: cs.backgroundColor,
					backdropFilter: cs.backdropFilter,
					glowDisplay: glowCs ? glowCs.display : 'none',
					beforeDisplay: beforeCs.display,
					afterDisplay: afterCs.display,
				};
			})()`);

			if (lightPrefs.backdropFilter !== 'none') throw new Error(`backdrop-filter should be none, got: ${lightPrefs.backdropFilter}`);
			if (lightPrefs.glowDisplay !== 'none') throw new Error(`glow should be display:none, got: ${lightPrefs.glowDisplay}`);
			if (lightPrefs.beforeDisplay !== 'none') throw new Error(`sheen ::before should be display:none, got: ${lightPrefs.beforeDisplay}`);
			if (lightPrefs.afterDisplay !== 'none') throw new Error(`grain ::after should be display:none, got: ${lightPrefs.afterDisplay}`);

			// Reset media emulation
			await page.send('Emulation.setEmulatedMedia', { media: 'screen', features: [] });
		});

		await testCheck('combined preferences: reduced motion + transparency + contrast preserve control states', async () => {
			await page.send('Emulation.setEmulatedMedia', {
				media: 'screen',
				features: [
					{ name: 'prefers-reduced-motion', value: 'reduce' },
					{ name: 'prefers-reduced-transparency', value: 'reduce' },
					{ name: 'prefers-contrast', value: 'more' },
				],
			});

			await page.evaluate(`(async () => {
				document.body.removeAttribute('data-ds-dark-theme');
				window.__lgMountSettings({ selection: { providers: ['prov-a'], models: {} } });
			})()`);
			await sleep(150);

			const combinedCheck = await page.evaluate(`(() => {
				const board = document.querySelector('.lg-settings-board');
				const cs = getComputedStyle(board);
				const sw = document.querySelector('li.lg-settings-row:first-child .lg-settings-switch');
				const isChecked = sw ? (sw.getAttribute('data-on') === 'true' || sw.getAttribute('aria-checked') === 'true') : false;
				const transMatch = window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
				const motionMatch = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
				const contrastMatch = window.matchMedia('(prefers-contrast: more)').matches;
				return { isChecked, transMatch, motionMatch, contrastMatch, backdropFilter: cs.backdropFilter };
			})()`);

			if (!combinedCheck.isChecked) throw new Error('switch state lost in combined preferences');
			if (!combinedCheck.transMatch || !combinedCheck.motionMatch || !combinedCheck.contrastMatch) {
				throw new Error('media features failed to match in page');
			}

			// Reset media emulation
			await page.send('Emulation.setEmulatedMedia', { media: 'screen', features: [] });
		});

		/* -------------------------------------------------------------- *
		 * 5. Control Fit & Overlap Check
		 * -------------------------------------------------------------- */
		console.log('\n--- 5. Control Fit & Layout Clearance ---');

		await testCheck('control fit: text does not overlap switches, buttons, or adjacent labels', async () => {
			await page.evaluate(`(async () => {
				document.body.removeAttribute('data-ds-dark-theme');
				window.__lgMountPicker();
				window.__lgMountSettings();
				window.__lgMountWorkspace();
			})()`);
			await sleep(150);

			await page.evaluate(`document.querySelector('.lg-picker-trigger').click();`);
			await sleep(150);

			const overlaps = await page.evaluate(`(() => {
				const checkOverlap = (r1, r2) => {
					return !(r1.right <= r2.left || r1.left >= r2.right || r1.bottom <= r2.top || r1.top >= r2.bottom);
				};
				const issues = [];

				// Check settings rows
				document.querySelectorAll('li.lg-settings-row').forEach((row, i) => {
					const label = row.querySelector('.lg-settings-name');
					const sw = row.querySelector('.lg-settings-switch');
					if (label && sw) {
						if (checkOverlap(label.getBoundingClientRect(), sw.getBoundingClientRect())) {
							issues.push(\`settings row \${i} label overlaps switch\`);
						}
					}
				});

				// Check workspace item row
				const title = document.querySelector('.lgwsp-item-title');
				const openBtn = document.querySelector('.lgwsp-row-open');
				if (title && openBtn) {
					if (checkOverlap(title.getBoundingClientRect(), openBtn.getBoundingClientRect())) {
						issues.push('workspace item title overlaps open button');
					}
				}

				return issues;
			})()`);

			qaEvidence.overlapRecords.push({ count: overlaps.length, issues: overlaps });
			if (overlaps.length > 0) throw new Error(`overlaps detected: ${overlaps.join('; ')}`);
		});

		/* -------------------------------------------------------------- *
		 * 6. Visual Matrix & Screenshot Captures
		 * -------------------------------------------------------------- */
		console.log('\n--- 6. Visual Matrix & Screenshot Captures ---');

		const matrixCases = [
			{ id: '01-light-100-overview', theme: 'light', scale: 1.0, width: 1440, height: 960, features: [] },
			{ id: '02-dark-100-overview', theme: 'dark', scale: 1.0, width: 1440, height: 960, features: [] },
			{ id: '03-light-125', theme: 'light', scale: 1.25, width: 1440, height: 960, features: [] },
			{ id: '04-dark-125', theme: 'dark', scale: 1.25, width: 1440, height: 960, features: [] },
			{ id: '05-light-125-reduced-motion', theme: 'light', scale: 1.25, width: 1440, height: 960, features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
			{ id: '06-light-125-reduced-transparency', theme: 'light', scale: 1.25, width: 1440, height: 960, features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] },
			{ id: '07-light-125-increased-contrast', theme: 'light', scale: 1.25, width: 1440, height: 960, features: [{ name: 'prefers-contrast', value: 'more' }] },
			{ id: '08-light-125-combined', theme: 'light', scale: 1.25, width: 1440, height: 960, features: [
				{ name: 'prefers-reduced-motion', value: 'reduce' },
				{ name: 'prefers-reduced-transparency', value: 'reduce' },
				{ name: 'prefers-contrast', value: 'more' },
			] },
			{ id: '09-light-150', theme: 'light', scale: 1.5, width: 1440, height: 960, features: [] },
			{ id: '10-dark-150', theme: 'dark', scale: 1.5, width: 1440, height: 960, features: [] },
			{ id: '11-narrow-150-combined', theme: 'dark', scale: 1.5, width: 430, height: 932, features: [
				{ name: 'prefers-reduced-motion', value: 'reduce' },
				{ name: 'prefers-reduced-transparency', value: 'reduce' },
				{ name: 'prefers-contrast', value: 'more' },
			] },
		];

		for (const mc of matrixCases) {
			await testCheck(`matrix: ${mc.id} (scale=${mc.scale}, ${mc.width}x${mc.height})`, async () => {
				await page.send('Emulation.setDeviceMetricsOverride', {
					width: mc.width,
					height: mc.height,
					deviceScaleFactor: mc.scale,
					mobile: mc.width <= 900,
				});

				await page.send('Emulation.setEmulatedMedia', {
					media: 'screen',
					features: mc.features,
				});

				await page.evaluate(`(async (theme) => {
					if (theme === 'dark') document.body.setAttribute('data-ds-dark-theme', 'true');
					else document.body.removeAttribute('data-ds-dark-theme');
					window.__lgMountPicker();
					window.__lgMountSettings();
					window.__lgMountWorkspace();
				})('${mc.theme}')`);
				await sleep(250);

				const shotPath = resolve(outDir, `${mc.id}.png`);
				await page.screenshot(shotPath, { width: mc.width, height: mc.height, fullPage: true });

				qaEvidence.visualMatrix.push({
					id: mc.id,
					theme: mc.theme,
					scale: mc.scale,
					viewport: `${mc.width}x${mc.height}`,
					preferences: mc.features.map((f) => `${f.name}:${f.value}`).join(', ') || 'default',
					screenshot: `out/presentation-qa/${mc.id}.png`,
					status: 'passed',
				});
			});
		}

		// Save structured evidence for docs/PRESENTATION-QA.md
		const evidenceFile = resolve(root, 'out/presentation-qa/evidence.json');
		writeFileSync(evidenceFile, JSON.stringify(qaEvidence, null, 2), 'utf8');
		console.log(`\nevidence recorded in ${evidenceFile}`);

	} finally {
		try { await page.close(); } catch { /* ignore */ }
		await browser.close();
		server.closeAllConnections?.();
		server.close();
	}

	console.log(`\n========================================`);
	console.log(`presentation-check summary: ${passedCount} passed, ${failedCount} failed`);
	console.log(`========================================\n`);

	process.exit(failedCount > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error('presentation-check fatal:', err);
	process.exit(1);
});
