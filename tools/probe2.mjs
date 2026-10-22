/**
 * Deep probe: measures the shell boxes, resolves the theme state, and verifies
 * feature support the way the skin actually uses it.
 *
 *   node tools/probe2.mjs [--theme dark|light] [--shot out.png]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const url = argOf('--url', process.env.LG_URL ?? 'http://127.0.0.1:50070/')
const shot = argOf('--shot', null)
const wantTheme = argOf('--theme', null)

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs')], { encoding: 'utf8' }).trim()
const eq = cookie.indexOf('=')

const probe = String.raw`(() => {
  const out = {};
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70),
      x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      pad: cs.padding, mar: cs.margin, display: cs.display, boxSizing: cs.boxSizing,
      overflow: cs.overflow, position: cs.position,
      radius: cs.borderRadius, bg: cs.backgroundColor, bf: cs.backdropFilter,
    };
  };
  const tree = (el, depth) => {
    if (!el || depth > 3) return [];
    const self = box(el);
    const kids = depth === 3 ? [] : [...el.children].map((c) => ({ ...box(c), kids: tree(c, depth + 1) }));
    return [{ ...self, kids }];
  };
  out.sidebarColTree = tree(document.querySelector("[class*='BynINW_sidebarCol']"), 0);
  out.centerColTree = tree(document.querySelector("[class*='BynINW_centerCol']"), 0);

  // Theme resolution
  out.theme = {
    darkAttr: document.body.hasAttribute('data-ds-dark-theme'),
    source: document.documentElement.getAttribute('data-ds-theme-source'),
    colorScheme: document.documentElement.style.colorScheme,
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
    bgBase: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim(),
    fontPx: getComputedStyle(document.body).getPropertyValue('--dsh-content-font-size').trim(),
  };

  // Feature support tested as real declarations.
  out.supports = {};
  for (const d of [
    'color: color-mix(in srgb, red 50%, transparent)',
    'backdrop-filter: blur(1px) saturate(180%)',
    '-webkit-backdrop-filter: blur(1px)',
    'corner-shape: superellipse(1.5)',
    'background: linear-gradient(180deg, rgba(255,255,255,.9), rgba(255,255,255,.1))',
    'box-shadow: inset 0 0.5px 0 rgba(255,255,255,.72)',
    'text-wrap: balance',
    'view-transition-name: x',
    'anchor-name: --a',
    'field-sizing: content',
  ]) out.supports[d] = CSS.supports(d);

  out.ua = navigator.userAgent;
  out.chrome = (navigator.userAgent.match(/Chrome\/(\d+)/) || [])[1] || null;
  return out;
})()`

const browser = await launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1) })
  if (wantTheme !== null) {
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: wantTheme }],
    })
  }
  await page.goto(url, { settleMs: 7000 })

  // Dismiss the first-run notice so it does not cover the frame.
  for (let i = 0; i < 3; i++) {
    const got = await page.evaluate(`(() => {
      const words = ['继续','Continue','知道了','我知道了','确定','OK','Got it'];
      let n = 0;
      for (const b of document.querySelectorAll('button,[role="button"]')) {
        const l = (b.innerText || b.getAttribute('aria-label') || '').trim();
        if (!words.includes(l)) continue;
        const r = b.getBoundingClientRect();
        if (!r.width) continue;
        b.click(); n++;
      }
      return n;
    })()`)
    if (got === 0) break
    await new Promise((r) => setTimeout(r, 700))
  }
  await new Promise((r) => setTimeout(r, 800))

  const report = await page.evaluate(probe)
  writeFileSync('G:/dsh-build/research/probe2.json', JSON.stringify(report, null, 2))

  console.log('--- theme ---')
  console.log(JSON.stringify(report.theme, null, 2))
  console.log('\n--- engine ---')
  console.log('chrome', report.chrome)
  for (const [k, v] of Object.entries(report.supports)) console.log(`  ${v ? 'yes' : 'NO '} ${k}`)

  console.log('\n--- sidebarCol tree ---')
  const dump = (nodes, ind = 0) => {
    for (const n of nodes) {
      if (!n) continue
      console.log(
        `${' '.repeat(ind)}${n.cls || '(no class)'}  [${n.x},${n.y} ${n.w}x${n.h}] pad=${n.pad} mar=${n.mar} ${n.boxSizing}`,
      )
      dump(n.kids ?? [], ind + 2)
    }
  }
  dump(report.sidebarColTree)

  console.log('\n--- centerCol tree ---')
  dump(report.centerColTree)

  if (shot !== null) {
    mkdirSync(dirname(resolve(shot)), { recursive: true })
    await page.screenshot(resolve(shot))
    console.log('\nscreenshot: ' + resolve(shot))
  }
} finally {
  await browser.close()
}
