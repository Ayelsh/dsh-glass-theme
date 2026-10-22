/**
 * Batch page tour: one browser, every settings sub-page, one screenshot each.
 *
 * Launching a browser per page costs ~9 s of settle time and made a full visual
 * pass impractical, which is exactly how a defect survives a "verified" claim.
 * This walks the settings nav once and captures every destination.
 *
 *   node tools/pages.mjs [--theme dark|light] [--out G:\dsh-build\research\tour]
 *                        [--vp 1190x900] [--url ...] [--only 模型,通用设置]
 *
 * Screenshots are named `<index>-<slug>.png`. Every page also reports the
 * geometry of the settings content scroller and the painted boxes whose width
 * is >= 0.85 of their container, so a collision is caught without reading pixels.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = argv.indexOf(name)
  return i === -1 ? dflt : argv[i + 1]
}

const url = opt('--url', process.env.LG_URL || 'http://127.0.0.1:57736/')
const theme = opt('--theme', 'dark')
const out = opt('--out', 'G:\\dsh-build\\research\\tour')
const vp = opt('--vp', '1190x900').split('x').map(Number)
const only = opt('--only', null)
const settle = Number(opt('--settle', '8000'))

mkdirSync(out, { recursive: true })

const raw = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', url], {
  encoding: 'utf8',
}).trim()
const eq = raw.indexOf('=')

/* The audit runs on the page that is currently open: geometry of the content
   scroller, plus any painted box that fills >= 85% of its container's content
   width (the m05600 acceptance criterion: a box must be meaningfully smaller). */
const probe = `(() => {
  const painted = (cs) => {
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return 'bg';
    if (cs.backgroundImage !== 'none') return 'bgi';
    if (cs.boxShadow !== 'none') return 'shadow';
    return null;
  };
  const label = (el) => {
    const cls = typeof el.className === 'string' ? el.className : '';
    return el.tagName.toLowerCase() + (cls ? '.' + cls.trim().split(/\\s+/).slice(0, 2).join('.') : '');
  };
  const scroller = document.querySelector('[class*="wCInkW_options"]');
  const sr = scroller ? scroller.getBoundingClientRect() : null;
  const boxes = [];
  for (const el of document.querySelectorAll('[class*="wCInkW_content"] *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue;
    if (!painted(cs)) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 2000) continue;
    const p = el.parentElement;
    if (!p) continue;
    const pcs = getComputedStyle(p);
    const pr = p.getBoundingClientRect();
    const pInner = pr.width - (parseFloat(pcs.paddingLeft) || 0) - (parseFloat(pcs.paddingRight) || 0);
    if (pInner <= 0) continue;
    const ratio = r.width / pInner;
    if (ratio < 0.85) continue;
    boxes.push({
      el: label(el),
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      parent: label(p),
      ratio: Math.round(ratio * 1000) / 1000,
      radius: cs.borderRadius,
      pad: cs.padding,
    });
  }
  return {
    scroller: sr ? [Math.round(sr.x), Math.round(sr.y), Math.round(sr.width), Math.round(sr.height)] : null,
    boxes: boxes.slice(0, 8),
  };
})()`

const browser = await launch({ headless: true, width: vp[0], height: vp[1] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  const page = await browser.newPage()
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: vp[0],
    height: vp[1],
    deviceScaleFactor: 1,
    mobile: false,
  })
  await page.cookie({ name: raw.slice(0, eq), value: raw.slice(eq + 1) })
  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: theme }],
  })
  await page.addInitScript(`document.documentElement.setAttribute('data-windows-titlebar','1')`)
  await page.goto(url, { settleMs: settle })

  const clickText = async (text) => {
    const hit = await page.evaluate(`(() => {
      const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const pool = [...document.querySelectorAll('button,[role=button],a,[role=tab],[role=menuitem],li,label,[class*="_item_"],[class*="wCInkW_navCell"],[class*="ET65mq_trigger"]')];
      const el = pool.find((e) => norm(e.innerText) === ${JSON.stringify(text)})
        || pool.find((e) => norm(e.innerText).includes(${JSON.stringify(text)}));
      if (!el) return null;
      el.click();
      return (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 24);
    })()`)
    await sleep(1500)
    return hit
  }

  console.log(`theme=${theme} vp=${vp.join('x')}`)
  const opened = await clickText('阿耶')
  if (opened === null) throw new Error('account trigger not found')
  if ((await clickText('设置')) === null) throw new Error('settings entry not found')
  await sleep(1200)

  const navs = await page.evaluate(`(() => {
    return [...document.querySelectorAll('[class*="wCInkW_navCell"]')]
      .map((e) => (e.innerText || '').replace(/\\s+/g, ' ').trim())
      .filter(Boolean);
  })()`)
  const wanted = only === null ? navs : navs.filter((n) => only.split(',').some((w) => n.includes(w)))
  console.log(`settings pages (${wanted.length}): ${wanted.join(' | ')}`)

  const slug = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
  let i = 0
  for (const name of wanted) {
    const hit = await clickText(name)
    if (hit === null) {
      console.log(`  ${name} -> NOT FOUND`)
      continue
    }
    await sleep(1200)
    const report = await page.evaluate(probe)
    const file = resolve(out, `${String(i).padStart(2, '0')}-${slug(name)}.png`)
    await page.screenshot(file, { width: vp[0], height: vp[1] })
    i += 1
    console.log(`  ${name} -> ${file}`)
    console.log(`    scroller=${JSON.stringify(report.scroller)} fullwidth-boxes=${report.boxes.length}`)
    for (const b of report.boxes) {
      console.log(`      ${b.el} box=${b.box.join(',')} parent=${b.parent} ratio=${b.ratio} radius=${b.radius} pad=${b.pad}`)
    }
  }
} finally {
  await browser.close().catch(() => {})
}
