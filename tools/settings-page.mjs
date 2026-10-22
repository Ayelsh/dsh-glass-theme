/**
 * Acceptance probe for the skin's settings page.
 *
 * Three things can be wrong and they fail differently:
 *   1. the page never appears in the settings nav  -> a slot registration fault
 *   2. the page appears but lists nothing          -> the provider read fault
 *   3. the switches do not write                   -> the persistence fault
 *
 *   node tools/settings-page.mjs [--url ...] [--shot]
 */
import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = (() => {
	const at = process.argv.indexOf('--url');
	return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : 'http://127.0.0.1:54810/';
})();
const KEY = 'dsh-glass-theme:quick-providers';

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = cookie.indexOf('=');
const b = await launch({ headless: true, width: 1400, height: 950 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const press = async (page, selector, byText) => {
	const at = await page.evaluate(
		byText === undefined
			? `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`
			: `(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find((n) => n.textContent.trim().indexOf(${JSON.stringify(byText)}) === 0); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`
	);
	if (at === null) return false;
	await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
	await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });
	await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
	await wait(900);
	return true;
};

let failed = 0;
const check = (label, ok, extra) => {
	console.log((ok ? 'ok   ' : 'FAIL ') + label + (extra === undefined ? '' : ' — ' + JSON.stringify(extra)));
	if (!ok) failed += 1;
};

try {
	const page = await b.newPage();
	await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1), domain: '127.0.0.1', path: '/' });
	await page.goto(URL_BASE, { settleMs: 12000 });
	await page.evaluate(`(() => { try { window.localStorage.removeItem(${JSON.stringify(KEY)}); } catch (e) {} })()`);
	await page.evaluate(`(() => { const row = document.querySelector('[class*=hIlkoa_sessionRow]:not([class*=selected])'); if (row) row.click(); })()`);
	await wait(4500);

	check('account trigger: pressable', await press(page, '[class*="ET65mq_trigger"]'));
	check('settings entry: pressable', await press(page, '[role=menuitem],[class*="_item_"]', '设置'));
	await wait(2500);

	const nav = await page.evaluate(`(() => [...document.querySelectorAll('[class*=wCInkW_navCell]')].map((n) => n.textContent.trim()))()`);
	check('nav: the skin page is listed', nav.indexOf('Liquid Glass') >= 0, nav);

	check('nav cell: pressable', await press(page, '[class*=wCInkW_navCell]', 'Liquid Glass'));
	await wait(1600);

	const page1 = await page.evaluate(`(() => {
    const root = document.querySelector('.lg-settings');
    if (root === null) return { present: false };
    const title = root.querySelector('.lg-settings-title');
    const rows = [...root.querySelectorAll('.lg-settings-row')];
    const scroller = root.closest('[class*=wCInkW_content]') || root.parentElement;
    const rs = root.getBoundingClientRect();
    const board = root.querySelector('.lg-settings-board');
    const meter = root.querySelector('.lg-settings-meter');
    const bs = board ? board.getBoundingClientRect() : null;
    return {
      present: true,
      title: title ? title.textContent : null,
      titleSize: title ? getComputedStyle(title).fontSize + '/' + getComputedStyle(title).fontWeight : null,
      rows: rows.length,
      names: rows.map((r) => (r.querySelector('.lg-settings-name') || {}).textContent),
      notes: rows.map((r) => (r.querySelector('.lg-settings-note') || {}).textContent),
      switches: rows.map((r) => { const s = r.querySelector('.lg-settings-switch'); return s ? s.getAttribute('aria-checked') : null; }),
      /* The redesigned board: one material object per page, lit from inside. */
      board: board ? (() => {
        const s = getComputedStyle(board);
        return {
          glass: s.backdropFilter !== 'none' || s.webkitBackdropFilter !== undefined,
          blur: s.backdropFilter,
          radius: s.borderRadius,
          glyph: board.querySelectorAll('.lg-settings-glyph').length,
          rowsInBoard: board.querySelectorAll('.lg-settings-row').length,
          foot: board.querySelector('.lg-settings-foot') !== null,
          box: bs ? [Math.round(bs.x), Math.round(bs.y), Math.round(bs.width), Math.round(bs.height)] : null,
        };
      })() : null,
      glow: root.querySelector('.lg-settings-glow') !== null,
      meter: meter
        ? {
            full: meter.getAttribute('data-full'),
            pips: meter.querySelectorAll('.lg-settings-pip').length,
            pipsOn: meter.querySelectorAll('.lg-settings-pip[data-on=true]').length,
            count: (meter.querySelector('.lg-settings-count') || {}).textContent,
          }
        : null,
      box: [Math.round(rs.x), Math.round(rs.y), Math.round(rs.width), Math.round(rs.height)],
      scrollerBox: scroller ? (() => { const c = scroller.getBoundingClientRect(); return [Math.round(c.x), Math.round(c.y), Math.round(c.width), Math.round(c.height)]; })() : null,
      overflowX: scroller ? scroller.scrollWidth > scroller.clientWidth : null
    };
  })()`);
	check('page: renders', page1.present === true);
	if (page1.present) {
		check('page: titled', page1.title === '快捷供应商', page1.title);
		check('page: heading is a page heading', page1.titleSize === '17px/640', page1.titleSize);
		/* The provider count is whatever the account has — assert a non-empty
		   list, not a magic number. */
		check('page: lists the providers', page1.rows >= 1, page1.rows);
		check('page: every row names a provider and a count', page1.notes.every((n) => typeof n === 'string' && n.indexOf('个模型') > 0), page1.notes);
		check('page: nothing selected yet', page1.switches.every((v) => v === 'false'), page1.switches);
		check('page: fits its scroller', page1.overflowX === false && page1.box[2] <= page1.scrollerBox[2], [page1.box, page1.scrollerBox]);
		/* The board carries the page: every row lives inside it, each row has a
		   glyph, the pane is actual frosted glass, and the light field exists. */
		check('page: board present and glassy', page1.board !== null && String(page1.board.blur).indexOf('blur') === 0, page1.board && page1.board.blur);
		check('page: board holds every row', page1.board && page1.board.rowsInBoard === page1.rows, page1.board && [page1.board.rowsInBoard, page1.rows]);
		check('page: every row has a glyph', page1.board && page1.board.glyph === page1.rows, page1.board && [page1.board.glyph, page1.rows]);
		check('page: board has a foot', page1.board && page1.board.foot === true);
		check('page: light field present', page1.glow === true);
		check('page: meter matches the count', page1.meter && page1.meter.pips === 4 && page1.meter.pipsOn === 0 && page1.meter.full === 'false' && page1.meter.count === '0 / 4', page1.meter);
	}

	// ---- a switch writes ------------------------------------------------
	check('switch: pressable', await press(page, '.lg-settings-row .lg-settings-switch'));
	await wait(500);
	const after = await page.evaluate(`(() => {
    const raw = window.localStorage.getItem(${JSON.stringify(KEY)});
    const root = document.querySelector('.lg-settings');
    const onRow = root ? root.querySelector('.lg-settings-row[data-on=true]') : null;
    const meter = root ? root.querySelector('.lg-settings-meter') : null;
    return {
      stored: (() => { try { return raw === null ? null : JSON.parse(raw); } catch (e) { return null; } })(),
      rowOn: onRow !== null && onRow.getAttribute('data-on') === 'true',
      glyphLit: onRow !== null && getComputedStyle(onRow.querySelector('.lg-settings-glyph')).color !== getComputedStyle(root.querySelector('.lg-settings-row:not([data-on=true]) .lg-settings-glyph') || onRow.querySelector('.lg-settings-glyph')).color,
      reset: root ? root.querySelector('.lg-settings-reset') !== null : false,
      meterFull: meter ? meter.getAttribute('data-full') : null,
      pipsOn: meter ? meter.querySelectorAll('.lg-settings-pip[data-on=true]').length : 0,
      count: meter && meter.querySelector('.lg-settings-count') ? meter.querySelector('.lg-settings-count').textContent : null
    };
  })()`);
	check('switch: wrote the quick list', Array.isArray(after.stored) && after.stored.length === 1, after.stored);
	/* The selection is legible in three places at once: the row's plate, the
	   meter's pips, and the foot's reset button. */
	check('switch: row reflects selection', after.rowOn === true, after.rowOn);
	check('switch: meter counts the selection', after.pipsOn === 1 && after.count === '1 / 4', [after.pipsOn, after.count]);
	check('switch: reset appears with a selection', after.reset === true, after.reset);

	// ---- the picker honours it without a reload --------------------------
	await page.evaluate(`(() => { const c = document.querySelector('[class*=wCInkW_close], [class*=wCInkW_closeButton]'); if (c) c.click(); })()`);
	await wait(700);
	await page.evaluate(`(() => { const e = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === '关闭设置' || n.getAttribute('aria-label') === 'Close settings'); if (e) e.click(); })()`);
	await wait(900);
	const door = await page.evaluate(`(() => {
    const t = document.querySelector('.lg-picker-trigger');
    if (!t) return { trigger: false };
    const r = t.getBoundingClientRect();
    return { trigger: true, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
	if (door.trigger) {
		for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
			await page.send('Input.dispatchMouseEvent', { type, x: door.x, y: door.y, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
		}
		await wait(900);
		const live = await page.evaluate(`(() => {
      const card = document.querySelector('.lg-picker-card');
      if (!card) return { open: false };
      return {
        open: true,
        groups: [...card.querySelectorAll('.lg-picker-section .lg-picker-headingName')].map((n) => n.textContent),
        more: (card.querySelector('.lg-picker-more') || {}).textContent || null
      };
    })()`);
		check('picker: live update without reload', live.open === true && live.groups.length === 1, live);
		check('picker: shows the door once configured', live.more !== null, live.more);
	} else {
		check('picker: trigger present', false, 'no trigger after closing settings');
	}

	// Leave the profile as it was found: the probe's toggle is a probe, not a choice.
	await page.evaluate(`(() => { try { window.localStorage.removeItem(${JSON.stringify(KEY)}); } catch (e) {} })()`);

	if (process.argv.includes('--shot')) await page.screenshot('G:/dsh-build/research/settings-page.png');
} catch (error) {
	console.log('ERROR ' + (error && error.stack ? error.stack : String(error)));
	failed += 1;
}
console.log(failed === 0 ? 'PASS' : 'FAILED ' + failed);
await b.close().catch(() => {});
process.exit(failed === 0 ? 0 : 1);
