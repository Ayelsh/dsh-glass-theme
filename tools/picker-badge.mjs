#!/usr/bin/env node
/**
 * picker-badge.mjs — measure the picker's search row and price badge.
 *
 * The badge carries three facts (state, factor, countdown). That is more text
 * than a 360px card can hold beside a search field, and when it overflows the
 * card's own padding is the first thing to go — which reads as a clipped chip
 * rather than as a design. This prints every box involved so the fix is a
 * measurement, not a guess.
 *
 * Usage: node tools/picker-badge.mjs [--theme dark|light] [--row N]
 */
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = argv.indexOf('--' + name);
	return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
};

const URL_BASE = arg('url', 'http://127.0.0.1:57736/');
const THEME = arg('theme', 'dark');
const ROW = Number(arg('row', '2'));

const raw = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE], { encoding: 'utf8' }).trim();
const split = raw.indexOf('=');
const name = raw.slice(0, split);
const value = raw.slice(split + 1);

const browser = await launch({ headless: true, width: 1190, height: 900 });
try {
	const page = await browser.newPage();
	await page.cookie({ name, value, domain: '127.0.0.1', path: '/' });
	await page.addInitScript(
		'(() => { const root = document.documentElement; if (root === null) return; root.setAttribute("data-platform", "win32"); root.setAttribute("data-windows-titlebar", ""); })()'
	);
	await page.goto(URL_BASE, { settleMs: 9000 });
	if (THEME === 'light') await page.evaluate('document.body.removeAttribute("data-ds-dark-theme")');
	else await page.evaluate('document.body.setAttribute("data-ds-dark-theme", "")');

	await page.evaluate(
		`(() => { const rows = document.querySelectorAll('[class*=hIlkoa_sessionRow]'); const el = rows[${ROW}]; if (el) el.click(); return true })()`
	);
	await new Promise((r) => setTimeout(r, 6000));

	const opened = await page.evaluate(
		`(() => { const t = document.querySelector('.lg-picker-trigger'); if (!t) return 'no trigger'; const b = t.getBoundingClientRect(); return JSON.stringify({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }) })()`
	);
	if (typeof opened !== 'string' || opened[0] !== '{') throw new Error('trigger missing: ' + opened);
	const point = JSON.parse(opened);
	await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
	await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
	await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
	await new Promise((r) => setTimeout(r, 900));

	const report = await page.evaluate(`(() => {
		const card = document.querySelector('.lg-picker-card');
		if (!card) return JSON.stringify({ open: false });
		const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } };
		const search = card.querySelector('.lg-picker-search');
		const input = card.querySelector('.lg-picker-search input');
		const badge = card.querySelector('.lg-picker-badge');
		const dot = card.querySelector('.lg-picker-badge-dot');
		const cardBox = box(card);
		const badgeBox = box(badge);
		const searchBox = box(search);
		const searchStyle = search ? getComputedStyle(search) : null;
		const badgeStyle = badge ? getComputedStyle(badge) : null;
		return JSON.stringify({
			open: true,
			card: cardBox,
			search: searchBox,
			searchPad: searchStyle ? searchStyle.padding : null,
			searchDisplay: searchStyle ? searchStyle.display : null,
			input: box(input),
			badge: badgeBox,
			badgeText: badge ? badge.textContent : null,
			badgeScrollW: badge ? badge.scrollWidth : null,
			badgeClientW: badge ? badge.clientWidth : null,
			badgeWhiteSpace: badgeStyle ? badgeStyle.whiteSpace : null,
			badgeOverflow: badgeStyle ? badgeStyle.overflow : null,
			dot: box(dot),
			cardPadRight: getComputedStyle(card).paddingRight,
			rightGap: badgeBox && cardBox ? Math.round((cardBox.x + cardBox.w) - (badgeBox.x + badgeBox.w)) : null,
			searchRightGap: searchBox && cardBox ? Math.round((cardBox.x + cardBox.w) - (searchBox.x + searchBox.w)) : null,
		}, null, 2);
	})()`);

	const data = JSON.parse(report);
	if (!data.open) {
		console.log('card did not open');
		process.exitCode = 1;
	} else {
		console.log('theme ' + THEME);
		console.log('card        ' + JSON.stringify(data.card) + '  padRight ' + data.cardPadRight);
		console.log('search      ' + JSON.stringify(data.search) + '  pad ' + data.searchPad + ' display ' + data.searchDisplay);
		console.log('  rightGap  ' + data.searchRightGap + 'px to the card edge');
		console.log('input       ' + JSON.stringify(data.input));
		console.log('badge       ' + JSON.stringify(data.badge) + '  rightGap ' + data.rightGap + 'px');
		console.log('  text      ' + JSON.stringify(data.badgeText));
		console.log('  content   ' + data.badgeClientW + ' / scroll ' + data.badgeScrollW + '  ws ' + data.badgeWhiteSpace + ' overflow ' + data.badgeOverflow);
		console.log('dot         ' + JSON.stringify(data.dot));
		if (data.rightGap !== null && data.rightGap < 0) {
			console.log('\nDEFECT: the badge is ' + Math.abs(data.rightGap) + 'px outside the card');
			process.exitCode = 1;
		}
		const shot = arg('shot', '');
		if (shot !== '') {
			/* A full-viewport capture, NOT a crop around the card: a crop hides the
			   question this probe exists to answer, namely whether the card itself
			   clips its content or only the picture did. */
			await page.screenshot(shot + '.png', {});
			console.log('\nshot ' + shot + '.png (full viewport)');
		}
	}
} finally {
	await browser.close();
}
