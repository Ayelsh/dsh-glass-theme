/**
 * Element identification at an exact CSS point.
 *
 *   node tools/at.mjs 792 350 [--theme dark]
 *
 * Prints the full ancestor chain at that point with the properties that can
 * paint: background, background-image, backdrop-filter, box-shadow, opacity.
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

  const chain = await page.evaluate(`(() => {
    const els = document.elementsFromPoint(${x}, ${y});
    return els.map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        cls: typeof el.className === 'string' ? el.className : '',
        id: el.id || '',
        attrs: [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => a.name + '=' + a.value).join(' '),
        box: [+r.x.toFixed(1), +r.y.toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)],
        bg: cs.backgroundColor,
        bgi: cs.backgroundImage === 'none' ? '' : cs.backgroundImage.slice(0, 90),
        bf: cs.backdropFilter === 'none' ? '' : cs.backdropFilter,
        shadow: cs.boxShadow === 'none' ? '' : cs.boxShadow.slice(0, 80),
        opacity: cs.opacity,
        mix: cs.mixBlendMode,
        z: cs.zIndex,
        pos: cs.position,
      };
    });
  })()`)

  console.log(`elements at (${x}, ${y}):`)
  for (const e of chain) {
    const bits = []
    if (e.bg !== 'rgba(0, 0, 0, 0)') bits.push('bg=' + e.bg)
    if (e.bgi) bits.push('bgi=' + e.bgi)
    if (e.bf) bits.push('bf=' + e.bf)
    if (e.shadow) bits.push('shadow=' + e.shadow)
    if (e.opacity !== '1') bits.push('op=' + e.opacity)
    if (e.mix !== 'normal') bits.push('mix=' + e.mix)
    console.log(`  ${e.tag}${e.cls ? '.' + e.cls.split(' ').join('.') : ''}`)
    console.log(`     box=${e.box.join(',')} pos=${e.pos} z=${e.z} ${bits.join('  ')}`)
    if (e.attrs) console.log(`     ${e.attrs}`)
  }
} finally {
  await browser.close()
}
