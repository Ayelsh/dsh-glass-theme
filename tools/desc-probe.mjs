#!/usr/bin/env node
/**
 * Dump every decorated model row with its description, so the cascade can be
 * checked against the live catalog rather than against a table in the source.
 *
 *   node tools/desc-probe.mjs --theme dark
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
const theme = one('--theme', null)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', url], { encoding: 'utf8' }).trim()
const eq = cookie.indexOf('=')

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

  await page.evaluate('(() => { const r = [...document.querySelectorAll("[class*=hIlkoa_sessionRow]")]; if (r[2]) r[2].click(); return true })()')
  await sleep(6000)
  await page.evaluate('(() => { const t = document.querySelector("[class*=codexModelSelectTrigger]"); if (t) t.click(); return true })()')
  await sleep(1200)
  await page.evaluate('(() => { const cs = [...document.querySelectorAll("[class*=codexModelSelectCell]")]; const m = cs.find((x) => /模型/.test(x.textContent || "")); if (m) m.click(); return true })()')
  await sleep(1600)

  const rows = await page.evaluate(`(() => {
    const out = []
    for (const section of document.querySelectorAll('[data-menu-group]')) {
      const heading = section.querySelector('[data-menu-group-heading]')
      const group = (heading && heading.textContent || '').trim()
      for (const opt of section.querySelectorAll('[role=menuitemradio]')) {
        const name = opt.querySelector('[class*=codexModelSelectOptionName]')
        const desc = opt.querySelector('[data-lg-desc]')
        const mark = opt.querySelector('[data-lg-mark]')
        out.push({
          group,
          name: (name && name.textContent || '').trim(),
          desc: (desc && desc.textContent || '').trim(),
          mark: (mark && mark.textContent || '').trim(),
          checked: opt.getAttribute('aria-checked'),
        })
      }
    }
    return JSON.stringify(out)
  })()`)

  const parsed = JSON.parse(rows)
  const noDesc = parsed.filter((r) => r.desc === '')
  let group = null
  for (const r of parsed) {
    if (r.group !== group) {
      group = r.group
      console.log(`\n${group}`)
    }
    console.log(`  ${(r.mark || '--').padEnd(3)} ${r.name.padEnd(30)} ${r.desc || '(NO DESCRIPTION)'}`)
  }
  console.log(`\n${parsed.length} rows, ${noDesc.length} without a description`)
  if (noDesc.length > 0) process.exitCode = 1
} finally {
  await browser.close()
}
