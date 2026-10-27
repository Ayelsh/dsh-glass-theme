/**
 * Acceptance probe for the skin's settings page.
 *
 * Things that can be wrong, and how they fail here:
 *   1. the page never appears in the settings nav   -> a slot registration fault
 *   2. the page appears but lists nothing           -> the provider read fault
 *   3. the switches do not write the host entry     -> the persistence fault
 *   4. the browser mirror diverges from the host    -> the projection fault
 *   5. the model drill-down does not round-trip     -> the selection fault
 *   6. the workspace switch leaves the rail behind  -> the registration fault
 *   7. the picker ignores the (provider, model) set -> the filtering fault
 *
 * The selectors are looked up by role and aria-label on purpose: the shell's
 * hashed class names change between builds, the accessible names do not.
 *
 *   node tools/settings-page.mjs [--url ...] [--shot]
 */
import { launch } from './cdp.mjs';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';

const at = (name) => {
	const i = process.argv.indexOf(name);
	return i > 0 ? process.argv[i + 1] : undefined;
};
const URL_BASE = at('--url') ?? process.env.LG_URL ?? 'http://127.0.0.1:54810/';
const CHROME = process.env.LG_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(at('--cdp-port') ?? 9500 + (process.pid % 400));
const KEY = 'dsh-glass-theme:quick-providers';
const NS = 'ui-skin-glass-theme';

/* The cookie is minted in process on purpose: piping it through a child
   (`auth-cookie.mjs`) breaks under sandboxes that deny named pipes, and the
   mint is ten lines. */
const mintCookie = () => {
	const authority = new URL(URL_BASE).host;
	const home = process.env.DSH_HOME ?? resolve(homedir(), '.dsh');
	const yaml = readFileSync(resolve(home, '.credentials.yaml'), 'utf8');
	const line = yaml.split(/\r?\n/).find((l) => l.trim().startsWith('secret:'));
	const secret = Buffer.from(line.split('secret:')[1].trim(), 'base64url');
	const b64u = (buf) => Buffer.from(buf).toString('base64url');
	const name = 'dsh-auth-' + createHash('sha256').update(authority).digest('base64url');
	const now = Date.now();
	const payload = { version: 1, authority, issuedAt: now, expiresAt: now + 3600 * 1000 };
	const body = b64u(Buffer.from(JSON.stringify(payload), 'utf8'));
	const sig = b64u(createHmac('sha256', secret).update(body).digest());
	return { name, value: `v1.${body}.${sig}` };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Chrome is spawned directly for the same reason: `launch()` alone cannot
   keep the browser alive under a sandbox that reaps its crashpad child. */
let chrome = null;
const startChrome = async () => {
	const ud = resolve(tmpdir(), 'dsh-glass-settings-ud-' + PORT);
	mkdirSync(ud, { recursive: true });
	chrome = spawn(
		CHROME,
		[
			'--headless=new',
			'--no-sandbox',
			'--disable-crash-reporter',
			'--disable-breakpad',
			'--disable-gpu',
			'--no-first-run',
			'--no-default-browser-check',
			'--disable-extensions',
			'--disable-background-networking',
			'--disable-features=Translate,MediaRouter',
			'--hide-scrollbars',
			`--remote-debugging-port=${PORT}`,
			`--user-data-dir=${ud}`,
			'--window-size=1400,950',
			'about:blank',
		],
		{ stdio: 'ignore', detached: false }
	);
	chrome.on('error', () => {});
	for (let i = 0; i < 300; i++) {
		try {
			const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
			if (res.ok) return launch({ port: PORT });
		} catch {
			/* not up yet */
		}
		await sleep(200);
	}
	throw new Error('chrome never exposed ' + PORT);
};

let failed = 0;
const check = (label, ok, extra) => {
	console.log((ok ? 'ok   ' : 'FAIL ') + label + (extra === undefined ? '' : ' — ' + JSON.stringify(extra)));
	if (!ok) failed += 1;
};

const b = await startChrome();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* The settings page re-renders from the host echo, and one interaction can
   be two sequential writes (providers, then models) — so poll for the
   expected state instead of sleeping a magic number. */
const settle = async (page, expression, timeout = 6000) => {
	for (let i = 0; i < timeout / 200; i++) {
		const value = await page.evaluate(expression);
		if (value) return value;
		await wait(200);
	}
	return null;
};

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

/* The one-shot preview dialog some profiles show on first boot. */
const dismissPreview = async (page) => {
	await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.textContent.trim() === '继续'); if (b) b.click(); })()`);
	await wait(500);
};

const openSettings = async (page) => {
	check('account trigger: pressable', await press(page, '[aria-label="账号菜单"], [class*="_trigger_"]'));
	check('settings entry: pressable', await press(page, '[role=menuitem],[class*="_item_"]', '设置'));
	await wait(2200);
};

const openSkinPage = async (page) => {
	await openSettings(page);
	const nav = await page.evaluate(`(() => [...document.querySelectorAll('[class*=navCell]')].map((n) => n.textContent.trim()))()`);
	check('nav: the skin page is listed', nav.indexOf('Liquid Glass') >= 0, nav);
	check('nav cell: pressable', await press(page, '[class*=navCell]', 'Liquid Glass'));
	await wait(1500);
};

const closeSettings = async (page) => {
	await press(page, '[class*=close]', '关闭');
	await wait(700);
};

/* Host truth, read the same way the adapter reads it. */
const HOST_SNAPSHOT = `(() => {
  try {
    const forms = window.__lgCtx.get('configForms');
    const controller = forms && forms.get(${JSON.stringify(NS)});
    const snap = controller && controller.getSnapshot();
    if (!snap || snap.status !== 'ready') return null;
    return { qp: snap.value.quickProviders, qm: snap.value.quickModels, ws: snap.value.workspaceView };
  } catch (e) { return null; }
})()`;
const host = async (page) => page.evaluate(HOST_SNAPSHOT);
const resetHost = async (page) => {
	await page.evaluate(`(async () => {
  const forms = window.__lgCtx.get('configForms');
  const controller = forms && forms.get(${JSON.stringify(NS)});
  if (!controller) return;
  await controller.set('quickProviders', []);
  await controller.set('quickModels', {});
  await controller.set('workspaceView', true);
})()`);
	await wait(500);
};

const railRows = `(() => [...document.querySelectorAll('nav [class*=panelRow]')].map((n) => (n.textContent || '').trim()))()`;

try {
	const page = await b.newPage();
	const c = mintCookie();
	await page.cookie({ name: c.name, value: c.value, domain: new URL(URL_BASE).hostname, path: '/' });
	await page.goto(URL_BASE, { settleMs: 12000 });
	await dismissPreview(page);

	// ---- a known starting point: the host entry cleared, the mirror gone ----
	await resetHost(page);
	await page.evaluate(`(() => { try { window.localStorage.removeItem(${JSON.stringify(KEY)}); } catch (e) {} })()`);
	await page.goto(URL_BASE, { settleMs: 12000 });
	await dismissPreview(page);
	const clean = await host(page);
	check('setup: host entry cleared', clean !== null && Array.isArray(clean.qp) && clean.qp.length === 0 && clean.qp && Object.keys(clean.qm).length === 0, clean);

	/* The picker's running model decides which row the drill-down unchecks:
	   leaving exactly the current model selected is what separates a real
	   subset filter from the old provider-only filter on a two-model
	   provider (both would render the same two rows otherwise). */
	await press(page, '.lg-picker-trigger');
	const currentModel = await page.evaluate(`(() => {
    const card = document.querySelector('.lg-picker-card');
    if (!card) return null;
    const on = [...card.querySelectorAll('[role=menuitemradio]')].find((o) => o.getAttribute('aria-checked') === 'true');
    if (!on) return null;
    return (on.querySelector('.lg-picker-name') || {}).textContent || null;
  })()`);
	await press(page, '.lg-picker-trigger');
	await wait(400);

	await openSkinPage(page);

	const page1 = await page.evaluate(`(() => {
    const root = document.querySelector('.lg-settings');
    if (root === null) return { present: false };
    const title = root.querySelector('.lg-settings-title');
    const rows = [...root.querySelectorAll('.lg-settings-row')];
    const scroller = root.closest('[class*=content]') || root.parentElement;
    const rs = root.getBoundingClientRect();
    const board = root.querySelector('.lg-settings-board');
    const meter = root.querySelector('.lg-settings-meter');
    const utility = root.querySelector('.lg-settings-utility');
    const bs = board ? board.getBoundingClientRect() : null;
    return {
      present: true,
      title: title ? title.textContent : null,
      titleSize: title ? getComputedStyle(title).fontSize + '/' + getComputedStyle(title).fontWeight : null,
      rows: rows.length,
      notes: rows.map((r) => (r.querySelector('.lg-settings-note') || {}).textContent),
      switches: rows.map((r) => { const s = r.querySelector('.lg-settings-switch'); return s ? s.getAttribute('aria-checked') : null; }),
      doors: rows.map((r) => { const d = r.querySelector('.lg-settings-modelDoor'); return d ? { disabled: d.disabled, label: d.getAttribute('aria-label') } : null; }),
      utility: utility
        ? {
            name: (utility.querySelector('.lg-settings-name') || {}).textContent,
            checked: (utility.querySelector('.lg-settings-switch') || {}).getAttribute ? utility.querySelector('.lg-settings-switch').getAttribute('aria-checked') : null,
          }
        : null,
      board: board ? (() => {
        const s = getComputedStyle(board);
        return {
          glass: s.backdropFilter !== 'none',
          blur: s.backdropFilter,
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
		check('page: doors closed while unpinned', page1.doors.every((d) => d && d.disabled === true), page1.doors);
		check('page: workspace row on by default', page1.utility !== null && page1.utility.name === '工作空间' && page1.utility.checked === 'true', page1.utility);
		check('page: fits its scroller', page1.overflowX === false && page1.box[2] <= page1.scrollerBox[2], [page1.box, page1.scrollerBox]);
		check('page: board present and glassy', page1.board !== null && String(page1.board.blur).indexOf('blur') === 0, page1.board && page1.board.blur);
		check('page: board holds every row', page1.board && page1.board.rowsInBoard === page1.rows, page1.board && [page1.board.rowsInBoard, page1.rows]);
		check('page: every row has a glyph', page1.board && page1.board.glyph === page1.rows, page1.board && [page1.board.glyph, page1.rows]);
		check('page: board has a foot', page1.board && page1.board.foot === true);
		check('page: light field present', page1.glow === true);
		check('page: meter matches the count', page1.meter && page1.meter.pips === 4 && page1.meter.pipsOn === 0 && page1.meter.full === 'false' && page1.meter.count === '0 / 4', page1.meter);
	}

	// ---- a switch writes both the host entry and the mirror ----------------
	check('switch: pressable', await press(page, '.lg-settings-row .lg-settings-switch'));
	await settle(
		page,
		`(() => {
    const raw = window.localStorage.getItem(${JSON.stringify(KEY)});
    try { return JSON.parse(raw).providers.length === 1; } catch (e) { return false; }
  })()`
	);
	const after = await page.evaluate(`(() => {
    const raw = window.localStorage.getItem(${JSON.stringify(KEY)});
    const root = document.querySelector('.lg-settings');
    const onRow = root ? root.querySelector('.lg-settings-row[data-on=true]') : null;
    const meter = root ? root.querySelector('.lg-settings-meter') : null;
    const door = onRow ? onRow.querySelector('.lg-settings-modelDoor') : null;
    return {
      stored: (() => { try { return raw === null ? null : JSON.parse(raw); } catch (e) { return null; } })(),
      rowOn: onRow !== null,
      doorOpen: door !== null && door.disabled === false,
      reset: root ? root.querySelector('.lg-settings-reset') !== null : false,
      meterFull: meter ? meter.getAttribute('data-full') : null,
      pipsOn: meter ? meter.querySelectorAll('.lg-settings-pip[data-on=true]').length : 0,
      count: meter && meter.querySelector('.lg-settings-count') ? meter.querySelector('.lg-settings-count').textContent : null
    };
  })()`);
	/* The mirror is a projection of BOTH preference fields, so its shape is
	   part of the contract: `{providers: [...], models: {...}}`. A plain array
	   here means the old localStorage-only writer came back. */
	check(
		'switch: mirror holds the object shape',
		after.stored !== null && typeof after.stored === 'object' && !Array.isArray(after.stored) && Array.isArray(after.stored.providers) && after.stored.providers.length === 1 && after.stored.models && typeof after.stored.models === 'object',
		after.stored
	);
	const pinnedId = after.stored && Array.isArray(after.stored.providers) ? after.stored.providers[0] : null;
	const hostAfterPin = await host(page);
	check('switch: host entry matches the mirror', hostAfterPin !== null && JSON.stringify(hostAfterPin.qp) === JSON.stringify(after.stored.providers), hostAfterPin && hostAfterPin.qp);
	check('switch: row reflects selection', after.rowOn === true, after.rowOn);
	check('switch: door unlocks with the pin', after.doorOpen === true, after.doorOpen);
	check('switch: meter counts the selection', after.pipsOn === 1 && after.count === '1 / 4', [after.pipsOn, after.count]);
	check('switch: reset appears with a selection', after.reset === true, after.reset);

	// ---- the model drill-down ---------------------------------------------
	check('door: pressable', await press(page, '.lg-settings-row[data-on=true] .lg-settings-modelDoor'));
	await wait(700);
	const view1 = await page.evaluate(`(() => {
    const view = document.querySelector('.lg-settings-view');
    if (!view) return { open: false };
    const rows = [...view.querySelectorAll('.lg-settings-check')];
    return {
      open: true,
      back: view.querySelector('.lg-settings-back') !== null,
      title: (view.querySelector('.lg-settings-viewTitle') || {}).textContent,
      count: (view.querySelector('.lg-settings-viewCount') || {}).textContent,
      total: rows.length,
      allOn: rows.every((r) => r.getAttribute('aria-checked') === 'true'),
    };
  })()`);
	check('view: opens with a back affordance', view1.open === true && view1.back === true, view1);
	check('view: counts the provider models', view1.open === true && new RegExp('^' + view1.total + ' \\/ ' + view1.total + ' 个模型$').test(view1.count || ''), view1.count);
	check('view: starts with every model chosen', view1.allOn === true, view1.allOn);
	/* Uncheck one row — deliberately not the running model, so the picker
	   step below can tell a subset from an unfiltered list. The subset must
	   reach the mirror AND the host entry in the same interaction. */
	await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.lg-settings-check')];
    const target = rows.find((r) => (r.querySelector('.lg-settings-modelName') || {}).textContent !== ${JSON.stringify(currentModel)}) || rows[rows.length - 1];
    if (target) target.click();
  })()`);
	/* The subset is authoritative only after both host writes echoed. */
	const settled = await settle(
		page,
		`(() => {
    const view = document.querySelector('.lg-settings-view');
    if (!view) return false;
    const rows = [...view.querySelectorAll('.lg-settings-check')];
    return rows.filter((r) => r.getAttribute('aria-checked') === 'true').length === rows.length - 1;
  })()`
	);
	check('view: subset settles after the writes', settled === true);
	const view2 = await page.evaluate(`(() => {
    const view = document.querySelector('.lg-settings-view');
    const rows = [...view.querySelectorAll('.lg-settings-check')];
    const raw = window.localStorage.getItem(${JSON.stringify(KEY)});
    const count = (view.querySelector('.lg-settings-viewCount') || {}).textContent;
    return {
      count,
      leftOn: rows.filter((r) => r.getAttribute('aria-checked') === 'true').length,
      stored: (() => { try { return JSON.parse(raw); } catch (e) { return null; } })(),
      hint: (view.querySelector('.lg-settings-viewHint') || {}).textContent,
    };
  })()`);
	const hostAfterSubset = await host(page);
	const expectedModels = view2.stored && view2.stored.models ? view2.stored.models[pinnedId] : null;
	check('view: uncheck leaves a subset', view2.leftOn === view1.total - 1, [view2.leftOn, view1.total]);
	check('view: subset counted in the header', view2.count === view2.leftOn + ' / ' + view1.total + ' 个模型', view2.count);
	check(
		'view: subset reaches the mirror',
		view2.stored !== null && !Array.isArray(view2.stored) && Array.isArray(expectedModels) && expectedModels.length === view2.leftOn,
		view2.stored
	);
	check('view: subset reaches the host entry', hostAfterSubset !== null && JSON.stringify(hostAfterSubset.qm) === JSON.stringify(view2.stored.models), hostAfterSubset && hostAfterSubset.qm);
	check('view: not-yet-all hint explains the subset', typeof view2.hint === 'string' && view2.hint.length > 0, view2.hint);
	check('back: pressable', await press(page, '.lg-settings-back'));
	await wait(500);
	const note = await page.evaluate(`(() => {
    const row = document.querySelector('.lg-settings-row[data-on=true]');
    return row ? (row.querySelector('.lg-settings-note') || {}).textContent : null;
  })()`);
	check('back: row counts the subset', note === view2.leftOn + ' / ' + view1.total + ' 个模型', note);

	// ---- the picker honours the (provider, model) set without a reload -----
	await closeSettings(page);
	const trigger = await page.evaluate(`(() => {
    const t = document.querySelector('.lg-picker-trigger');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
	if (trigger) {
		for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
			await page.send('Input.dispatchMouseEvent', { type, x: trigger.x, y: trigger.y, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
		}
		await wait(900);
		const live = await page.evaluate(`(() => {
      const card = document.querySelector('.lg-picker-card');
      if (!card) return { open: false };
      return {
        open: true,
        groups: [...card.querySelectorAll('.lg-picker-section .lg-picker-headingName')].map((n) => n.textContent),
        counts: [...card.querySelectorAll('.lg-picker-section .lg-picker-count')].map((n) => n.textContent),
        current: [...card.querySelectorAll('[role=menuitemradio][aria-checked=true]')].map((o) => (o.querySelector('.lg-picker-name') || {}).textContent),
        more: (card.querySelector('.lg-picker-more') || {}).textContent || null
      };
    })()`);
		/* One pinned provider with a subset → exactly one section whose rows are
		   the chosen models. The subset here is exactly the running model, so a
		   regression to the old provider-only filter shows both of the
		   provider's models and this count comes back as 2. */
		check('picker: only the pinned provider remains', live.open === true && live.groups.length === 1, live && live.groups);
		check('picker: the subset is exactly the chosen models', live.open === true && Number(live.counts[0]) === 1, live && live.counts);
		check('picker: the running model is the chosen one', live.open === true && live.current.length === 1 && live.current[0] === currentModel, live && live.current);
		check('picker: shows the all-card once configured', live.more !== null, live.more);
		await page.evaluate(`(() => { const t = document.querySelector('.lg-picker-trigger'); if (t) t.click(); })()`);
		await wait(500);
	} else {
		check('picker: trigger present', false, 'no trigger after closing settings');
	}

	// ---- the workspace switch removes the rail live ------------------------
	await openSkinPage(page);
	check('workspace: switch pressable', await press(page, '.lg-settings-utility .lg-settings-switch'));
	await settle(page, HOST_SNAPSHOT + '.ws === false');
	const wsOff = await host(page);
	check('workspace: switch wrote the host entry', wsOff !== null && wsOff.ws === false, wsOff && wsOff.ws);
	await closeSettings(page);
	const railOff = await page.evaluate(railRows);
	check('workspace: rail row removed without reload', railOff.indexOf('工作空间') < 0, railOff);
	await openSkinPage(page);
	check('workspace: switch back on', await press(page, '.lg-settings-utility .lg-settings-switch'));
	await settle(page, HOST_SNAPSHOT + '.ws === true');
	const wsOn = await host(page);
	check('workspace: host entry restored', wsOn !== null && wsOn.ws === true, wsOn && wsOn.ws);
	await closeSettings(page);
	const railOn = await page.evaluate(railRows);
	check('workspace: rail row restored', railOn.indexOf('工作空间') >= 0, railOn);

	// ---- reset returns the declared default --------------------------------
	await openSkinPage(page);
	check('reset: pressable', await press(page, '.lg-settings-reset'));
	await settle(
		page,
		`(() => {
    const raw = window.localStorage.getItem(${JSON.stringify(KEY)});
    try { const v = JSON.parse(raw); return v.providers.length === 0 && Object.keys(v.models).length === 0; } catch (e) { return false; }
  })()`
	);
	const resetState = await page.evaluate(`(() => {
    const raw = window.localStorage.getItem(${JSON.stringify(KEY)});
    const meter = document.querySelector('.lg-settings-meter');
    return {
      stored: (() => { try { return raw === null ? null : JSON.parse(raw); } catch (e) { return null; } })(),
      pipsOn: meter ? meter.querySelectorAll('.lg-settings-pip[data-on=true]').length : 0,
      count: meter && meter.querySelector('.lg-settings-count') ? meter.querySelector('.lg-settings-count').textContent : null,
      resetGone: document.querySelector('.lg-settings-reset') === null,
    };
  })()`);
	const hostAfterReset = await host(page);
	check(
		'reset: mirror back to the empty shape',
		resetState.stored !== null && !Array.isArray(resetState.stored) && resetState.stored.providers.length === 0 && Object.keys(resetState.stored.models).length === 0,
		resetState.stored
	);
	check('reset: host entry cleared too', hostAfterReset !== null && hostAfterReset.qp.length === 0 && Object.keys(hostAfterReset.qm).length === 0, hostAfterReset);
	check('reset: meter empty again', resetState.pipsOn === 0 && resetState.count === '0 / 4' && resetState.resetGone === true, resetState);

	// Leave the profile as it was found: the probe's toggle is a probe, not a choice.
	await resetHost(page);
	await page.evaluate(`(() => { try { window.localStorage.removeItem(${JSON.stringify(KEY)}); } catch (e) {} })()`);

	if (process.argv.includes('--shot')) await page.screenshot('G:/dsh-build/research/settings-page.png');
} catch (error) {
	console.log('ERROR ' + (error && error.stack ? error.stack : String(error)));
	failed += 1;
}
console.log(failed === 0 ? 'PASS' : 'FAILED ' + failed);
try {
	await b.close();
} catch {
	/* gone */
}
if (chrome !== null) {
	try {
		chrome.kill();
	} catch {
		/* gone */
	}
}
process.exit(failed === 0 ? 0 : 1);
