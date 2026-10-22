#!/usr/bin/env node
/**
 * Selects a model by name in the open session.
 *
 * Used to undo QA that changed the live selection, and to put the profile back
 * where the user left it. `--model <name>` matches the row label as a prefix.
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
const model = one('--model', '')
const row = Number(one('--row', '2'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (model === '') {
  console.error('usage: node tools/set-model.mjs --model <name> [--row N]')
  process.exit(2)
}

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
  await page.evaluate(
    `(() => { const r = [...document.querySelectorAll('[class*=hIlkoa_sessionRow]')]; if (r[${row}]) r[${row}].click(); return true })()`
  )
  await sleep(6000)
  await page.evaluate('(() => { const t = document.querySelector("[class*=codexModelSelectTrigger]"); if (t) t.click(); return true })()')
  await sleep(1200)
  await page.evaluate('(() => { const cs = [...document.querySelectorAll("[class*=codexModelSelectCell]")]; const m = cs.find((x) => /模型/.test(x.textContent || "")); if (m) m.click(); return true })()')
  await sleep(1600)

  // The wanted row may be below the fold; scroll the groups pane until it is.
  // An EXACT label match is preferred over a prefix: "GLM-5.3" is a prefix of
  // "GLM-5.3-Flash" and picking the wrong one silently changes the session.
  const found = await page.evaluate(`(() => {
    const want = ${JSON.stringify(model)}
    const pane = document.querySelector('[class*=codexModelSelectGroups]')
    const label = (r) => {
      const n = r.querySelector('[class*=codexModelSelectOptionName]')
      return n === null ? '' : (n.textContent || '').trim()
    }
    const rows = [...document.querySelectorAll('[class~=codexModelSelectOption]')]
    const pick = rows.find((r) => label(r) === want) ?? rows.find((r) => label(r).startsWith(want))
    if (pick === undefined) {
      if (pane !== null) pane.scrollTop = 0
      return false
    }
    pick.scrollIntoView({ block: 'center' })
    return true
  })()`)
  if (!found) throw new Error(`row not found: ${model}`)
  await sleep(400)

  const box = await page.evaluate(`(() => {
    const want = ${JSON.stringify(model)}
    const label = (r) => {
      const n = r.querySelector('[class*=codexModelSelectOptionName]')
      return n === null ? '' : (n.textContent || '').trim()
    }
    const rows = [...document.querySelectorAll('[class~=codexModelSelectOption]')]
    const pick = rows.find((r) => label(r) === want) ?? rows.find((r) => label(r).startsWith(want))
    if (pick === undefined) return null
    const b = pick.getBoundingClientRect()
    if (b.top < 0 || b.bottom > innerHeight) return null
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  })()`)
  if (box === null) throw new Error(`row not in view: ${model}`)

  for (const type of ['mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', {
      type,
      x: Math.round(box.x),
      y: Math.round(box.y),
      button: 'left',
      buttons: type === 'mousePressed' ? 1 : 0,
      clickCount: 1,
    })
  }
  await sleep(3500)

  const after = await page.evaluate(
    '(() => { const t = document.querySelector("[class*=codexModelSelectTrigger] [class*=codexModelSelectLabel]"); return t === null ? null : (t.textContent || "").trim() })()'
  )
  console.log(`selected: ${after}`)
  if (after === null || !after.startsWith(model)) process.exitCode = 1
} finally {
  await browser.close()
}
