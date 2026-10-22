#!/usr/bin/env node
/**
 * picker-rows.mjs — report the decorated rows of the ported model picker.
 *
 * The picker is our own React tree, so the interesting questions are DOM
 * questions: did the multiplier get split out of the name, is it INLINE (a
 * block would drop to its own line and read as a subtitle), and does every row
 * carry a description. Screenshots of a dark glass card over a dark page are a
 * poor instrument for those.
 *
 * Usage: node tools/picker-rows.mjs [--theme dark|light] [--row N] [--limit N]
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
const LIMIT = Number(arg('limit', '8'));

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
		const box = card.getBoundingClientRect();
		const sections = [...card.querySelectorAll('.lg-picker-section')];
		const out = [];
		let rows = 0;
		let noDesc = 0;
		let multBlock = 0;
		for (const section of sections) {
			const heading = section.querySelector('.lg-picker-heading');
			const items = [...section.querySelectorAll('.lg-picker-option')];
			const sample = items.slice(0, 3).map((item) => {
				const nameEl = item.querySelector('.lg-picker-name');
				const multEl = item.querySelector('.lg-picker-mult');
				const descEl = item.querySelector('.lg-picker-desc');
				if (!descEl) noDesc++;
				let mult = null;
				if (multEl) {
					const style = getComputedStyle(multEl);
					if (style.display !== 'inline-block' && style.display !== 'inline') multBlock++;
					const mb = multEl.getBoundingClientRect();
					const nb = nameEl.getBoundingClientRect();
					mult = { text: multEl.textContent, display: style.display, w: Math.round(mb.width), h: Math.round(mb.height), nameH: Math.round(nb.height) };
				}
				return {
					name: nameEl ? nameEl.textContent.replace(multEl ? multEl.textContent : '', '').trim() : null,
					desc: descEl ? descEl.textContent : null,
					mult,
					descCut: descEl ? descEl.scrollWidth - descEl.clientWidth : 0,
					nameCut: nameEl ? nameEl.scrollWidth - nameEl.clientWidth : 0,
				};
			});
			rows += items.length;
			out.push({ heading: heading ? heading.textContent : null, count: items.length, sample });
		}
		return JSON.stringify({
			open: true,
			box: [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)],
			cardRadius: getComputedStyle(card).borderRadius,
			rows,
			noDesc,
			multBlock,
			sections: out,
		}, null, 2);
	})()`);

	const data = JSON.parse(report);
	console.log('theme ' + THEME + ' · viewport 1190x900');
	console.log('card ' + JSON.stringify(data.box) + ' radius ' + data.cardRadius);
	console.log('rows ' + data.rows + ' · without description ' + data.noDesc + ' · mult not inline ' + data.multBlock);
	for (const section of data.sections) {
		console.log('\n' + section.heading + '  (' + section.count + ')');
		for (const item of section.sample) {
			const mult = item.mult ? ' [' + item.mult.text + ' ' + item.mult.display + ' ' + item.mult.w + 'x' + item.mult.h + ' nameH ' + item.mult.nameH + ']' : '';
			const cut = item.descCut > 0 || item.nameCut > 0 ? '  CUT name+' + item.nameCut + ' desc+' + item.descCut : '';
			console.log('  ' + String(item.name) + mult + cut);
			console.log('    ' + String(item.desc));
		}
	}
	if (data.noDesc > 0 || data.multBlock > 0) process.exitCode = 1;
} finally {
	await browser.close();
}
