#!/usr/bin/env node
/**
 * End-to-end check that the decorated model menu still SELECTS.
 *
 * The decorator mutates text nodes and injects children inside the plugin's own
 * React tree. React reads its props, not the DOM, so selection should be
 * unaffected — but "should" is not a measurement. This opens the menu, records
 * the trigger label, clicks a DIFFERENT model row, and asserts the trigger
 * changed to that model's name.
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
  await page.evaluate('(() => { const r = [...document.querySelectorAll("[class*=hIlkoa_sessionRow]")]; if (r[2]) r[2].click(); return true })()')
  await sleep(6000)

  const before = await page.evaluate(
    '(() => { const t = document.querySelector("[class*=codexModelSelectTrigger] [class*=codexModelSelectLabel]"); return t === null ? null : (t.textContent || "").trim() })()'
  )
  await page.evaluate('(() => { const t = document.querySelector("[class*=codexModelSelectTrigger]"); if (t) t.click(); return true })()')
  await sleep(1200)
  await page.evaluate('(() => { const cs = [...document.querySelectorAll("[class*=codexModelSelectCell]")]; const m = cs.find((x) => /模型/.test(x.textContent || "")); if (m) m.click(); return true })()')
  await sleep(1600)

  // Pick a row that is NOT the current one, preferring an unchecked row in the
  // first provider so the test does not depend on scroll position.
  const target = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[class~=codexModelSelectOption]')]
    for (const row of rows) {
      const name = row.querySelector('[class*=codexModelSelectOptionName]')
      const checked = row.getAttribute('aria-checked') === 'true'
      if (name === null || checked) continue
      const b = row.getBoundingClientRect()
      if (b.top < 0 || b.bottom > innerHeight) continue
      return { text: (name.textContent || '').trim(), x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }
    return null
  })()`)
  if (target === null) throw new Error('no selectable row in view')

  // A real pointer press: the plugin commits from its pointer handler.
  for (const type of ['mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', {
      type,
      x: Math.round(target.x),
      y: Math.round(target.y),
      button: 'left',
      buttons: type === 'mousePressed' ? 1 : 0,
      clickCount: 1,
    })
  }
  await sleep(3500)

  const after = await page.evaluate(
    '(() => { const t = document.querySelector("[class*=codexModelSelectTrigger] [class*=codexModelSelectLabel]"); return t === null ? null : (t.textContent || "").trim() })()'
  )

  console.log(`before: ${before}`)
  console.log(`clicked: ${target.text}`)
  console.log(`after:  ${after}`)
  const ok = after !== null && after !== before && target.text.startsWith(after.replace(/\s*·.*$/, ''))
  console.log(ok ? 'ok    selection works through the decorator' : 'FAIL  selection did not change as expected')
  if (!ok) process.exitCode = 1
} finally {
  await browser.close()
}
