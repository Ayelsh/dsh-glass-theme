/**
 * Doctor for "the glass is gone": loads the live GUI headlessly and reports
 * whether the skin's client bundle is present, executed, and mounted.
 *
 *   node tools/glass-check.mjs [--url http://127.0.0.1:PORT/]
 */
import { launch } from './cdp.mjs';
const URL_BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'http://127.0.0.1:50062/';
const cookiePair = process.env.LG_COOKIE ?? '';
const eq = cookiePair.indexOf('=');
const name = cookiePair.slice(0, eq), value = cookiePair.slice(eq + 1);
const b = await launch({ width: 1400, height: 950, port: process.env.LG_PORT ? Number(process.env.LG_PORT) : null });
try {
	const page = await b.newPage();
	await page.cookie({ name, value, domain: '127.0.0.1', path: '/' });
	await page.goto(URL_BASE, { settleMs: 12000 });
	const r = await page.evaluate(`(() => {
		const o = {};
		o.moduleLoader = typeof window.__ModuleLoader__;
		o.htmlGlass = document.documentElement.getAttribute('data-dsh-glass-theme');
		o.htmlBuilt = document.documentElement.getAttribute('data-dsh-glass-theme-built');
		o.bodyGlass = document.body ? document.body.hasAttribute('data-dsh-glass-theme') : 'no body';
		o.styleTags = [...document.querySelectorAll('style[data-plugin-css]')].map(t => t.dataset.pluginCss);
		const scripts = [...document.querySelectorAll('script[src]')].map(s => s.src);
		o.glassScripts = scripts.filter(s => s.includes('glass'));
		const loaderScripts = [...document.querySelectorAll('script')].map(s => s.textContent || '').join('\\n');
		o.rosterMentionsGlass = loaderScripts.includes('dsh-glass-theme');
		o.sheetCount = document.querySelectorAll('style').length;
		o.firstSheetIds = [...document.querySelectorAll('style')].slice(0, 20).map(t => t.id || t.getAttribute('data-plugin-css') || (t.textContent||'').slice(0, 40));
		return o;
	})()`);
	console.log('STATE', JSON.stringify(r, null, 2));
	console.log('CONSOLE', JSON.stringify(page.console.slice(0, 30), null, 2));
	console.log('ERRORS', JSON.stringify(page.errors.slice(0, 20), null, 2));
} finally { await b.close(); }
