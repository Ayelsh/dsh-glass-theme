#!/usr/bin/env node
/**
 * Capture the context meter (the ring beside the stat pills) and the popover it
 * opens.
 *
 * The meter is a third readout on the composer's bottom edge; it only renders
 * for a session that has a settled turn, and its panel only after a real
 * pointer click. This walks that path and reports computed styles so a material
 * change can be proven rather than eyeballed.
 *
 *   node tools/meter.mjs --row 2 --shot G:/dsh-build/research/meter --theme dark
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
const row = Number(one('--row', '2'))
const shot = one('--shot', null)
const theme = one('--theme', null)
const scale = Number(one('--scale', '2'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', url], { encoding: 'utf8' }).trim()
const eq = cookie.indexOf('=')

const REPORT = String.raw`(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel)
    if (el === null) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      bg: cs.backgroundColor,
      radius: cs.borderRadius,
      pad: cs.padding,
      blur: cs.backdropFilter,
      shadow: cs.boxShadow.slice(0, 120),
      fs: cs.fontSize,
      color: cs.color,
    }
  }
  return JSON.stringify({
    root: pick('[class*=_2WTFBq_root]'),
    trigger: pick('[class*=_2WTFBq_trigger]'),
    panel: pick('[class*=_2WTFBq_panel]'),
    bar: pick('[class*=_2WTFBq_bar]'),
    percent: pick('[class*=_2WTFBq_percent]'),
    figures: pick('[class*=_2WTFBq_figures]'),
    headline: pick('[class*=_2WTFBq_headline]'),
    swatch: pick('[class*=_2WTFBq_swatch]'),
    rows: [...document.querySelectorAll('[class*=_2WTFBq_row]')].map((n) => (n.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60)),
  }, null, 2)
})()`

const browser = await launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1190, height: 900, deviceScaleFactor: 1, mobile: false })
  await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1) })
  await page.goto(url, { settleMs: 9000 })

  if (theme === 'light' || theme === 'dark') {
    await page.evaluate(`(() => {
      if (${JSON.stringify(theme)} === 'light') document.body.removeAttribute('data-ds-dark-theme');
      else document.body.setAttribute('data-ds-dark-theme', '');
      return true
    })()`)
  }

  await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[class*=hIlkoa_sessionRow]')];
    const t = rows[${row}]; if (t) t.click(); return true
  })()`)
  await sleep(7000)

  const before = await page.evaluate(REPORT)
  console.log('===== closed =====')
  console.log(before)

  const box = await page.evaluate(`(() => {
    const el = document.querySelector('[class*=_2WTFBq_trigger]')
    if (el === null) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  if (box === null) {
    console.error('meter: no context meter trigger on this session')
  } else {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await page.send('Input.dispatchMouseEvent', {
        type, x: box.x, y: box.y, button: 'left', clickCount: 1,
        buttons: type === 'mousePressed' ? 1 : 0,
      })
    }
    await sleep(1200)
    console.log('===== open =====')
    console.log(await page.evaluate(REPORT))

    if (shot !== null) {
      const r = await page.evaluate(`(() => {
        const el = document.querySelector('[class*=_2WTFBq_panel]')
        if (el === null) return null
        const b = el.getBoundingClientRect()
        return { x: b.x, y: b.y, w: b.width, h: b.height }
      })()`)
      if (r !== null) {
        const m = 26
        await page.screenshot(`${shot}.png`, {
          width: 1190, height: 900,
          clip: { x: r.x - m, y: r.y - m, width: r.w + m * 2, height: r.h + m * 2, scale },
        })
        console.error(`meter: wrote ${shot}.png`)
      }
    }
  }
} finally {
  await browser.close()
}
