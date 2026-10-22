/**
 * Edge finder: lists every element whose left or right border-box edge lands
 * within a tolerance of a given CSS x coordinate.
 *
 * A vertical seam in a screenshot is caused by *some* element's edge — a
 * background that stops, a border, a shadow, a clipped blur. `elementsFromPoint`
 * cannot find it (the culprit is usually transparent to hit-testing), so this
 * searches by geometry instead.
 *
 *   node tools/edges.mjs 792 [--tol 2] [--theme dark]
 */
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const target = Number(process.argv[2] ?? 0)
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const tol = Number(argOf('--tol', '2'))
const theme = argOf('--theme', 'dark')

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

  const report = await page.evaluate(`(() => {
    const target = ${target}, tol = ${tol};
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const left = r.left, right = r.right;
      const which = Math.abs(left - target) <= tol ? 'left' : Math.abs(right - target) <= tol ? 'right' : null;
      if (which === null) continue;
      const cs = getComputedStyle(el);
      const paints = cs.backgroundColor !== 'rgba(0, 0, 0, 0)'
        || (cs.backgroundImage && cs.backgroundImage !== 'none')
        || (cs.boxShadow && cs.boxShadow !== 'none')
        || (cs.backdropFilter && cs.backdropFilter !== 'none')
        || (cs.borderLeftWidth !== '0px' && cs.borderLeftStyle !== 'none')
        || (cs.borderRightWidth !== '0px' && cs.borderRightStyle !== 'none')
        || cs.opacity !== '1'
        || (cs.mixBlendMode && cs.mixBlendMode !== 'normal');
      out.push({
        which, paints,
        tag: el.tagName.toLowerCase(),
        cls: typeof el.className === 'string' ? el.className : '',
        box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        bg: cs.backgroundColor,
        bgi: cs.backgroundImage === 'none' ? '' : cs.backgroundImage.slice(0, 70),
        bf: cs.backdropFilter === 'none' ? '' : cs.backdropFilter,
        shadow: cs.boxShadow === 'none' ? '' : cs.boxShadow.slice(0, 60),
        op: cs.opacity,
        mix: cs.mixBlendMode,
      });
    }
    return out;
  })()`)

  const painting = report.filter((r) => r.paints)
  console.log(`elements with an edge at x=${target}±${tol}: ${report.length} (${painting.length} paint)\n`)
  for (const r of painting) {
    const bits = []
    if (r.bg !== 'rgba(0, 0, 0, 0)') bits.push('bg=' + r.bg)
    if (r.bgi) bits.push('bgi=' + r.bgi)
    if (r.bf) bits.push('bf=' + r.bf)
    if (r.shadow) bits.push('shadow=' + r.shadow)
    if (r.op !== '1') bits.push('op=' + r.op)
    if (r.mix !== 'normal') bits.push('mix=' + r.mix)
    console.log(`  [${r.which}] ${(r.tag + (r.cls ? '.' + r.cls.split(' ').join('.') : '')).slice(0, 70)}`)
    console.log(`        box=${r.box.join(',')}  ${bits.join('  ')}`)
  }
} finally {
  await browser.close()
}
