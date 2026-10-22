/**
 * Drive the conversation turn rail the way a pointer does, then look at it.
 *
 * The rail is the hardest surface in the skin to review, for two reasons that
 * both come from the app rather than from the CSS:
 *
 *   1. It only exists inside a session that has turns. On the home screen
 *      `[class*=xpvNua_frame]` is null, so every probe of the home screen says
 *      "the rail is fine" without ever having seen it.
 *   2. Its preview card is opened by a POINTER handler. `el.click()` and even a
 *      dispatched `pointerenter` do nothing — React is listening to the real
 *      input pipeline, so the card stays hidden and a screenshot looks correct
 *      while showing none of the state that matters.
 *
 * So this tool dispatches `Input.dispatchMouseEvent` through CDP, which is the
 * same path a user's mouse takes.
 *
 *   node tools/rail.mjs --session 1 --hover 12 --shot rail.png
 *   node tools/rail.mjs --session 1 --scan --theme light
 *   node tools/rail.mjs --session 1 --hover last --eval '<expr>'
 *
 * Options:
 *   --session <n>        index into the visible session rows (default 1: the
 *                        first row that is not 新会话, which is where real
 *                        conversations live)
 *   --hover <n|last|mid> which mark to hover after opening the session
 *   --scan               hover every mark in turn and report which ones open a
 *                        preview and where it lands; catches a card that is
 *                        clamped off-screen at the ends of the rail
 *   --eval <expr>        extra in-page expression, printed as JSON
 *   --shot <path>        screenshot after hovering
 *   --clip x,y,w,h[,s]   magnify one region instead of the whole viewport
 *   --theme dark|light   set body[data-ds-dark-theme] directly; prefers-color-
 *                        scheme emulation alone cannot beat the stored setting
 *   --vp <WxH>           viewport (default 1600x1000, where the rail shows)
 *   --settle <ms>        settle after load (default 9000)
 *   --wait <ms>          settle after opening the session (default 5000)
 *   --url <url>
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const one = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
}
const has = (name) => argv.includes(name)

const url = one('--url', process.env.LG_URL ?? 'http://127.0.0.1:57736/')
const sessionIdx = Number(one('--session', '1'))
const hover = one('--hover', null)
const scan = has('--scan')
const shot = one('--shot', null)
const theme = one('--theme', null)
const evalExpr = one('--eval', null)
const settleMs = Number(one('--settle', '9000'))
const waitMs = Number(one('--wait', '5000'))
const vp = (() => {
  const raw = one('--vp', '1600x1000')
  const [width, height] = raw.split('x').map(Number)
  return { width, height }
})()

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', url], { encoding: 'utf8' }).trim()
const eq = cookie.indexOf('=')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await launch({ headless: true, width: vp.width, height: vp.height })
try {
  const page = await browser.newPage()
  await page.cookie({
    name: cookie.slice(0, eq),
    value: cookie.slice(eq + 1),
    domain: new URL(url).hostname,
    path: '/',
  })
  await page.addInitScript(String.raw`
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    document.documentElement.setAttribute('data-platform', 'win32');
    document.documentElement.setAttribute('data-windows-titlebar', '');
  `)
  await page.goto(url, { settleMs })
  await page.addInitScript(String.raw`document.documentElement.setAttribute('data-windows-titlebar', '');`)

  if (theme !== null) {
    await page.evaluate(String.raw`(() => {
      const dark = ${theme === 'dark'};
      if (dark) document.body.setAttribute('data-ds-dark-theme', '');
      else document.body.removeAttribute('data-ds-dark-theme');
      return true;
    })()`)
  }

  // Open a real session. Row 0 is 新会话 (an empty hero), so the rail is only
  // laid out from row 1 onwards.
  const opened = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[class*=hIlkoa_sessionRow]')];
    const el = rows[${sessionIdx}];
    if (el === undefined) return null;
    el.click();
    return (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
  })()`)
  console.log(`session ${sessionIdx}: ${opened ?? 'NOT FOUND'}`)
  await sleep(waitMs)

  const railInfo = await page.evaluate(String.raw`(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
    const frame = document.querySelector('[class*=xpvNua_frame]');
    const marks = [...document.querySelectorAll('[class*=xpvNua_mark]')];
    const cs = frame === null ? null : getComputedStyle(frame);
    return {
      frame: frame === null ? null : box(frame),
      frameCS: cs === null ? null : { bg: cs.backgroundColor, radius: cs.borderRadius, bf: cs.backdropFilter, h: cs.height, pad: cs.padding },
      marks: marks.length,
      ladder: marks.length > 1 ? Math.round(marks[1].getBoundingClientRect().y - marks[0].getBoundingClientRect().y) : null,
      first: marks.length ? box(marks[0]) : null,
      last: marks.length ? box(marks[marks.length - 1]) : null,
      active: marks.filter((m) => String(m.className).includes('markActive')).length,
      unloaded: marks.filter((m) => String(m.className).includes('markUnloaded')).length,
      busy: marks.filter((m) => String(m.className).includes('markBusy')).length,
    };
  })()`)
  console.log(JSON.stringify(railInfo, null, 2))

  /** Real pointer travel to a viewport point, then read the preview card. */
  const hoverAt = async (x, y) => {
    // Two moves: Chrome needs an actual transition for :hover to engage when
    // the pointer enters from outside the document.
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x - 12, y, button: 'none', buttons: 0 })
    await sleep(40)
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
    await sleep(260)
  }

  const readPreview = () => page.evaluate(String.raw`(() => {
    const pv = document.querySelector('[class*=xpvNua_preview]');
    if (pv === null) return null;
    const r = pv.getBoundingClientRect();
    const cs = getComputedStyle(pv);
    return {
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      bg: cs.backgroundColor, radius: cs.borderRadius, bf: cs.backdropFilter,
      shadow: cs.boxShadow.slice(0, 100), pad: cs.padding,
      text: (pv.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140),
    };
  })()`)

  if (hover !== null) {
    const target = await page.evaluate(`(() => {
      const marks = [...document.querySelectorAll('[class*=xpvNua_mark]')];
      if (marks.length === 0) return null;
      const raw = ${JSON.stringify(hover)};
      const i = raw === 'last' ? marks.length - 1 : raw === 'mid' ? Math.floor(marks.length / 2) : Math.min(Number(raw), marks.length - 1);
      const r = marks[i].getBoundingClientRect();
      return { i, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`)
    if (target === null) {
      console.log('hover -> no marks')
    } else {
      await hoverAt(target.x, target.y)
      const pv = await readPreview()
      console.log(`hover mark ${target.i} at ${Math.round(target.x)},${Math.round(target.y)}`)
      console.log(JSON.stringify(pv, null, 2))
    }
  }

  if (scan) {
    // Hover every mark and record whether a card opens and where. A card that
    // only appears for the middle of the rail is a card clamped off-screen.
    const count = railInfo.marks ?? 0
    const points = await page.evaluate(`(() => {
      return [...document.querySelectorAll('[class*=xpvNua_mark]')].map((m) => {
        const r = m.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
    })()`)
    const opened = []
    for (let i = 0; i < Math.min(count, points.length); i += 1) {
      await hoverAt(points[i].x, points[i].y)
      const pv = await readPreview()
      if (pv !== null) opened.push({ i, y: pv.box[1], h: pv.box[3], w: pv.box[2] })
    }
    console.log(`scan: ${opened.length}/${count} marks opened a preview`)
    if (opened.length > 0) {
      const ys = opened.map((o) => o.y)
      console.log(`  preview y range ${Math.min(...ys)}..${Math.max(...ys)}  width ${opened[0].w}  height ${opened[0].h}`)
      const missing = []
      for (let i = 0; i < count; i += 1) if (!opened.some((o) => o.i === i)) missing.push(i)
      if (missing.length > 0) console.log(`  no preview at marks: ${missing.slice(0, 24).join(',')}${missing.length > 24 ? ' …' : ''}`)
    }
  }

  if (evalExpr !== null) {
    const value = await page.evaluate(`(() => { const r = ${evalExpr}; return JSON.stringify(r, null, 2) })()`)
    console.log(value)
  }

  if (shot !== null) {
    mkdirSync(dirname(resolve(shot)), { recursive: true })
    const raw = one('--clip', null)
    const clip = raw === null ? null : (() => {
      const [x, y, width, height, scale] = raw.split(',').map(Number)
      return { x, y, width, height, scale: scale ?? 3 }
    })()
    const written = await page.screenshot(resolve(shot), { clip, ...vp })
    console.log(`shot: ${written}`)
  }
} finally {
  await browser.close()
}
