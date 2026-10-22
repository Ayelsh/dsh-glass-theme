// Vision-QA shots: picker with a ZHIPU (zai) model current — the state where
// the provider-aware peak badge (amber 高峰 ≈2× on a weekday 14:00-18:00) and
// the filled selected row are both on screen. Dark + light.
import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const url = (() => {
	const i = process.argv.indexOf('--url');
	return i > 0 ? process.argv[i + 1] : 'http://127.0.0.1:56465/';
})();
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', url]).toString().trim();
const eq = out.indexOf('=');
const b = await launch({ headless: true, width: 1400, height: 950 });

const run = async (theme, file) => {
	const page = await b.newPage();
	await page.cookie({ name: out.slice(0, eq), value: out.slice(eq + 1), domain: '127.0.0.1', path: '/' });
	await page.addInitScript(`(() => {
    setInterval(() => {
      const el = document.body;
      if (!el) return;
      if ('${theme}' === 'light') { el.removeAttribute('data-ds-dark-theme'); document.documentElement.removeAttribute('data-ds-dark-theme'); }
      else { el.setAttribute('data-ds-dark-theme', '1'); document.documentElement.setAttribute('data-ds-dark-theme', '1'); }
    }, 250);
  })()`);
	await page.goto(url, { settleMs: 12000 });
	await page.evaluate(`(() => { const r=[...document.querySelectorAll('[class*=hIlkoa_sessionRow]')]; if(r[1]) r[1].click(); return 1 })()`);
	await new Promise((r) => setTimeout(r, 7000));
	await page.evaluate(`(() => {
    try { window.localStorage.setItem('dsh-glass-theme:quick-providers', JSON.stringify(['workbuddy'])); window.dispatchEvent(new Event('lg-quick-providers')); } catch (e) {}
    const ctx = window.__lgCtx; const v = ctx.get('uiSession').current.value;
    ctx.get('modelDirectories').directoryFor(v.key).select({ provider: 'zai-coding-cn', model: 'glm-5.3' });
    return 1;
  })()`);
	await new Promise((r) => setTimeout(r, 1500));
	await page.evaluate(`(() => { const t=document.querySelector('.lg-picker-trigger'); if(t.getAttribute('aria-expanded')!=='true') t.click(); return 1 })()`);
	await new Promise((r) => setTimeout(r, 800));
	const badge = await page.evaluate(`(() => { const el=document.querySelector('.lg-picker-badge'); return el ? { tone: el.getAttribute('data-lg-tone'), text: el.textContent } : null; })()`);
	console.log(theme.toUpperCase() + '-BADGE', JSON.stringify(badge));
	await page.screenshot('G:/dsh-build/research/' + file);
	await page.close();
};

const theme = (() => {
	const i = process.argv.indexOf('--theme');
	return i > 0 ? process.argv[i + 1] : 'dark';
})();
try {
	await run(theme, 'tl-zai-' + theme + '.png');
	console.log('SHOTS DONE');
} finally {
	await b.close();
	process.exit(0);
}
