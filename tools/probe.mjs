/**
 * Interactive probe: boots the app, dismisses the first-run modals, then reports
 * and screenshots a named view.
 *
 *   node tools/probe.mjs [--view home|conversation|settings|plugins|trajectory]
 *                        [--shot out.png] [--theme dark|light] [--json out.json]
 *
 * The modal dismissal is deliberately generic — it clicks any visible button
 * whose label matches the acknowledgement words, because the preview notice is
 * shown once per install and would otherwise cover every screenshot.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const url = argOf('--url', process.env.LG_URL ?? 'http://127.0.0.1:50070/')
const shot = argOf('--shot', null)
const jsonOut = argOf('--json', null)
const view = argOf('--view', 'home')
const theme = argOf('--theme', null)
const waitMs = Number(argOf('--wait', '6000'))

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs')], { encoding: 'utf8' }).trim()
const eq = cookie.indexOf('=')

const DISMISS = String.raw`(() => {
  const words = ['继续', 'Continue', '知道了', '我知道了', '确定', 'OK', 'Got it', 'Close', '关闭', '跳过', 'Skip'];
  const clicked = [];
  for (const btn of document.querySelectorAll('button, [role="button"]')) {
    const label = (btn.innerText || btn.getAttribute('aria-label') || '').trim();
    if (!words.includes(label)) continue;
    const r = btn.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    btn.click();
    clicked.push(label);
  }
  return clicked;
})()`

const GEOMETRY = String.raw`(() => {
  const q = (s) => document.querySelector(s);
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: cs.display, position: cs.position, padding: cs.padding, margin: cs.margin, background: cs.backgroundColor };
  };
  const frame = q("[class*='BynINW_frame']");
  const out = {
    viewport: { w: innerWidth, h: innerHeight },
    scroll: { docW: document.documentElement.scrollWidth, bodyW: document.body.scrollWidth },
    frame: box(frame),
    frameGrid: frame ? getComputedStyle(frame).gridTemplateColumns : null,
    frameRows: frame ? getComputedStyle(frame).gridTemplateRows : null,
    sidebarCol: box(q("[class*='BynINW_sidebarCol']")),
    centerCol: box(q("[class*='BynINW_centerCol']")),
    rightbarCol: box(q("[class*='BynINW_rightbarCol']")),
    sidebar: box(q("[class*='_2H3hWW_root']")),
    attrs: frame ? { collapsed: frame.getAttribute('data-sidebar-collapsed'), rightCollapsed: frame.getAttribute('data-rightbar-collapsed'), rightFull: frame.getAttribute('data-rightbar-fullscreen') } : null,
    htmlAttrs: { ...document.documentElement.dataset },
    bodyAttrs: { ...document.body.dataset },
  };
  // Every direct child of the frame, with its resolved grid area.
  if (frame) {
    out.frameChildren = [...frame.children].map((c) => {
      const cs = getComputedStyle(c);
      return { cls: c.className.slice(0, 60), w: Math.round(c.getBoundingClientRect().width), h: Math.round(c.getBoundingClientRect().height), col: cs.gridColumn, display: cs.display };
    });
  }
  return out;
})()`

const browser = await launch({ headless: true })
let code = 0
try {
  const page = await browser.newPage()
  await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1) })
  await page.goto(url, { settleMs: waitMs })

  if (theme !== null) {
    await page.evaluate(`(() => {
      const btn = [...document.querySelectorAll('button,[role="button"],a')].find(b => /设置|Settings/.test(b.innerText || b.getAttribute('aria-label') || ''));
      return btn ? btn.innerText : null;
    })()`)
  }

  let clicked = []
  for (let i = 0; i < 3; i++) {
    const got = await page.evaluate(DISMISS)
    if (got.length === 0) break
    clicked.push(...got)
    await new Promise((r) => setTimeout(r, 700))
  }
  console.log('dismissed:', clicked.length > 0 ? clicked.join(', ') : '(nothing)')
  await new Promise((r) => setTimeout(r, 900))

  const geometry = await page.evaluate(GEOMETRY)
  console.log('\n--- geometry ---')
  console.log(JSON.stringify(geometry, null, 2).split('\n').slice(0, 60).join('\n'))

  if (shot !== null) {
    mkdirSync(dirname(resolve(shot)), { recursive: true })
    await page.screenshot(resolve(shot))
    console.log('\nscreenshot: ' + resolve(shot))
  }
  if (jsonOut !== null) {
    mkdirSync(dirname(resolve(jsonOut)), { recursive: true })
    writeFileSync(resolve(jsonOut), JSON.stringify(geometry, null, 2))
  }
} finally {
  await browser.close()
}
process.exit(code)
