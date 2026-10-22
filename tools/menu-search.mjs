#!/usr/bin/env node
/**
 * Measures the model menu's search row against its rows.
 *
 * The placeholder is the first thing a reader sees in the pane, so it must sit
 * at the same scale as the list beneath it. A skin that sets `font: inherit` on
 * inputs globally will silently inflate it.
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
    const info = (el) => {
      if (el === null) return null
      const s = getComputedStyle(el)
      const b = el.getBoundingClientRect()
      return {
        tag: el.tagName.toLowerCase(),
        font: s.fontSize + ' / ' + s.lineHeight + ' ' + s.fontWeight,
        family: s.fontFamily.slice(0, 40),
        pad: s.padding,
        h: Math.round(b.height),
        w: Math.round(b.width),
        color: s.color,
        bg: s.backgroundColor,
        radius: s.borderRadius,
        border: s.borderBottomWidth + ' ' + s.borderBottomColor,
      }
    }
    const input = menu.querySelector('input')
    const searchRow = menu.querySelector('[class*=codexModelSelectSearchRow]')
    const name = menu.querySelector('[class~=codexModelSelectOptionName]')
    const groupHeading = menu.querySelector('[data-menu-group-heading]')
    return {
      input: info(input),
      inputPlaceholder: input === null ? null : input.placeholder,
      searchRow: info(searchRow),
      rowName: info(name),
      groupHeading: info(groupHeading),
      menuPad: getComputedStyle(menu).padding,
    }
  })()`)

  if (report.error !== undefined) throw new Error(report.error)
  for (const [key, value] of Object.entries(report)) {
    if (value === null) console.log(`${key}: (absent)`)
    else if (typeof value === 'string') console.log(`${key}: ${value}`)
    else console.log(`${key}: ${JSON.stringify(value)}`)
  }
} finally {
  await browser.close()
}
