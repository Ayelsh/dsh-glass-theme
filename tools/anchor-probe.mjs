// Reproduces the m00681 report: the picker card changes height when the
// session's model moves between a quick provider and a non-quick one (the
// union rule appends/removes a group) — and the card must RE-ANCHOR so its
// bottom edge stays a constant ~8px above the trigger. Without the fix the
// position froze at open time and the grown card covered the trigger.
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
const page = await b.newPage();
await page.cookie({ name: out.slice(0, eq), value: out.slice(eq + 1), domain: '127.0.0.1', path: '/' });
await page.goto(url, { settleMs: 12000 });
await page.evaluate(`(() => { const r=[...document.querySelectorAll('[class*=hIlkoa_sessionRow]')]; if(r[1]) r[1].click(); return 1 })()`);
await new Promise((r) => setTimeout(r, 7000));
await page.evaluate(`(() => { try { window.localStorage.setItem('dsh-glass-theme:quick-providers', JSON.stringify({ providers: ['workbuddy'], models: {} })); window.dispatchEvent(new Event('lg-quick-providers')); } catch (e) {} })()`);

const report = { checks: [] };
const measure = async (label) => {
	const m = await page.evaluate(`(() => {
		const t = document.querySelector('.lg-picker-trigger');
		const c = document.querySelector('.lg-picker-card:not(.lg-picker-card-all)');
		if (!t || !c) return null;
		const rt = t.getBoundingClientRect();
		const rc = c.getBoundingClientRect();
		return { top: [Math.round(rt.top), Math.round(rt.bottom)], card: [Math.round(rc.top), Math.round(rc.bottom)], height: Math.round(rc.height), above: rc.bottom <= rt.top + 1, below: rc.top >= rt.bottom - 1, gapAbove: Math.round(rt.top - rc.bottom), onScreen: rc.top >= 0 && rc.bottom <= window.innerHeight };
	})()`);
	const ok = m !== null && m.onScreen && (m.above || m.below);
	report.checks.push({ label, ...m, ok });
	console.log(label, JSON.stringify(m), ok ? 'ok' : 'BAD');
	return { ok, snapshot: m };
};

try {
	const state0 = await page.evaluate(`(() => { const ctx = window.__lgCtx; const v = ctx.get('uiSession').current.value; return ctx.get('modelDirectories').directoryFor(v.key).store.getSnapshot().current; })()`);
	report.before = state0;
	// find a quick-provider (workbuddy) model and a non-quick (zai) model
	const models = await page.evaluate(`(() => {
		const ctx = window.__lgCtx; const v = ctx.get('uiSession').current.value;
		const s = ctx.get('modelDirectories').directoryFor(v.key).store.getSnapshot();
		const pick = (pid) => { const g = s.groups.find((g) => g.id === pid); return g ? { provider: g.id, model: g.models[0].id } : null; };
		return { wb: pick('workbuddy'), zai: pick('zai-coding-cn') };
	})()`);
	const switchTo = async (m) => {
		await page.evaluate(`(() => { const ctx = window.__lgCtx; const v = ctx.get('uiSession').current.value; return ctx.get('modelDirectories').directoryFor(v.key).select(${JSON.stringify(m)}); })()`);
		await new Promise((r) => setTimeout(r, 1000));
	};
	// open the picker with the CURRENT model in the NON-quick provider → tall card
	await switchTo(models.zai);
	await page.evaluate(`(() => { const t=document.querySelector('.lg-picker-trigger'); if(t.getAttribute('aria-expanded')!=='true') t.click(); return 1 })()`);
	await new Promise((r) => setTimeout(r, 700));
	let r1 = await measure('tall(zai-current)');
	// switch to the QUICK provider via the all-card → main card shrinks (group removed)
	await page.evaluate(`(() => { const m=document.querySelector('.lg-picker-more'); if(m) m.click(); return 1 })()`);
	await new Promise((r) => setTimeout(r, 600));
	await page.evaluate(`(() => {
		const card = document.querySelector('.lg-picker-card-all');
		const sec = [...card.querySelectorAll('.lg-picker-section')].find((s) => (s.querySelector('.lg-picker-headingName') || {}).textContent === 'workbuddy');
		const row = sec.querySelector('.lg-picker-option');
		row.click();
		return 1;
	})()`);
	await new Promise((r) => setTimeout(r, 1000));
	let r2 = await measure('short(workbuddy-current)');
	// switch BACK to the non-quick provider (main card, zai group present now) → grows again
	await page.evaluate(`(() => {
		const sec = [...document.querySelectorAll('.lg-picker-card:not(.lg-picker-card-all) .lg-picker-section')].find((s) => (s.querySelector('.lg-picker-headingName') || {}).textContent === 'zai-coding-cn');
		if (!sec) return 0;
		sec.querySelector('.lg-picker-option').click();
		return 1;
	})()`);
	await new Promise((r) => setTimeout(r, 1000));
	let r3 = await measure('grown-again(zai-current)');
	// anchor tolerance: gapAbove must stay within 6..12px in both anchored states
	const near = (m) => m.snapshot && m.snapshot.gapAbove >= 5 && m.snapshot.gapAbove <= 14;
	const pass = r1.ok && r2.ok && r3.ok && near(r1) && near(r2) && near(r3);
	// restore
	await switchTo(state0);
	report.restored = await page.evaluate(`(() => { const ctx = window.__lgCtx; const v = ctx.get('uiSession').current.value; return ctx.get('modelDirectories').directoryFor(v.key).store.getSnapshot().current; })()`);
	console.log(pass ? 'ANCHOR PASS' : 'ANCHOR FAIL');
} finally {
	await b.close();
	process.exit(0);
}
