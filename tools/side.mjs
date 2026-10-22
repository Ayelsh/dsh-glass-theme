/**
 * Prints the sidebar's element tree, which is where the entry points to every
 * other page live (settings, plugins, automation, the account menu).
 *
 * The sidebar is icon-heavy and mostly aria-labelled, so innerText alone does
 * not identify its controls; this walks the DOM and reports tag, class, title,
 * aria-label and text for each node so a navigation path can be written.
 *
 *   node tools/side.mjs [--depth 6] [--sel "class*=_2H3hWW_footArea"]
 */
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const depth = Number(argOf('--depth', '6'))
const sel = argOf('--sel', 'body')

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs')], { encoding: 'utf8' }).trim()
const eq = cookie.indexOf('=')

const browser = await launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1) })
  await page.goto(process.env.LG_URL ?? 'http://127.0.0.1:50070/', { settleMs: 7000 })

  const out = await page.evaluate(String.raw`(() => {
    const root = document.querySelector(${JSON.stringify(sel)});
    if (root === null) return 'no match for ' + ${JSON.stringify(sel)};
    const lines = [];
    const walk = (el, d) => {
      if (d > ${depth}) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const bits = [el.tagName.toLowerCase()];
      const cls = typeof el.className === 'string' ? el.className : '';
      if (cls !== '') bits.push('.' + cls.split(/\s+/).join('.'));
      for (const a of ['title', 'aria-label', 'role', 'data-slot', 'data-panel']) {
        const v = el.getAttribute(a);
        if (v !== null && v !== '') bits.push('@' + a + '=' + JSON.stringify(v).slice(0, 40));
      }
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
      if (own !== '') bits.push('"' + own.slice(0, 40) + '"');
      bits.push('[' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ']');
      lines.push('  '.repeat(d) + bits.join(' '));
      for (const c of el.children) walk(c, d + 1);
    };
    walk(root, 0);
    return lines.join('\n');
  })()`)
  console.log(out)
} finally {
  await browser.close()
}
