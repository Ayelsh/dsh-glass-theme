#!/usr/bin/env node
/**
 * Reports model-menu rows whose name or description is ellipsised.
 *
 * A description that is cut off is worse than no description: the reader gets
 * a sentence that stops mid-thought. This measures every row and prints the
 * overflow, so the menu's width can be decided from evidence rather than taste.
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
    const mb = menu.getBoundingClientRect()
    const rows = []
    // Tilde match, not substring: the row's own children are called OptionCopy /
    // OptionName / OptionDescription, so a substring match counts every row 4x.
    for (const option of menu.querySelectorAll('[class~=codexModelSelectOption]')) {
      const name = option.querySelector('[class*=codexModelSelectOptionName]')
      const desc = option.querySelector('[class*=codexModelSelectOptionDescription]')
      const cut = (el) => (el === null ? null : el.scrollWidth - el.clientWidth)
      rows.push({
        name: name === null ? '' : (name.textContent || '').trim(),
        nameCut: cut(name),
        descCut: cut(desc),
        desc: desc === null ? '' : (desc.textContent || '').trim(),
      })
    }
    const header = menu.querySelector('[data-lg-header]')
    return {
      menu: { w: Math.round(mb.width), h: Math.round(mb.height) },
      headerW: header === null ? null : Math.round(header.getBoundingClientRect().width),
      chips: menu.querySelectorAll('[data-lg-chip]').length,
      rows,
    }
  })()`)

  if (report.error !== undefined) throw new Error(report.error)
  console.log(`menu ${report.menu.w}x${report.menu.h}  header ${report.headerW}px  chips ${report.chips}`)
  const cutNames = report.rows.filter((r) => r.nameCut > 0)
  const cutDescs = report.rows.filter((r) => r.descCut !== null && r.descCut > 0)
  for (const r of cutNames) console.log(`  NAME cut ${r.nameCut}px  ${r.name}`)
  for (const r of cutDescs) console.log(`  DESC cut ${r.descCut}px  ${r.name} :: ${r.desc}`)
  console.log(`${report.rows.length} rows · ${cutNames.length} names cut · ${cutDescs.length} descriptions cut`)
  if (cutNames.length + cutDescs.length > 0) process.exitCode = 1
} finally {
  await browser.close()
}
