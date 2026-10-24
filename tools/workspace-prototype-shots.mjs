import { mkdirSync } from 'node:fs'
import { launch } from './cdp.mjs'

const base = process.argv[2] ?? 'http://127.0.0.1:4173/workspace-prototype.html'
const out = '.preview/shots'
mkdirSync(out, { recursive: true })
const wait = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms))

const browser = await launch({ headless: true, width: 1440, height: 960 })
try {
  const page = await browser.newPage()

  await page.goto(base, { settleMs: 600 })
  await page.screenshot(`${out}/01-overview-light.png`)

  await page.evaluate(`document.querySelector('[data-tab-id="bugs"]').click()`)
  await wait(200)
  await page.screenshot(`${out}/02-bugs-sync-bar.png`)

  // 慢速同步（?syncMs=）只为了把骨架屏拍下来；正常节奏是 520ms。
  await page.goto(`${base}?tab=bugs&syncMs=3000`, { settleMs: 500 })
  await page.evaluate(`document.querySelector('#refreshBugs').click()`)
  await wait(260)
  await page.screenshot(`${out}/03-bugs-refreshing.png`)
  await wait(3050) // settled: refreshed values + toast still on screen
  await page.screenshot(`${out}/04-bugs-synced.png`)

  await page.evaluate(`document.querySelector('[data-row-id] [data-open-id]').click()`)
  await wait(200)
  await page.screenshot(`${out}/05-detail-inpage.png`)

  await page.evaluate(`document.querySelector('[data-tab-id="bugs"]').click()`)
  await wait(150)
  await page.evaluate(`document.querySelector('#themeToggle').click()`)
  await wait(250)
  await page.screenshot(`${out}/06-dark-bugs.png`)

  await page.goto(`${base}?project=44035651&tab=bugs`, { settleMs: 500 })
  await page.screenshot(`${out}/07-switched-project.png`, { width: 1440, height: 960 })

  await page.goto(base, { settleMs: 500 })
  await page.screenshot(`${out}/08-narrow.png`, { width: 430, height: 932 })

  console.log(JSON.stringify({ ok: true, out }))
} finally {
  await browser.close()
}
