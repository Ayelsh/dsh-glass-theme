// tools/ws-live-shots.mjs
//
// One browser session, every workspace state. Booting the page costs ~10 s
// (the panel probes two CLIs and lists 12 TAPD projects), so the states are
// captured in one pass instead of one process per state.
//
//   node tools/ws-live-shots.mjs                       # writes .preview/ws-live/*
//   node tools/ws-live-shots.mjs --out out/ws --url http://127.0.0.1:63019/
//
// Captured: overview (light), bugs, the mid-refresh skeleton, the refreshed
// list with its toast, the in-page detail, the same page in dark, and the
// narrow (single-column) layout.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const one = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
}
const url = one('--url', process.env.LG_URL ?? 'http://127.0.0.1:49363/')
const outDir = resolve(one('--out', '.preview/ws-live'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
mkdirSync(outDir, { recursive: true })

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', url], {
  encoding: 'utf8',
}).trim()
const eq = cookie.indexOf('=')

const browser = await launch({ headless: true })
const page = await browser.newPage()
const report = { url, states: [], consoleErrors: [] }

const setViewport = (width, height) =>
  page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false })
const shot = async (name, width, height, settleMs = 420) => {
  await sleep(settleMs)
  await page.screenshot(resolve(outDir, name), { width, height })
  report.states.push(name)
}
const until = async (expr, cap = 45000) => {
  const started = Date.now()
  while (Date.now() - started < cap) {
    if (await page.evaluate(expr)) return true
    await sleep(350)
  }
  return false
}

try {
  await setViewport(1440, 1000)
  await page.send('Network.enable')
  await page.send('Network.setCacheDisabled', { cacheDisabled: true })
  await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1) })
  await page.goto(url, { settleMs: 9000 })

  await page.evaluate(`(() => {
    const hit = [...document.querySelectorAll('button, [role="button"]')]
      .find((el) => (el.textContent || '').includes('工作空间'));
    if (hit !== undefined) hit.click();
    return hit !== undefined;
  })()`)

  const railReady = await until(`document.querySelector('.lgwsp-space-option') !== null`)
  const itemsReady = await until(
    `document.querySelector('.lgwsp-item-row') !== null ||
     [...document.querySelectorAll('.lgwsp-focus-card-number')].every((el) => el.textContent.trim() !== '—')`
  )
  report.boot = { railReady, itemsReady }

  /* The app remembers dark; the light captures need the attribute lifted. */
  await page.evaluate(`(() => {
    document.body.removeAttribute('data-ds-dark-theme');
    return document.body.hasAttribute('data-ds-dark-theme');
  })()`)
  await sleep(500)

  await shot('01-overview.png', 1440, 1000)

  await page.evaluate(`document.querySelector('[data-tab-id="bugs"]')?.click()`)
  await sleep(600)
  await shot('02-bugs.png', 1440, 1000)

  await page.evaluate(`document.querySelector('[data-sync-bugs]')?.click()`)
  /* The CLI answers in a few hundred ms here, so the skeleton frame is taken
     on the next paint instead of after a settle. */
  await shot('03-bugs-refreshing.png', 1440, 1000, 0)
  await sleep(3000)
  await shot('04-bugs-synced.png', 1440, 1000)

  await page.evaluate(`document.querySelector('.lgwsp-item-primary')?.click()`)
  await sleep(700)
  await shot('05-detail.png', 1440, 1000)

  await page.evaluate(`document.body.setAttribute('data-ds-dark-theme', 'dark')`)
  await sleep(500)
  await shot('06-dark.png', 1440, 1000)

  await page.evaluate(`document.body.removeAttribute('data-ds-dark-theme')`)
  await setViewport(430, 932)
  await sleep(700)
  /* The narrow list is the point of this frame; the sheet gets its own. */
  await page.evaluate(`document.querySelector('.lgwsp-inspector-close')?.click()`)
  await sleep(600)
  await shot('07-narrow.png', 430, 932)
  await page.evaluate(`document.querySelector('.lgwsp-item-primary')?.click()`)
  await sleep(700)
  await shot('08-narrow-detail.png', 430, 932)

  report.consoleErrors = page.errors.slice(0, 8)
} finally {
  await browser.close()
}

console.log(JSON.stringify(report, null, 2))
