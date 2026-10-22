/**
 * Hit-test probe: walks a horizontal line across the viewport and reports which
 * elements paint there, so an unexplained seam in a screenshot can be traced to
 * the element responsible instead of guessed at.
 *
 *   node tools/hit.mjs [--y 400] [--steps 24] [--theme dark]
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const url = argOf('--url', process.env.LG_URL ?? 'http://127.0.0.1:50070/')
const y = Number(argOf('--y', '400'))
const steps = Number(argOf('--steps', '24'))
const theme = argOf('--theme', null)

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs')], { encoding: 'utf8' }).trim()
const eq = cookie.indexOf('=')

const browser = await launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1) })
  if (theme !== null) {
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] })
  }
  await page.goto(url, { settleMs: 7000 })
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
  await new Promise((r) => setTimeout(r, 700))

  const rows = await page.evaluate(`(() => {
    const w = innerWidth, out = [];
    const step = Math.max(1, Math.floor(w / ${steps}));
    for (let x = step; x < w; x += step) {
      const els = document.elementsFromPoint(x, ${y}).slice(0, 4).map((el) => {
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 46),
          bg: cs.backgroundColor,
          bgi: cs.backgroundImage === 'none' ? '' : cs.backgroundImage.slice(0, 60),
          bf: cs.backdropFilter === 'none' ? '' : cs.backdropFilter,
        };
      });
      out.push({ x, els });
    }
    return out;
  })()`)

  for (const row of rows) {
    const top = row.els[0]
    const painter = row.els.find((e) => e.bg !== 'rgba(0, 0, 0, 0)' || e.bgi !== '' || e.bf !== '') ?? top
    console.log(
      `x=${String(row.x).padStart(4)}  top=${(top.tag + '.' + top.cls).slice(0, 50).padEnd(50)}  paints=${(painter.tag + '.' + painter.cls).slice(0, 42).padEnd(42)} bg=${painter.bg}${painter.bf ? ' bf=' + painter.bf : ''}`,
    )
  }
} finally {
  await browser.close()
}
