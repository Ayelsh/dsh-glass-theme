/**
 * Diagnose the "所有供应商" door: press it and print whatever the page reports.
 * Kept separate from two-level.mjs because that probe asserts behaviour; this
 * one exists to explain a failure.
 */
import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = 'http://127.0.0.1:54810/';
const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = cookie.indexOf('=');
const b = await launch({ headless: true, width: 1400, height: 950 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
	const page = await b.newPage();
	await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1), domain: '127.0.0.1', path: '/' });
	await page.goto(URL_BASE, { settleMs: 12000 });
	await page.evaluate(`(() => { try { window.localStorage.setItem('dsh-glass-theme:quick-providers', JSON.stringify({ providers: ['workbuddy'], models: {} })); } catch (e) {} })()`);
	await page.goto(URL_BASE, { settleMs: 9000 });
	await page.evaluate(`(() => { const row = document.querySelector('[class*=hIlkoa_sessionRow]:not([class*=selected])'); if (row) row.click(); })()`);
	await wait(4500);

	const at = await page.evaluate(`(() => { const t = document.querySelector('.lg-picker-trigger'); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	console.log('TRIGGER', JSON.stringify(at));
	for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
		await page.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
	}
	await wait(900);
	console.log('CARD', await page.evaluate(`(() => {
    const c = document.querySelector('.lg-picker-card');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    const parent = c.parentElement;
    return {
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      inlineStyle: c.getAttribute('style'),
      position: cs.position, top: cs.top, left: cs.left, visibility: cs.visibility,
      viewport: [window.innerWidth, window.innerHeight],
      parent: parent ? parent.tagName + '.' + parent.className : null,
      bodyScroll: [document.documentElement.scrollTop, document.body.scrollTop],
      bodyTransform: getComputedStyle(document.body).transform,
      htmlZoom: getComputedStyle(document.documentElement).zoom || null
    };
  })()`));

	const door = await page.evaluate(`(() => {
    const cards = [...document.querySelectorAll('.lg-picker-card')].map((c) => { const r = c.getBoundingClientRect(); return { box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], style: c.getAttribute('style'), cls: c.className, doors: c.querySelectorAll('.lg-picker-more').length }; });
    const all = [...document.querySelectorAll('.lg-picker-more')].map((m) => { const r = m.getBoundingClientRect(); return { box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], inCard: !!m.closest('.lg-picker-card') }; });
    const m = document.querySelector('.lg-picker-more');
    if (!m) return { cards, all, missing: true };
    const r = m.getBoundingClientRect();
    return { cards, all, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
	console.log('DOOR', JSON.stringify(door));
	if (!door) throw new Error('no door button');

	// What is actually on top at the door's centre?
	console.log('HIT', await page.evaluate(`(() => { const e = document.elementFromPoint(${door.x}, ${door.y}); if (!e) return null; const p = e.closest('button'); return { tag: e.tagName, cls: e.className, inDoor: !!(p && p.className && String(p.className).indexOf('lg-picker-more') >= 0), inCard: !!e.closest('.lg-picker-card') }; })()`));

	const before = (page.console || []).length;
	for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
		await page.send('Input.dispatchMouseEvent', { type, x: door.x, y: door.y, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
	}
	await wait(1000);
	console.log('AFTER', await page.evaluate(`(() => ({ card: !!document.querySelector('.lg-picker-card'), all: !!document.querySelector('.lg-picker-card-all'), bodyKids: document.body.querySelectorAll('.lg-picker-card-all').length }))()`));
	console.log('CONSOLE', JSON.stringify((page.console || []).slice(before)));
	console.log('ERRORS', JSON.stringify((page.errors || []).slice(-6)));
} catch (error) {
	console.log('ERROR', error && error.stack ? error.stack : String(error));
} finally {
	await b.close().catch(() => {});
	process.exit(0);
}
