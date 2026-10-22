// Verifies the four m00550 behaviors against the live picker:
//   1. a model pick in the MAIN card keeps the card open (effort follows without reopening)
//   2. the all-card keeps a >=12px gutter and never overlaps the main card
//   3. a pick in the ALL card closes the all-card and leaves the main card open
//   4. the current model's provider group appears beside the pinned set when not pinned
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
// Open a NON-primary session (row 2) the way badge-probe does, so the
// directory resolves a scope for it.
await page.evaluate(`(() => { const r=[...document.querySelectorAll('[class*=hIlkoa_sessionRow]')]; if(r[1]) r[1].click(); return 1 })()`);
await new Promise((r) => setTimeout(r, 7000));
// Seed a quick list that does NOT contain zai-coding-cn, so the union rule
// (current provider beside the pinned set) is exercised for real.
await page.evaluate(`(() => { try { window.localStorage.setItem('dsh-glass-theme:quick-providers', JSON.stringify(['workbuddy'])); window.dispatchEvent(new Event('lg-quick-providers')); } catch (e) {} })()`);

const report = {};
try {
	const open = async () => {
		await page.evaluate(`(() => { const t=document.querySelector('.lg-picker-trigger'); if(t) t.click(); return 1 })()`);
		await new Promise((r) => setTimeout(r, 350));
	};
	const close = async () => {
		await page.evaluate(`(() => { document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); return 1 })()`);
		await new Promise((r) => setTimeout(r, 250));
	};

	// --- state before: remember it so we can restore
	const before = await page.evaluate(`(() => {
		const ctx = window.__lgCtx;
		const key = ctx.get('uiSession').current.value.key;
		return { key, current: ctx.get('modelDirectories').directoryFor(key).store.getSnapshot().current };
	})()`);

	// (4) main card with quick providers: does the current provider group appear?
	await open();
	const union = await page.evaluate(`(() => {
		const groups = [...document.querySelectorAll('.lg-picker-card:not(.lg-picker-card-all) .lg-picker-section')];
		const names = groups.map((g) => (g.querySelector('.lg-picker-headingName') || {}).textContent);
		const allDoor = document.querySelector('.lg-picker-more');
		return { names, door: allDoor ? allDoor.textContent : null };
	})()`);
	report.unionGroups = union.names;
	report.unionDoor = union.door;
	const slug = (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
	report.unionHasCurrent = before.current !== null && union.names.some((n) => n && slug(n) === slug(before.current.provider));

	// (1) pick the FIRST model row in the main card; card must stay open
	const mainPick = await page.evaluate(`(() => {
		const rows = [...document.querySelectorAll('.lg-picker-card:not(.lg-picker-card-all) .lg-picker-option')];
		const row = rows[0];
		if (!row) return { picked: null };
		const label = (row.querySelector('.lg-picker-name') || {}).textContent;
		row.click();
		return { picked: label };
	})()`);
	await new Promise((r) => setTimeout(r, 900));
	report.mainPick = mainPick;
	report.mainCardOpenAfterPick = await page.evaluate(`(() => !!document.querySelector('.lg-picker-card:not(.lg-picker-card-all)') )()`);

	// (2)+(3) open the all-card, measure gap, pick inside it, expect all closed + main open
	await page.evaluate(`(() => { const m=document.querySelector('.lg-picker-more'); if(m) m.click(); return 1 })()`);
	await new Promise((r) => setTimeout(r, 600));
	const gap = await page.evaluate(`(() => {
		const a = document.querySelector('.lg-picker-card:not(.lg-picker-card-all)');
		const b = document.querySelector('.lg-picker-card-all');
		if (!a || !b) return null;
		const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect();
		const gapH = rb.right <= ra.left ? ra.left - rb.right : (ra.right <= rb.left ? rb.left - ra.right : -1);
		return { a: [ra.x, ra.y, ra.width, ra.height], b: [rb.x, rb.y, rb.width, rb.height], gapH };
	})()`);
	report.pairGeometry = gap;
	report.gapOk = gap !== null && gap.gapH >= 11.5;

	const allPick = await page.evaluate(`(() => {
		const card = document.querySelector('.lg-picker-card-all');
		if (!card) return { picked: null };
		const row = card.querySelectorAll('.lg-picker-option')[0];
		if (!row) return { picked: null };
		const label = (row.querySelector('.lg-picker-name') || {}).textContent;
		row.click();
		return { picked: label };
	})()`);
	await new Promise((r) => setTimeout(r, 900));
	report.allPick = allPick;
	report.allCardAfterAllPick = await page.evaluate(`(() => !!document.querySelector('.lg-picker-card-all') )()`);
	report.mainCardAfterAllPick = await page.evaluate(`(() => !!document.querySelector('.lg-picker-card:not(.lg-picker-card-all)') )()`);

	// restore the original model, then close
	await page.evaluate(`(() => {
		const ctx = window.__lgCtx;
		ctx.get('modelDirectories').directoryFor(${JSON.stringify(before.key)}).select(${JSON.stringify(before.current)});
		return 1;
	})()`);
	await new Promise((r) => setTimeout(r, 800));
	await close();
	report.restored = await page.evaluate(`(() => {
		const ctx = window.__lgCtx;
		return ctx.get('modelDirectories').directoryFor(${JSON.stringify(before.key)}).store.getSnapshot().current;
	})()`);

	const pass =
		report.unionHasCurrent &&
		report.mainCardOpenAfterPick &&
		report.gapOk &&
		report.allCardAfterAllPick === false &&
		report.mainCardAfterAllPick === true &&
		report.restored && report.restored.model === before.current.model;
	console.log(JSON.stringify(report, null, 2));
	console.log(pass ? 'SELECT-BEHAVIOR PASS' : 'SELECT-BEHAVIOR FAIL');
} finally {
	await b.close();
	process.exit(0);
}
