/**
 * Find invisible text in the live app.
 *
 * The bug this exists for: two independent single-class rules landed on the same
 * element and fought over `color`, so an accent fill ended up with accent text
 * on it — a button that is present, sized, clickable, and unreadable. No error,
 * no layout shift, nothing a static selector check can see.
 *
 * Detection: for every element that directly owns a text node, compare its
 * computed colour against the nearest ancestor that actually paints a
 * background. If the two are within a small distance in RGB and the text is
 * opaque, the text is invisible. Reported with the element, its box, both
 * colours, and the classes on it — which is exactly what you need to find the
 * two rules that collided.
 *
 * Usage: node tools/contrast.mjs [--theme dark|light] [--url ...] [--shot out.png]
 *                                [--nav "<click text>" ...] [--min 12]
 * Exit code 1 when anything is found.
 */
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`)
  return at >= 0 ? argv[at + 1] : fallback
}
const many = (name) => {
  const out = []
  argv.forEach((a, i) => {
    if (a === `--${name}`) out.push(argv[i + 1])
  })
  return out
}

const URL_BASE = flag('url', process.env.LG_URL || 'http://127.0.0.1:50070/')
const THEME = flag('theme', 'dark')
const SHOT = flag('shot', null)
const MIN = Number(flag('min', '12'))
const NAV = many('nav')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const probe = `(() => {
  const parse = (s) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const paint = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      const c = parse(cs.backgroundColor);
      const hasImage = cs.backgroundImage !== 'none';
      if (hasImage) return { c: null, image: true, owner: n };
      if (c && c.a > 0.5) return { c, image: false, owner: n };
      n = n.parentElement;
    }
    return { c: null, image: false, owner: null };
  };
  const dist = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    // Only elements that directly own visible text.
    let hasText = false;
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim().length > 0) { hasText = true; break; }
    }
    if (!hasText) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const op = parseFloat(cs.opacity);
    if (!(op > 0.05)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const fg = parse(cs.color);
    if (!fg || fg.a < 0.35) continue;
    const bg = paint(el);
    // A background image means we cannot know the effective backdrop; skip it
    // rather than report every element on a gradient.
    if (bg.image || !bg.c) continue;
    const d = dist(fg, bg.c);
    if (d <= ${MIN}) {
      out.push({
        tag: el.tagName,
        cls: String(el.className).slice(0, 90),
        text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30),
        box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        fg: cs.color,
        bg: getComputedStyle(bg.owner).backgroundColor,
        dist: Math.round(d),
      });
    }
  }
  return out;
})()`

const run = async () => {
  /* The cookie is authority-bound, so it has to be minted for the port the page
     is actually loaded from. Passing `--url` (not just the bare authority) keeps
     this tool working when the GUI moves ports, which it does on every restart. */
  const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE], {
    encoding: 'utf8',
  }).trim()
  const eq = cookie.indexOf('=')
  const browser = await launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1) })
    if (THEME !== null) {
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: THEME }] })
    }
    await page.goto(URL_BASE, { settleMs: 7000 })
    await page.evaluate(`document.documentElement.setAttribute('data-lg-input','pointer')`)

    for (const target of NAV.length > 0 ? NAV : [null]) {
      if (target !== null) {
        const clicked = await page.evaluate(`(() => {
          const want = ${JSON.stringify(target)};
          const norm = (s) => (s || '').replace(/\\s+/g, '');
          const pool = [...document.querySelectorAll('button,[role="button"],a,[role="tab"],[role="menuitem"],[role="treeitem"],li,label')];
          let hit = null;
          try { hit = document.querySelector(want); } catch {}
          if (!hit) hit = pool.find((el) => norm(el.innerText) === norm(want));
          if (!hit) hit = pool.find((el) => norm(el.innerText).includes(norm(want)));
          if (!hit) return null;
          hit.click();
          return (hit.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 30);
        })()`)
        if (clicked === null) {
          console.log(`nav "${target}" -> NOT FOUND`)
          continue
        }
        console.log(`nav "${target}" -> ${clicked}`)
        await sleep(1800)
      }

      const found = await page.evaluate(probe)
      const label = target ?? 'initial page'
      console.log(`\n=== ${label}: ${found.length} invisible text element(s) ===`)
      for (const f of found) {
        console.log(`  ${f.tag}.${f.cls}`)
        console.log(`    "${f.text}" box=${f.box.join(',')} fg=${f.fg} bg=${f.bg} dist=${f.dist}`)
      }
      if (SHOT) {
        await page.screenshot(SHOT, { width: 1440, height: 960 })
        console.log(`  shot: ${SHOT}`)
      }
      if (found.length > 0) process.exitCode = 1
    }
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
