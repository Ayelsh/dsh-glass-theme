/**
 * Acceptance probe for the two-level model picker.
 *
 * The requirement has three states and each is a different failure:
 *   1. nothing configured  -> every provider, and NO "all providers" door
 *   2. something configured -> only those providers, plus the door
 *   3. door pressed        -> a second card listing everything
 *
 * It sets localStorage directly rather than driving the settings page, because
 * the settings page is a separate acceptance question; this probe is about what
 * the picker does with the value.
 *
 *   node tools/two-level.mjs [--url ...] [--theme dark|light]
 */
import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const arg = (name, fallback) => {
	const at = process.argv.indexOf('--' + name);
	return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};
const URL_BASE = arg('url', 'http://127.0.0.1:54810/');
const THEME = arg('theme', 'dark');

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = cookie.indexOf('=');

const b = await launch({ headless: true, width: 1400, height: 950 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `(() => {
  const card = document.querySelector('.lg-picker-card:not(.lg-picker-card-all)');
  const all = document.querySelector('.lg-picker-card-all');
  if (card === null) return { open: false };
  const groups = [...card.querySelectorAll('.lg-picker-section')].map((s) => ({
    name: (s.querySelector('.lg-picker-headingName') || {}).textContent || '',
    rows: s.querySelectorAll('.lg-picker-option').length,
    visible: [...s.querySelectorAll('.lg-picker-option')].filter((o) => o.getBoundingClientRect().height > 0).length
  }));
  const more = card.querySelector('.lg-picker-more');
  const out = { open: true, groups, more: more === null ? null : more.textContent };
  if (all !== null) {
    const r = all.getBoundingClientRect();
    out.all = {
      groups: [...all.querySelectorAll('.lg-picker-section')].map((s) => ({
        name: (s.querySelector('.lg-picker-headingName') || {}).textContent || '',
        rows: s.querySelectorAll('.lg-picker-option').length
      })),
      search: (all.querySelector('input[type=search]') || {}).placeholder || null,
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      radius: getComputedStyle(all).borderRadius,
      backdrop: getComputedStyle(all).backdropFilter,
      bg: getComputedStyle(all).backgroundColor,
      overlaps: (() => { const a = all.getBoundingClientRect(), c = card.getBoundingClientRect();
        return !(a.right <= c.left || a.left >= c.right || a.bottom <= c.top || a.top >= c.bottom) })()
    };
  }
  return out;
})()`;

async function openPicker(page) {
	/* ONE activation only. A synthetic click plus a real press is two toggles,
	   which opens and immediately closes the card — the probe then reports "the
	   card does not open" for a card that opened fine. */
	const at = await page.evaluate(`(() => {
    const t = document.querySelector('.lg-picker-trigger');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
	if (at === null) return null;
	await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
	await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });
	await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
	await wait(900);
	return page.evaluate(PROBE);
}

async function press(page, selector) {
	const at = await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	if (at === null) return false;
	await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
	await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });
	await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
	await wait(700);
	return true;
}

let failed = 0;
const check = (label, ok, extra) => {
	console.log((ok ? 'ok   ' : 'FAIL ') + label + (extra === undefined ? '' : ' — ' + JSON.stringify(extra)));
	if (!ok) failed += 1;
};

/* Each state change needs a fresh load: the picker reads the list once per
   mount, and going back to the same URL is the cheapest faithful reload. */
async function reload(page) {
	await page.goto(URL_BASE, { settleMs: 9000 });
	await page.evaluate(`(() => { const row = document.querySelector('[class*=hIlkoa_sessionRow]:not([class*=selected])'); if (row) row.click(); })()`);
	await wait(4000);
}

try {
	const page = await b.newPage();
	await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1), domain: '127.0.0.1', path: '/' });
	await page.addInitScript(`(() => {
    /* The host re-applies the user's saved theme some time after
       DOMContentLoaded, so a one-shot flip loses the race; keep enforcing
       the probe's theme for the life of the page. */
    setInterval(() => {
      const b = document.body;
      if (!b) return;
      if ('${THEME}' === 'light') {
        b.removeAttribute('data-ds-dark-theme');
        document.documentElement.removeAttribute('data-ds-dark-theme');
      } else {
        b.setAttribute('data-ds-dark-theme', '1');
        document.documentElement.setAttribute('data-ds-dark-theme', '1');
      }
    }, 250);
  })()`);
	await page.goto(URL_BASE, { settleMs: 12000 });

	// A session is where the composer exists; the hero page has no trigger.
	await page.evaluate(`(() => { const row = document.querySelector('[class*=hIlkoa_sessionRow]:not([class*=selected])'); if (row) row.click(); })()`);
	await wait(5000);

	// ---- state 1: nothing configured -------------------------------------
	await page.evaluate(`(() => { try { window.localStorage.removeItem('dsh-glass-theme:quick-providers'); } catch (e) {} })()`);
	await reload(page);
	let state = await openPicker(page);
	/* The provider census is data, not a constant: the live directory has
	   grown before (6 → 8 groups, 40 → 52 rows). Pin the door's counts to
	   what the unconfigured pass itself counted, not to history. */
	let everyCount = 0;
	let everyRows = 0;
	check('unconfigured: card opens', state !== null && state.open === true, state === null ? 'no trigger' : state.open === false ? 'card stayed shut' : (state.groups || []).length);
	if (state && state.open) {
		everyCount = state.groups.length;
		everyRows = state.groups.reduce((n, g) => n + g.rows, 0);
		check('unconfigured: lists every provider', state.groups.length > 1, state.groups.map((g) => g.name));
		check('unconfigured: no "all providers" door', state.more === null, state.more);
	}

	// ---- state 2: one provider pinned ------------------------------------
	await page.evaluate(`(() => { try { window.localStorage.setItem('dsh-glass-theme:quick-providers', JSON.stringify({ providers: ['workbuddy'], models: {} })); } catch (e) {} })()`);
	await reload(page);
	state = await openPicker(page);
	check('configured: card opens', state !== null && state.open === true);
	if (state && state.open) {
		/* The pinned set no longer stands alone: the session's current model
		   may live outside it, and its provider's group is shown beside the
		   pinned ones (m00550). Expect exactly [pinned..., current?]. */
		const currentProvider = await page.evaluate(`(() => { try { const ctx = window.__lgCtx; const v = ctx.get('uiSession').current.value; const c = ctx.get('modelDirectories').directoryFor(v.key).store.getSnapshot().current; return c ? c.provider : null; } catch (e) { return null; } })()`);
		const slug = (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
		const expected = (currentProvider && slug(currentProvider) !== 'workbuddy' ? [currentProvider] : []).concat(['workbuddy']);
		const names = state.groups.map((g) => g.name);
		check('configured: pinned providers plus the current one', names.length === expected.length && names.every((n, i) => slug(n) === slug(expected[i])), names);
		check('configured: rows are visible', state.groups[0] && state.groups[0].visible === state.groups[0].rows && state.groups[0].rows > 0, state.groups[0]);
		check('configured: the door is present', state.more !== null && state.more.indexOf('所有供应商') === 0, state.more);
		check('configured: door names the total', state.more !== null && state.more.indexOf(String(everyCount)) >= 0, state.more);
	}

	// ---- state 3: the second card ----------------------------------------
	const pressed = await press(page, '.lg-picker-more');
	check('door: pressable', pressed === true);
	state = await page.evaluate(PROBE);
	check('all card: opened', !!(state && state.all), state && state.all ? state.all.groups.length : 'absent');
	if (state && state.all) {
		check('all card: lists every provider', state.all.groups.length === everyCount, state.all.groups.map((g) => g.name));
		check('all card: every row', state.all.groups.reduce((n, g) => n + g.rows, 0) === everyRows, state.all.groups.reduce((n, g) => n + g.rows, 0));
		check('all card: has its own search', state.all.search === '搜索全部模型', state.all.search);
		check('all card: glass material', state.all.backdrop.indexOf('blur') >= 0 && state.all.radius === '18px', [state.all.backdrop, state.all.radius]);
		check('all card: does not cover the first card', state.all.overlaps === false, state.all.box);
	}
	check('first card: still open behind the second', !!(state && state.open), state && state.open);

	if (process.argv.includes('--shot')) {
		await page.screenshot('G:/dsh-build/research/' + (THEME === 'dark' ? 'tl-dark' : 'tl-light') + '.png');
	}
} catch (error) {
	console.log('ERROR ' + (error && error.stack ? error.stack : String(error)));
	failed += 1;
}
console.log(failed === 0 ? 'PASS' : 'FAILED ' + failed);
await b.close().catch(() => {});
process.exit(failed === 0 ? 0 : 1);
