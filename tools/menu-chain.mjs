/**
 * Print the positioning chain above the model submenu.
 *
 * The decorator needs to know whether the submenu is positioned by the plugin's
 * own `position: fixed` + inline left/top, or whether it can grow in place. This
 * prints every ancestor with its computed position, z-index, box and inline style
 * so a layout decision is made on measurements rather than on the class names.
 *
 *   node tools/menu-chain.mjs
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

  await page.evaluate(`(() => { const t = document.querySelector('[class*=codexModelSelectTrigger]'); if (t !== null) t.click(); return true })()`)
  await sleep(1200)
  await page.evaluate(`(() => {
    const cell = [...document.querySelectorAll('[class*=codexModelSelectCell]')].find((n) => n.innerText.includes('模型'));
    if (cell !== undefined) cell.click();
    return true;
  })()`)
  await sleep(1400)

  const chain = await page.evaluate(`(() => {
    const start = document.querySelector('[class*=codexModelSelectGroups]');
    if (start === null) return 'no groups pane';
    const out = [];
    let node = start;
    while (node !== null && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      const r = node.getBoundingClientRect();
      out.push({
        tag: node.tagName.toLowerCase(),
        cls: (node.getAttribute('class') || '').slice(0, 70),
        position: cs.position,
        z: cs.zIndex,
        overflow: cs.overflow,
        box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        inline: (node.getAttribute('style') || '').slice(0, 140),
      });
      node = node.parentElement;
    }
    return out;
  })()`)
  console.log(JSON.stringify(chain, null, 2))
} finally {
  await browser.close()
}
