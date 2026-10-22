/**
 * Boots the real GUI in headless Chrome and reports what the skin did to it.
 *
 * This is the only test that can prove the stylesheet is actually applied: the
 * selector verifier proves the rules *could* match the shipped markup, and the
 * smoke test proves the bundle *evaluates*, but neither proves the app ever
 * renders markup the skin mentions. This does — it loads the app with a real
 * session cookie and reads back computed styles.
 *
 *   node tools/render-check.mjs [--shot out.png] [--url ...] [--wait ms]
 *                               [--json report.json] [--keep]
 *
 * Requires a running dsh web server on this machine. The cookie is minted from
 * the local credential store by tools/auth-cookie.mjs.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
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
const jsonOut = argOf('--json', null)
const waitMs = Number(argOf('--wait', '7000'))

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs')], {
  encoding: 'utf8',
}).trim()
const eq = cookie.indexOf('=')
const cookieName = cookie.slice(0, eq)
const cookieValue = cookie.slice(eq + 1)

/** Runs in the page. Reads only what the DOM exposes. */
const probe = String.raw`(() => {
  const out = { failures: [], notes: [] };
  const mine = [...document.querySelectorAll('style[data-plugin="dsh-glass-theme"]')];
  out.sheetCount = mine.length;
  out.sheetIds = mine.map((s) => s.dataset.pluginCss);

  const all = [...document.querySelectorAll('style[data-plugin]')];
  out.totalSheets = all.length;
  out.skinIsLast = all.length > 0 && all[all.length - 1].dataset.plugin === 'dsh-glass-theme';

  const body = getComputedStyle(document.body);
  out.tokens = {};
  for (const name of ['--lg-accent', '--lg-glass-1', '--lg-surface', '--lg-shadow-2', '--lg-r-panel', '--lg-ambient-1', '--dsw-alias-bg-base', '--dsw-specific-input-major']) {
    const v = body.getPropertyValue(name).trim();
    out.tokens[name] = v || null;
    if (!v) out.failures.push('token not defined: ' + name);
  }

  const targets = {
    frame: "[class*='BynINW_frame']",
    sidebar: "[class*='_2H3hWW_root']",
    centerCol: "[class*='BynINW_centerCol']",
    composerCard: "[class*='RlGAzG_card']",
    conversationBody: "[class*='Dc7zOa_body']",
    newSession: "[class*='_2H3hWW_newSession']",
    primaryBtn: "[class*='RlGAzG_primary']",
    userBubble: "[class*='cJsG2q_bubble']",
    assistantBody: "[class*='v5IAXa_body']",
    toolRow: "[class*='pFy1Ka_root']",
    settingsPanel: "[class*='wCInkW_panel']",
    menuView: "[class*='Z9Jnlq_']",
  };
  out.matched = {};
  for (const [k, sel] of Object.entries(targets)) {
    try { out.matched[k] = document.querySelectorAll(sel).length } catch (e) { out.matched[k] = -1 }
  }

  const grab = (sel, props) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const o = {};
    for (const p of props) o[p] = cs.getPropertyValue(p);
    return o;
  };
  const sampleProps = ['background-color', 'background-image', 'border-radius', 'box-shadow', 'backdrop-filter', 'border-top-color', 'color'];
  out.sample = {
    body: grab('body', sampleProps),
    frame: grab(targets.frame, sampleProps),
    sidebar: grab(targets.sidebar, sampleProps),
    centerCol: grab(targets.centerCol, sampleProps),
    composer: grab(targets.composerCard, sampleProps),
  };

  try {
    const b = getComputedStyle(document.body, '::before');
    out.bodyBefore = { content: b.content, position: b.position, backgroundImage: b.backgroundImage.slice(0, 200), zIndex: b.zIndex, inset: b.inset };
  } catch (e) { out.bodyBefore = { error: String(e) } }

  out.supports = {};
  // A single-argument CSS.supports() call asks "is this a valid PROPERTY
  // NAME", which is always false for a value function. Value features have to
  // be tested with the (property, value) form.
  for (const d of ['backdrop-filter: blur(1px)', 'corner-shape: superellipse(1.5)', 'content-visibility: auto', 'text-wrap: pretty']) {
    out.supports[d] = CSS.supports(d);
  }
  out.supports['color-mix()'] = CSS.supports('background-color', 'color-mix(in srgb, red 50%, transparent)');
  out.supports['light-dark()'] = CSS.supports('color', 'light-dark(red, blue)');

  out.dark = document.body.hasAttribute('data-ds-dark-theme');
  out.htmlMarker = document.documentElement.getAttribute('data-dsh-glass-theme');
  out.bodyMarker = document.body.getAttribute('data-dsh-glass-theme');
  out.title = document.title;
  out.textLen = (document.body.innerText || '').length;
  out.domNodes = document.querySelectorAll('*').length;
  return out;
})()`

const browser = await launch({ headless: true })
let exitCode = 0
try {
  const page = await browser.newPage()
  await page.cookie({ name: cookieName, value: cookieValue })
  console.log('booting', url, '…')
  await page.goto(url, { settleMs: waitMs })

  const report = await page.evaluate(probe)
  report.url = url
  report.consoleErrors = page.errors.slice(0, 15)
  report.console = page.console.filter((c) => c.type === 'error' || /liquid-glass/i.test(c.text)).slice(0, 20)

  console.log('\n--- sheets ---')
  console.log(`  skin style tags: ${report.sheetCount} of ${report.totalSheets} total`)
  if (report.sheetCount > 0) console.log('  ids: ' + report.sheetIds.join(', '))
  console.log(`  skin sheet is last: ${report.skinIsLast}`)

  console.log('\n--- markers ---')
  console.log(`  html[data-dsh-glass-theme]: ${report.htmlMarker}`)
  console.log(`  body[data-dsh-glass-theme]: ${report.bodyMarker}`)
  console.log(`  dark theme: ${report.dark}`)
  console.log(`  title: ${JSON.stringify(report.title)}`)
  console.log(`  dom nodes: ${report.domNodes}, text: ${report.textLen} chars`)

  console.log('\n--- tokens ---')
  for (const [k, v] of Object.entries(report.tokens)) console.log(`  ${k}: ${v ?? 'MISSING'}`)

  console.log('\n--- selectors matched ---')
  for (const [k, v] of Object.entries(report.matched)) {
    const mark = v > 0 ? 'ok ' : '-- '
    console.log(`  ${mark}${k}: ${v}`)
  }

  console.log('\n--- computed surfaces ---')
  for (const [k, v] of Object.entries(report.sample)) {
    if (v === null) {
      console.log(`  ${k}: (no element)`)
      continue
    }
    const bits = []
    if (v['backdrop-filter'] && v['backdrop-filter'] !== 'none') bits.push('blur=' + v['backdrop-filter'])
    if (v['border-radius'] && v['border-radius'] !== '0px') bits.push('r=' + v['border-radius'])
    if (v['background-color']) bits.push('bg=' + v['background-color'])
    console.log(`  ${k}: ${bits.join('  ') || '(defaults)'}`)
  }

  console.log('\n--- body::before (ambient field) ---')
  console.log('  ' + JSON.stringify(report.bodyBefore))

  console.log('\n--- CSS.supports ---')
  for (const [k, v] of Object.entries(report.supports)) console.log(`  ${v ? 'yes' : 'NO '} ${k}`)

  if (report.failures.length > 0) {
    console.log('\n--- failures ---')
    for (const f of report.failures) console.log('  ' + f)
    exitCode = 1
  }
  if (report.consoleErrors.length > 0) {
    console.log('\n--- page errors ---')
    for (const e of report.consoleErrors) console.log('  ' + e.split('\n')[0])
  }

  if (shot !== null) {
    mkdirSync(dirname(resolve(shot)), { recursive: true })
    await page.screenshot(resolve(shot))
    console.log('\nscreenshot: ' + resolve(shot))
  }

  if (jsonOut !== null) {
    mkdirSync(dirname(resolve(jsonOut)), { recursive: true })
    writeFileSync(resolve(jsonOut), JSON.stringify(report, null, 2))
    console.log('report: ' + resolve(jsonOut))
  }

  const booted = report.matched.frame > 0
  console.log(
    '\nRESULT: ' +
      (report.sheetCount === 0
        ? 'skin stylesheets NOT injected'
        : !booted
          ? 'skin injected but app did not render'
          : 'skin injected into a booted app'),
  )
  if (!booted) exitCode = 1
} finally {
  await browser.close()
}
process.exit(exitCode)
