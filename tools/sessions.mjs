/**
 * List the sidebar's session rows with their status text, so a probe can pick a
 * session whose composer is actually laid out (an approval-pending session hides
 * the composer dock, which makes every stat pill 0x0).
 *
 *   node tools/sessions.mjs
 */
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const one = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
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
  await page.goto(url, { settleMs: 9000 })

  const rows = await page.evaluate(`(() => {
    const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    return [...document.querySelectorAll('[class*=hIlkoa_sessionRow]')].map((r, i) => {
      const b = r.getBoundingClientRect();
      return {
        i,
        cls: (r.getAttribute('class') || '').replace(/\\s+/g, ' '),
        text: norm(r.innerText).slice(0, 70),
        box: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
      };
    });
  })()`)
  console.log(JSON.stringify(rows, null, 2))
} finally {
  await browser.close()
}
