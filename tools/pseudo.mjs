/**
 * Pseudo-element inspector: reports the resolved style of ::before/::after on
 * every element in the stack at a point.
 *
 * A seam that hit-testing cannot explain is almost always a pseudo-element, and
 * those never appear in `elementsFromPoint`. This is the tool that finds them.
 *
 *   node tools/pseudo.mjs 792 350 [--theme dark]
 */
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const x = Number(process.argv[2] ?? 0)
const y = Number(process.argv[3] ?? 0)
const theme = (() => {
  const i = process.argv.indexOf('--theme')
  return i >= 0 ? process.argv[i + 1] : 'dark'
})()

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs')], { encoding: 'utf8' }).trim()
const eq = cookie.indexOf('=')

const browser = await launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1) })
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] })
  await page.goto(process.env.LG_URL ?? 'http://127.0.0.1:50070/', { settleMs: 7000 })
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
  await new Promise((r) => setTimeout(r, 900))

  const found = await page.evaluate(`(() => {
    const out = [];
    const walk = (el, depth) => {
      if (depth > 14) return;
      for (const which of ['::before', '::after']) {
        const cs = getComputedStyle(el, which);
        const content = cs.content;
        if (content === 'none' || content === 'normal' || content === '') continue;
        const paints = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || (cs.backgroundImage && cs.backgroundImage !== 'none') || (cs.boxShadow && cs.boxShadow !== 'none');
        if (!paints) continue;
        out.push({
          host: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').join('.') : ''),
          which,
          content,
          bg: cs.backgroundColor,
          bgi: cs.backgroundImage === 'none' ? '' : cs.backgroundImage.slice(0, 110),
          shadow: cs.boxShadow === 'none' ? '' : cs.boxShadow.slice(0, 80),
          inset: cs.inset,
          size: [cs.width, cs.height].join(' x '),
          pos: cs.position,
          z: cs.zIndex,
          opacity: cs.opacity,
        });
      }
      for (const c of el.children) walk(c, depth + 1);
    };
    walk(document.body, 0);
    return out;
  })()`)

  console.log(`pseudo-elements that paint (${found.length}):`)
  for (const f of found) {
    console.log(`\n  ${f.host} ${f.which}`)
    console.log(`     content=${f.content} pos=${f.pos} z=${f.z} size=${f.size} inset=${f.inset} op=${f.opacity}`)
    if (f.bg !== 'rgba(0, 0, 0, 0)') console.log(`     bg=${f.bg}`)
    if (f.bgi) console.log(`     bgi=${f.bgi}`)
    if (f.shadow) console.log(`     shadow=${f.shadow}`)
  }
} finally {
  await browser.close()
}
