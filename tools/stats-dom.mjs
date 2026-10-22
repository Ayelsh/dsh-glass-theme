/**
 * Dump the live composer stat pills and their dialogs.
 *
 * These surfaces only exist once a session with a settled turn is open, and the
 * dialogs only after a pill is clicked — so this walks: open a session, click
 * each `[data-composer-stat]` anchor, print the pill and the portalled panel.
 *
 *   node tools/stats-dom.mjs
 *   node tools/stats-dom.mjs --html
 */
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const one = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
}
const url = one('--url', process.env.LG_URL ?? 'http://127.0.0.1:57736/')
const wantHtml = argv.includes('--html')
/** Screenshot prefix: each dialog is captured as <prefix>-<anchor>.png. */
const shot = one('--shot', null)
const scale = Number(one('--scale', '2'))
const theme = one('--theme', null)
// An approval-pending session hides the composer dock, which makes every stat
// pill 0x0 — so the row is selectable and defaults to a finished session.
const row = Number(one('--row', '2'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', url], { encoding: 'utf8' }).trim()
const eq = cookie.indexOf('=')

const clickScript = (target) => String.raw`(() => {
  const target = ${JSON.stringify(target)};
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  let el = null;
  try { el = document.querySelector(target); } catch {}
  if (el === null || el === undefined) {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const want = norm(target);
    const pool = [...document.querySelectorAll('button,[role="button"],a,[role="tab"],[role="menuitem"],[role="menuitemradio"],li,label')];
    el = pool.find((n) => visible(n) && norm(n.innerText) === want)
      ?? pool.find((n) => visible(n) && norm(n.innerText).includes(want));
  }
  if (el === null || el === undefined) return { ok: false };
  el.click();
  return { ok: true, text: (el.innerText || '').trim().slice(0, 60) };
})()`

const DESCRIBE = String.raw`(() => {
  const describe = (el, level, max) => {
    if (level > max) return [];
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    const bits = [el.tagName.toLowerCase()];
    if (cls.length) bits.push('.' + cls.join('.'));
    for (const a of el.attributes) {
      if (a.name === 'class' || a.name === 'style') continue;
      if (a.name === 'role' || a.name.startsWith('data-') || a.name === 'aria-label' || a.name === 'aria-haspopup' || a.name === 'aria-expanded') {
        bits.push('[' + a.name + '=' + JSON.stringify(a.value.slice(0, 44)) + ']');
      }
    }
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (own) bits.push(' "' + own.slice(0, 60) + '"');
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    bits.push(' {' + Math.round(r.width) + 'x' + Math.round(r.height) + ' @' + Math.round(r.left) + ',' + Math.round(r.top) + ' fs' + cs.fontSize + '}');
    const lines = ['  '.repeat(level) + bits.join('')];
    for (const child of el.children) lines.push(...describe(child, level + 1, max));
    return lines;
  };
  const pills = [...document.querySelectorAll('[data-composer-stat]')];
  const dock = document.querySelector('[data-slot="conversation.composer.dock"]');
  const panels = [...document.querySelectorAll('[role=dialog]')];
  return {
    pillCount: pills.length,
    pills: pills.map((p) => describe(p, 0, 4).join('\n')),
    dockHtml: ${wantHtml ? '(dock === null ? null : dock.outerHTML)' : 'null'},
    panels: panels.map((p) => describe(p, 0, 5).join('\n')),
    panelHtml: ${wantHtml ? 'panels.map((p) => p.outerHTML)' : 'null'},
  };
})()`

const browser = await launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1190, height: 900, deviceScaleFactor: 1, mobile: false })
  await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1) })
  await page.goto(url, { settleMs: 9000 })

  // The app stores an explicit theme preference, so emulating
  // prefers-color-scheme alone cannot produce a light run — set the attribute
  // the app itself keys dark mode on.
  if (theme === 'light' || theme === 'dark') {
    await page.evaluate(`(() => {
      if (${JSON.stringify(theme)} === 'light') document.body.removeAttribute('data-ds-dark-theme');
      else document.body.setAttribute('data-ds-dark-theme', '');
      return true
    })()`)
  }

  // The stat surfaces only mount for a session that has a settled turn.
  const open = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[class*=hIlkoa_sessionRow]')];
    const target = rows[${row}];
    if (target === undefined) return { ok: false, count: rows.length };
    target.click();
    return { ok: true, text: (target.innerText || '').trim().slice(0, 60) };
  })()`)
  if (!open.ok) console.error(`stats-dom: no session row to open (${open.count} rows)`)
  else console.error(`stats-dom: opened ${JSON.stringify(open.text)}`)
  await sleep(7000)

  const first = await page.evaluate(DESCRIBE)
  console.error(`stats-dom: ${first.pillCount} stat pill(s)`)
  for (const pill of first.pills) console.log(pill + '\n')

  for (const anchor of ['activity', 'usage']) {
    // A REAL pointer click through CDP, not `el.click()`: the pill opens its
    // dialog from a pointer handler, so a synthetic click leaves it closed.
    const box = await page.evaluate(`(() => {
      const el = document.querySelector('[data-composer-stat=${JSON.stringify(anchor)}] button');
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`)
    if (box === null) {
      console.error(`stats-dom: no ${anchor} anchor`)
      continue
    }
    for (const type of ['mousePressed', 'mouseReleased']) {
      await page.send('Input.dispatchMouseEvent', {
        type,
        x: box.x,
        y: box.y,
        button: 'left',
        clickCount: 1,
        buttons: type === 'mousePressed' ? 1 : 0,
      })
    }
    await sleep(1200)
    const data = await page.evaluate(DESCRIBE)
    console.log(`===== dialog after clicking ${anchor} =====`)
    for (const panel of data.panels) console.log(panel + '\n')
    if (wantHtml && data.panelHtml) for (const html of data.panelHtml) console.log(html + '\n')
    if (shot !== null) {
      // Crop to the dialog's own box plus a margin, so the capture shows the
      // material against the transcript it floats over.
      const box = await page.evaluate(`(() => {
        const el = document.querySelector('[role=dialog]');
        if (el === null) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      })()`)
      if (box !== null) {
        const m = 26
        await page.screenshot(`${shot}-${anchor}.png`, {
          width: 1190,
          height: 900,
          clip: { x: box.x - m, y: box.y - m, width: box.w + m * 2, height: box.h + m * 2, scale },
        })
        console.error(`stats-dom: wrote ${shot}-${anchor}.png`)
      }
    }
    await page.evaluate(`(() => { document.body.click(); return true })()`)
    await sleep(600)
  }
} finally {
  await browser.close()
}
