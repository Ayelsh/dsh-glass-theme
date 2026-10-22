/**
 * Dump the live model menu into a catalog skeleton.
 *
 * The menu belongs to a third-party plugin (`dsh-codex-subscription`), so its
 * contents are not in the shipped build and cannot be derived from CSS. This
 * walks the real menu and prints one line per model:
 *
 *     provider \t model \t multiplier \t state
 *
 * The output is the input to the hand-written description catalog in
 * `src/client.js` — nothing here is invented, it is all read off the DOM.
 *
 *   node tools/model-catalog.mjs
 *   node tools/model-catalog.mjs --json
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
const asJson = argv.includes('--json')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', url], { encoding: 'utf8' }).trim()
const eq = cookie.indexOf('=')

/** Click either a selector or the first visible element whose text matches. */
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

const PROBE = String.raw`(() => {
  const menu = document.querySelector('[class*=codexModelSelectGroups]');
  if (menu === null) return { error: 'no model pane open' };
  const groups = [];
  for (const section of menu.querySelectorAll('section[role=group]')) {
    const heading = section.querySelector('[data-menu-group-heading]');
    const provider = heading === null ? '' : (heading.textContent || '').trim();
    const models = [];
    for (const option of section.querySelectorAll('[role=menuitemradio]')) {
      const nameEl = option.querySelector('[class*=codexModelSelectOptionName]');
      const raw = nameEl === null ? '' : (nameEl.textContent || '').trim();
      // Labels embed the price ratio after a middle dot: "Fast · x0.34".
      const at = raw.lastIndexOf(' · x');
      models.push({
        name: at < 0 ? raw : raw.slice(0, at),
        mult: at < 0 ? '' : raw.slice(at + 4),
        checked: option.getAttribute('aria-checked') === 'true',
        disabled: option.disabled === true,
        title: option.getAttribute('title') || '',
      });
    }
    groups.push({ provider, models });
  }
  return { groups };
})()`

const browser = await launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1190, height: 900, deviceScaleFactor: 1, mobile: false })
  await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1) })
  await page.goto(url, { settleMs: 8000 })

  const steps = [
    ['[class*=codexModelSelectTrigger]', 1400],
    ['模型', 1400],
  ]
  for (const [target, wait] of steps) {
    const r = await page.evaluate(clickScript(target))
    if (!r.ok) {
      console.error(`model-catalog: could not click ${JSON.stringify(target)}`)
      process.exitCode = 1
      break
    }
    await sleep(wait)
  }

  const data = await page.evaluate(PROBE)
  if (data.error !== undefined) {
    console.error(`model-catalog: ${data.error}`)
    process.exitCode = 1
  } else if (asJson) {
    console.log(JSON.stringify(data, null, 2))
  } else {
    let count = 0
    for (const group of data.groups) {
      for (const model of group.models) {
        count += 1
        console.log(
          [group.provider.padEnd(22), model.name.padEnd(34), (model.mult || '—').padEnd(6), model.checked ? 'selected' : '', model.disabled ? 'disabled' : ''].join('\t'),
        )
      }
    }
    console.error(`\n${data.groups.length} groups, ${count} models`)
  }
} finally {
  await browser.close()
}
