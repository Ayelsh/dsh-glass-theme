/**
 * Finds elements with an outsized border-radius.
 *
 * A radius that is large relative to the box is almost always a bug: either a
 * token resolved to something far bigger than intended, or a shared rule (like
 * a pill radius) leaked onto a full-window container. Walking the tree and
 * reporting radius as a fraction of the shorter side finds them directly,
 * instead of guessing from a screenshot which layer is at fault.
 *
 *   node tools/radius.mjs [--min 0.3] [--top 20]
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
const min = Number(argOf('--min', '0.3'))
const top = Number(argOf('--top', '20'))

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs')], { encoding: 'utf8' }).trim()
const eq = cookie.indexOf('=')

const browser = await launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1) })
  await page.goto(process.env.LG_URL ?? 'http://127.0.0.1:50070/', { settleMs: 7000 })

  // Open settings so the overlay layers are in the tree.
  await page.evaluate(`(() => {
    const t = document.querySelector('[class*="ET65mq_trigger"]');
    if (t !== null) t.click();
    return true;
  })()`)
  await new Promise((r) => setTimeout(r, 800))
  await page.evaluate(`(() => {
    const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const el = [...document.querySelectorAll('button,[role="button"],li,[class*="_item_"]')]
      .find((n) => norm(n.innerText).startsWith('设置'));
    if (el !== undefined) el.click();
    return true;
  })()`)
  await new Promise((r) => setTimeout(r, 1500))

  const rows = await page.evaluate(String.raw`(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const px = parseFloat(cs.borderTopLeftRadius);
      if (!Number.isFinite(px) || px < 8) continue;
      const frac = px / Math.min(r.width, r.height);
      if (frac < ${min}) continue;
      out.push({
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
        tag: el.tagName.toLowerCase(),
        radius: cs.borderRadius,
        frac: +frac.toFixed(2),
        w: Math.round(r.width), h: Math.round(r.height),
        x: Math.round(r.x), y: Math.round(r.y),
        bg: cs.backgroundColor,
      });
    }
    out.sort((a, b) => b.frac - a.frac);
    return out.slice(0, ${top});
  })()`)
  console.log(JSON.stringify(rows, null, 2))
} finally {
  await browser.close()
}
