/**
 * Dump the live model menu's element skeleton.
 *
 * The menu belongs to `dsh-codex-subscription`, a third-party plugin, so its
 * structure is not in the shipped build. The decorator in src/client.js has to
 * insert elements at exact places inside it — this prints those places.
 *
 *   node tools/menu-dom.mjs            # skeleton, 3 levels
 *   node tools/menu-dom.mjs --depth 6
 *   node tools/menu-dom.mjs --html     # full outerHTML of the pane
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
const depth = Number(one('--depth', '3'))
const wantHtml = argv.includes('--html')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', url], { encoding: 'utf8' }).trim()
const eq = cookie.indexOf('=')

const clickScript = (target) => String.raw`(() => {
  const target = ${JSON.stringify(target)};
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  let el = null;
  try { el = document.querySelector(target); } catch {}
  if (el === null || el === undefined) {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const want = norm(target);
    const pool = [...document.querySelectorAll('button,[role="button"],a,[role="tab"],[role="menuitem"],[role="menuitemradio"],li,label')];
    el = pool.find((n) => visible(n) && norm(n.innerText) === want)
      ?? pool.find((n) => visible(n) && norm(n.innerText).includes(want));
  }
  if (el === null || el === undefined) return { ok: false };
  el.click();
  return { ok: true, text: (el.innerText || '').trim().slice(0, 40) };
})()`

const SKELETON = String.raw`(() => {
  const menu = document.querySelector('[class*=codexModelSelectGroups]');
  const root = menu === null ? document.querySelector('[class*=codexModelSelectMenu]') : menu.closest('[class*=codexModelSelectMenu]');
  const describe = (el, level) => {
    if (level > ${depth}) return [];
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    const bits = [el.tagName.toLowerCase()];
    if (cls.length) bits.push('.' + cls.join('.'));
    for (const a of el.attributes) {
      if (a.name === 'class' || a.name === 'style') continue;
      if (a.name === 'role' || a.name.startsWith('data-') || a.name === 'aria-label' || a.name === 'aria-checked' || a.name === 'aria-haspopup' || a.name === 'title') {
        bits.push('[' + a.name + '=' + JSON.stringify(a.value.slice(0, 40)) + ']');
      }
    }
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (own) bits.push(' "' + own.slice(0, 48) + '"');
    const r = el.getBoundingClientRect();
    bits.push(' {' + Math.round(r.width) + 'x' + Math.round(r.height) + '}');
    const lines = ['  '.repeat(level) + bits.join('')];
    for (const child of el.children) lines.push(...describe(child, level + 1));
    return lines;
  };
  if (root === null) return { error: 'no menu open' };
  return {
    rootHtml: ${wantHtml ? 'root.outerHTML' : 'null'},
    skeleton: describe(root, 0).join('\n'),
    parent: root.parentElement === null ? '' : (root.parentElement.getAttribute('class') || root.parentElement.tagName),
    paneRole: menu === null ? '' : (menu.getAttribute('role') || ''),
  };
})()`

const browser = await launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1190, height: 900, deviceScaleFactor: 1, mobile: false })
  await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1) })
  await page.goto(url, { settleMs: 8000 })

  for (const [target, wait] of [
    ['[class*=codexModelSelectTrigger]', 1400],
    ['模型', 1400],
  ]) {
    const r = await page.evaluate(clickScript(target))
    if (!r.ok) {
      console.error(`menu-dom: could not click ${JSON.stringify(target)}`)
      process.exitCode = 1
      break
    }
    await sleep(wait)
  }

  const data = await page.evaluate(SKELETON)
  if (data.error !== undefined) {
    console.error(`menu-dom: ${data.error}`)
    process.exitCode = 1
  } else {
    if (wantHtml && data.rootHtml) console.log(data.rootHtml)
    console.log(data.skeleton)
    console.error(`\nparent=${data.parent} paneRole=${data.paneRole}`)
  }
} finally {
  await browser.close()
}
