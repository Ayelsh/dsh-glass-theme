#!/usr/bin/env node
/**
 * Reports the material stack of the open model menu.
 *
 * The menu is `_surface_ri079_1` (which carries `isolation: isolate`) wrapping
 * `_material_ri079_21` (an absolutely-positioned fill layer at z-index:-1).
 * An isolated surface is its own backdrop root, so a backdrop-filter on the
 * child has nothing behind it to sample — the blur silently does nothing and
 * only the fill survives. This prints, per layer: who paints, what colour,
 * what blur, and whether that blur can actually reach the page.
 *
 * Prints a JSON block per layer plus a verdict on whether the composite is
 * translucent enough to read as glass (a near-opaque fill is not glass).
 */
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const one = (n, d) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d
}
const url = one('--url', process.env.LG_URL ?? 'http://127.0.0.1:57736/')
const theme = one('--theme', 'dark')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', url], { encoding: 'utf8' }).trim()
const eq = cookie.indexOf('=')

const browser = await launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1190, height: 900, deviceScaleFactor: 1, mobile: false })
  await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1) })
  await page.addInitScript(
    'document.documentElement.setAttribute("data-platform","win32");document.documentElement.setAttribute("data-windows-titlebar","");'
  )
  await page.goto(url, { settleMs: 9000 })
  if (theme === 'light') await page.evaluate('(() => { document.body.removeAttribute("data-ds-dark-theme"); return true })()')
  await page.evaluate('(() => { const r = [...document.querySelectorAll("[class*=hIlkoa_sessionRow]")]; if (r[2]) r[2].click(); return true })()')
  await sleep(6000)
  await page.evaluate('(() => { const t = document.querySelector("[class*=codexModelSelectTrigger]"); if (t) t.click(); return true })()')
  await sleep(1200)
  await page.evaluate('(() => { const cs = [...document.querySelectorAll("[class*=codexModelSelectCell]")]; const m = cs.find((x) => /模型/.test(x.textContent || "")); if (m) m.click(); return true })()')
  await sleep(1600)

  const report = await page.evaluate(`(() => {
    const menu = document.querySelector('[class*=codexModelSelectMenu]')
    if (menu === null) return { error: 'menu did not open' }
    const read = (el, label) => {
      if (el === null) return { label, missing: true }
      const cs = getComputedStyle(el)
      const b = el.getBoundingClientRect()
      return {
        label,
        cls: (el.className || '').toString().slice(0, 90),
        box: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)],
        bg: cs.backgroundColor,
        bgImage: cs.backgroundImage === 'none' ? 'none' : cs.backgroundImage.slice(0, 60),
        backdrop: cs.backdropFilter,
        isolation: cs.isolation,
        zIndex: cs.zIndex,
        position: cs.position,
        opacity: cs.opacity,
        radius: cs.borderTopLeftRadius,
        shadow: cs.boxShadow.slice(0, 110),
      }
    }
    const layers = []
    layers.push(read(menu, 'surface(menu)'))
    const material = menu.querySelector('[class*=_material_ri079]')
    layers.push(read(material, 'material'))
    // What is actually behind the menu at its own centre? Sampling the element
    // stack tells us whether a blur here would have anything to work with.
    const mb = menu.getBoundingClientRect()
    const cx = Math.round(mb.x + mb.width / 2)
    const cy = Math.round(mb.y + mb.height / 2)
    const behind = document.elementsFromPoint(cx, cy)
      .filter((el) => el !== menu && !menu.contains(el))
      .slice(0, 4)
      .map((el) => ({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60) }))
    // The fill's alpha decides whether this can read as glass at all.
    const m = /rgba?\\(([^)]+)\\)/.exec(getComputedStyle(material || menu).backgroundColor)
    let alpha = 1
    if (m !== null) { const parts = m[1].split(',').map(Number); alpha = parts.length > 3 ? parts[3] : 1 }
    return {
      menuBox: [Math.round(mb.x), Math.round(mb.y), Math.round(mb.width), Math.round(mb.height)],
      layers,
      behind,
      fillAlpha: alpha,
      verdict: alpha >= 0.9 ? 'OPAQUE-SLAB (not glass)' : alpha >= 0.7 ? 'mostly-opaque' : 'translucent',
    }
  })()`)
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}
