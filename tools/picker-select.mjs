/**
 * End-to-end proof that the ported picker actually SELECTS.
 *
 * The probe before this one only proves the card renders. A card can render
 * perfectly and still be inert — a portal mounts outside React's tree, a click
 * handler can be lost in the port, and `directory.select()` can reject silently
 * while the trigger label keeps showing the old model. So this test drives a
 * real mouse, reads the label before and after, and asserts it changed.
 *
 * It then restores the original model, because a probe that leaves the user on
 * a different model has done damage, not measurement.
 *
 *   node tools/picker-select.mjs [--model <name>] [--row N] [--theme dark|light]
 *                                [--vp WxH] [--settle 9000] [--url]
 */
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`)
  return at > 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1] : fallback
}

const URL_BASE = arg('url', 'http://127.0.0.1:57736/')
const THEME = arg('theme', 'dark')
const VP = arg('vp', '1190x900')
const ROW = Number(arg('row', '2'))
const SETTLE = Number(arg('settle', '9000'))
const WANT = arg('model', '')
const KEEP = process.argv.includes('--keep')
const [vw, vh] = VP.split('x').map(Number)

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE], {
  encoding: 'utf8',
}).trim()
const eq = cookie.indexOf('=')
const jar = { name: cookie.slice(0, eq), value: cookie.slice(eq + 1) }

const session = await launch({ headless: true, width: vw, height: vh })
let failed = false
const fail = (msg) => { failed = true; console.log(`DEFECT: ${msg}`) }

const click = async (page, x, y) => {
  const p = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 }
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p })
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p })
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p })
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  const page = await session.newPage()
  await page.cookie({ ...jar, domain: '127.0.0.1', path: '/' })
  await page.addInitScript(`(() => {
    const root = document.documentElement
    if (root === null) return
    root.setAttribute('data-platform', 'win32')
    root.setAttribute('data-windows-titlebar', '')
  })()`)
  await page.goto(URL_BASE, { settleMs: SETTLE })

  // Light is an explicit preference in this app, so it has to be set on body.
  if (THEME === 'light') {
    await page.evaluate(`document.body.removeAttribute('data-ds-dark-theme')`)
    await wait(600)
  }

  // A settled session is required: the hero page has no composer model slot.
  const opened = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[class*=hIlkoa_sessionRow]')]
    const row = rows[${ROW}]
    if (!row) return 'no-session'
    row.click()
    return 'clicked'
  })()`)
  if (opened !== 'clicked') {
    console.log(`ABORT: ${opened}`)
    process.exit(1)
  }
  await wait(5000)

  const readLabel = () =>
    page.evaluate(`(() => {
      const el = document.querySelector('[class*=lg-picker-label]')
      return el ? el.textContent : ''
    })()`)

  const before = await readLabel()
  if (before === '') {
    console.log('ABORT: picker trigger not mounted')
    process.exit(1)
  }

  const trigger = await page.evaluate(`(() => {
    const el = document.querySelector('[class*=lg-picker-trigger]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  if (trigger === null) {
    console.log('ABORT: no trigger box')
    process.exit(1)
  }
  await click(page, trigger.x, trigger.y)
  await wait(1200)

  // Pick a row that is NOT the current one, matching --model when given.
  const pick = await page.evaluate(`(() => {
    const own = (el) => {
      let text = ''
      for (const node of el.childNodes) if (node.nodeType === 3) text += node.nodeValue
      return text.trim()
    }
    const rows = [...document.querySelectorAll('[class*=lg-picker-option]')]
    const want = ${JSON.stringify(WANT)}
    const readable = rows.map((row) => {
      const nameEl = row.querySelector('[class*=lg-picker-name]')
      return { row, name: nameEl ? own(nameEl) : '', checked: row.getAttribute('aria-checked') === 'true' }
    })
    // Exact match only: "GLM-5.3" is a prefix of "GLM-5.3-Flash" and a prefix
    // match silently selects the wrong model.
    const target = want === ''
      ? readable.find((r) => !r.checked)
      : readable.find((r) => r.name === want)
    if (!target) return null
    target.row.scrollIntoView({ block: 'nearest' })
    const r = target.row.getBoundingClientRect()
    return { name: target.name, x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  if (pick === null) {
    console.log(`ABORT: no selectable row for model "${WANT}"`)
    process.exit(1)
  }
  await click(page, pick.x, pick.y)
  await wait(2200)

  const after = await readLabel()
  const closed = await page.evaluate(`document.querySelector('[class*=lg-picker-card]') === null`)

  console.log(`before: ${before}`)
  console.log(`clicked: ${pick.name}`)
  console.log(`after:  ${after}`)
  console.log(`card closed: ${closed}`)

  if (after === before) fail(`selection did nothing — the label is still "${before}"`)
  if (!closed) fail('the card stayed open after a selection')

  // Leave the session as it was found — unless --keep was passed, which is how
  // a QA run deliberately parks the session on a chosen model.
  if (after !== before && !KEEP) {
    const trig = await page.evaluate(`(() => {
      const el = document.querySelector('[class*=lg-picker-trigger]')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })()`)
    if (trig !== null) {
      await click(page, trig.x, trig.y)
      await wait(1100)
      const back = await page.evaluate(`(() => {
        const own = (el) => {
          let text = ''
          for (const node of el.childNodes) if (node.nodeType === 3) text += node.nodeValue
          return text.trim()
        }
        const want = ${JSON.stringify(before)}
        const rows = [...document.querySelectorAll('[class*=lg-picker-option]')]
        // The name span also carries the multiplier badge, so read its own text
        // nodes; an exact match against the trigger label can then hit.
        const hit = rows.find((row) => {
          const n = row.querySelector('[class*=lg-picker-name]')
          return n !== null && own(n) === want
        })
        if (!hit) return null
        hit.scrollIntoView({ block: 'nearest' })
        const r = hit.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      })()`)
      if (back === null) {
        console.log(`WARN: could not restore "${before}" by exact name; leaving "${after}"`)
      } else {
        await click(page, back.x, back.y)
        await wait(1600)
        console.log(`restored: ${await readLabel()}`)
      }
    }
  }
} catch (error) {
  failed = true
  console.log(`ERROR: ${error && error.message ? error.message : error}`)
} finally {
  await session.close()
}

console.log(failed ? 'FAIL' : 'ok')
process.exit(failed ? 1 : 0)
