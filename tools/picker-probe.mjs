/**
 * Measures the ported model picker live: does the seat mount, does it hide the
 * host trigger, does the card open, and what material does it actually paint.
 *
 * The last question is the one that matters: a frosted card and an opaque card
 * look identical in a DOM dump, so this reports the computed fill alpha and
 * whether a backdrop-filter is really applied, plus what is painted behind the
 * card — a blur over an opaque slab is a no-op and reads as plastic.
 *
 *   node tools/picker-probe.mjs [--shot <prefix>] [--theme dark|light]
 *                               [--vp WxH] [--row N] [--settle 9000] [--url]
 */
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`)
  return at > 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1] : fallback
}
const flag = (name) => process.argv.includes(`--${name}`)

const URL_BASE = arg('url', 'http://127.0.0.1:57736/')
const THEME = arg('theme', 'dark')
const VP = arg('vp', '1190x900')
const ROW = Number(arg('row', '2'))
const SETTLE = Number(arg('settle', '9000'))
const SHOT = arg('shot', '')
const SCALE = Number(arg('scale', '2'))
const [vw, vh] = VP.split('x').map(Number)

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE], {
  encoding: 'utf8',
}).trim()
const eq = cookie.indexOf('=')
const jar = { name: cookie.slice(0, eq), value: cookie.slice(eq + 1) }

const session = await launch({ headless: true, width: vw, height: vh })
try {
  const page = await session.newPage()
  page.console.length = 0
  await page.cookie({ ...jar, domain: new URL(URL_BASE).hostname, path: '/' })
  await page.addInitScript(
    `(() => {
       const root = document.documentElement;
       if (root === null) return;
       root.setAttribute('data-platform', 'win32');
       root.setAttribute('data-windows-titlebar', '');
     })();`,
  )
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: vw,
    height: vh,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await page.goto(URL_BASE, { settleMs: SETTLE })

  if (THEME === 'light') {
    await page.evaluate(`document.body.removeAttribute('data-ds-dark-theme'); true`)
  } else {
    await page.evaluate(`document.body.setAttribute('data-ds-dark-theme',''); true`)
  }

  // Open a real session: the composer only exists once a session is selected.
  await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[class*=hIlkoa_sessionRow]')];
    const pick = rows[${ROW}] || rows.find((r) => !r.className.includes('selected')) || rows[0];
    if (!pick) return 'no session row';
    pick.click();
    return 'clicked ' + pick.innerText.slice(0, 40);
  })()`)
  await new Promise((r) => setTimeout(r, 4000))

  const seat = await page.evaluate(`(() => {
    const slot = document.querySelector('[data-slot="conversation.input.model"]');
    const seat = document.querySelector('.lg-picker');
    const host = slot && slot.querySelector('[data-lg-picker-host]');
    const trigger = document.querySelector('.lg-picker-trigger');
    const read = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
        box: [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)],
        bg: cs.backgroundColor,
        bgi: cs.backgroundImage.slice(0, 60),
        backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
        radius: cs.borderRadius,
        shadow: cs.boxShadow.slice(0, 90),
        font: cs.fontSize + '/' + cs.lineHeight,
        color: cs.color,
      };
    };
    return {
      slotFound: Boolean(slot),
      slotChildren: slot ? [...slot.children].map((c) => c.className || c.tagName) : [],
      seatFound: Boolean(seat),
      hostHidden: host ? getComputedStyle(host).display : null,
      trigger: read(trigger),
      cardOpen: Boolean(document.querySelector('.lg-picker-card')),
    };
  })()`)

  console.log('--- seat ---')
  console.log(JSON.stringify(seat, null, 2))

  // Open the card with a REAL pointer press: React's onClick needs a trusted
  // sequence in this app's pointer handling, and a synthetic .click() has
  // already hidden one bug from me.
  const triggerBox = await page.evaluate(`(() => {
    const el = document.querySelector('.lg-picker-trigger');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return [b.x + b.width / 2, b.y + b.height / 2];
  })()`)
  if (triggerBox) {
    const [x, y] = triggerBox
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await page.send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: type === 'mouseMoved' ? 'none' : 'left',
        buttons: type === 'mousePressed' ? 1 : 0,
        clickCount: type === 'mouseMoved' ? 0 : 1,
      })
    }
    await new Promise((r) => setTimeout(r, 900))
  }

  const card = await page.evaluate(`(() => {
    const el = document.querySelector('.lg-picker-card');
    if (!el) return { open: false };
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const sections = [...el.querySelectorAll('.lg-picker-section')].map((s) => ({
      heading: s.querySelector('.lg-picker-heading') ? s.querySelector('.lg-picker-heading').innerText.replace(/\\s+/g, ' ').trim() : '',
      rows: s.querySelectorAll('.lg-picker-option').length,
    }));
    const rows = [...el.querySelectorAll('.lg-picker-option')];
    const first = rows[0];
    const nameEl = first && first.querySelector('.lg-picker-name');
    const descEl = first && first.querySelector('.lg-picker-desc');
    const heading = el.querySelector('.lg-picker-heading');
    const behind = document.elementFromPoint(box.x + box.width / 2, box.y + box.height + 6);
    return {
      open: true,
      style: el.getAttribute('style'),
      box: [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)],
      bg: cs.backgroundColor,
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
      radius: cs.borderRadius,
      shadow: cs.boxShadow.slice(0, 120),
      sections,
      rows: rows.length,
      rowHeight: first ? Math.round(first.getBoundingClientRect().height) : 0,
      firstName: nameEl ? nameEl.innerText : null,
      firstDesc: descEl ? descEl.innerText : null,
      headingBg: heading ? getComputedStyle(heading).backgroundColor : null,
      headingBackdrop: heading ? (getComputedStyle(heading).backdropFilter || getComputedStyle(heading).webkitBackdropFilter) : null,
      badge: (() => {
        const b = el.querySelector('.lg-picker-badge');
        if (!b) return null;
        const bs = getComputedStyle(b);
        return { text: b.innerText.replace(/\\s+/g, ' ').trim(), tone: b.getAttribute('data-lg-tone'), color: bs.color };
      })(),
      clipped: rows.filter((r) => {
        const n = r.querySelector('.lg-picker-name');
        return n ? n.scrollWidth - n.clientWidth > 1 : false;
      }).length,
      behind: behind ? behind.className || behind.tagName : null,
    };
  })()`)

  console.log('--- card ---')
  console.log(JSON.stringify(card, null, 2))

  if (page.errors.length > 0) {
    console.log('--- page errors ---')
    for (const error of page.errors.slice(0, 8)) console.log(error)
  }
  const skinLogs = page.console.filter((entry) => /liquid-glass|picker/i.test(entry.text || ''))
  if (skinLogs.length > 0) {
    console.log('--- skin console ---')
    for (const entry of skinLogs.slice(0, 8)) console.log(entry.type, entry.text)
  }

  if (SHOT && card.open) {
    const pad = 20
    await page.screenshot(`${SHOT}.png`, {
      clip: {
        x: Math.max(0, card.box[0] - pad),
        y: Math.max(0, card.box[1] - pad),
        width: card.box[2] + pad * 2,
        height: card.box[3] + pad * 2,
        scale: SCALE,
      },
    })
    console.log(`shot ${SHOT}.png`)
  }
} finally {
  await session.close()
}
