/**
 * A/B screenshots: the same view with the skin's stylesheets enabled and then
 * removed at runtime.
 *
 * When a screenshot shows something that looks wrong, this answers the only
 * question that matters first — did the skin cause it, or was it already there?
 * Guessing from the image is unreliable; the diff is not.
 *
 *   node tools/ab.mjs [--out dir] [--theme dark] [--wait 7000]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const url = argOf('--url', process.env.LG_URL ?? 'http://127.0.0.1:50070/')
const outDir = resolve(argOf('--out', 'G:/dsh-build/research/ab'))
const theme = argOf('--theme', 'dark')
const waitMs = Number(argOf('--wait', '7000'))

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs')], { encoding: 'utf8' }).trim()
const eq = cookie.indexOf('=')

const browser = await launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1) })
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] })
  await page.goto(url, { settleMs: waitMs })

  for (let i = 0; i < 3; i++) {
    const n = await page.evaluate(`(() => {
      const w = ['继续','Continue','知道了','确定','OK'];
      let n = 0;
      for (const b of document.querySelectorAll('button,[role="button"]')) {
        const l = (b.innerText || '').trim();
        if (!w.includes(l)) continue;
        if (!b.getBoundingClientRect().width) continue;
        b.click(); n++;
      }
      return n;
    })()`)
    if (n === 0) break
    await new Promise((r) => setTimeout(r, 600))
  }
  await new Promise((r) => setTimeout(r, 1200))

  mkdirSync(outDir, { recursive: true })
  const withSkin = resolve(outDir, 'with-skin.png')
  await page.screenshot(withSkin)
  console.log('with skin:    ' + withSkin)

  // Remove every stylesheet the skin owns, plus the marker attributes it sets,
  // so what remains is the shipped UI exactly as it would render without us.
  const removed = await page.evaluate(`(() => {
    const tags = [...document.querySelectorAll('style[data-plugin="dsh-glass-theme"]')];
    for (const t of tags) t.remove();
    document.documentElement.removeAttribute('data-dsh-glass-theme');
    document.body.removeAttribute('data-dsh-glass-theme');
    return tags.length;
  })()`)
  console.log('removed ' + removed + ' skin stylesheet(s)')
  await new Promise((r) => setTimeout(r, 900))

  const withoutSkin = resolve(outDir, 'without-skin.png')
  await page.screenshot(withoutSkin)
  console.log('without skin: ' + withoutSkin)
} finally {
  await browser.close()
}
