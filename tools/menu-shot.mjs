#!/usr/bin/env node
/** Screenshot the decorated model menu, cropped to its own box. */
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
const out = one('--out', 'G:/dsh-build/research/menu')
const theme = one('--theme', 'dark')
const scale = Number(one('--scale', '2'))
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
  const box = await page.evaluate(`(() => {
    const m = document.querySelector('[class*=codexModelSelectMenu]')
    if (m === null) return null
    const b = m.getBoundingClientRect()
    return { x: b.x, y: b.y, w: b.width, h: b.height }
  })()`)
  if (box === null) throw new Error('menu did not open')
  const pad = 16
  await page.screenshot(`${out}.png`, {
    width: 1190, height: 900,
    clip: { x: box.x - pad, y: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2, scale },
  })
  console.log(`wrote ${out}.png  menu ${Math.round(box.w)}x${Math.round(box.h)}`)
} finally {
  await browser.close()
}
