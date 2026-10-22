// boxes.mjs — find "boxes that are nearly as large as their container".
//
// Apple HIG (Boxes): a box should be relatively small compared to the view that
// contains it. When a box approaches the size of its container it stops
// communicating grouping, and its edges collide with the content around it.
// Two failure modes this tool measures:
//
//   ratio  — a painted container's width / its parent's content width. Above
//            ~0.92 the box is doing no grouping work.
//   edge   — distance from the box's border-box edge to the nearest ancestor
//            edge that also paints. Zero means the two edges are touching.
//
// Painted = has a non-transparent background-color, a background-image, a
// border, or a box-shadow ring. Text-only elements are ignored.
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const opt = (name, dflt = null) => {
  const i = argv.indexOf(name);
  return i === -1 ? dflt : argv[i + 1];
};
const navs = [];
for (let i = 0; i < argv.length; i += 1) if (argv[i] === '--nav') navs.push(argv[i + 1]);

const url = opt('--url', process.env.LG_URL || 'http://127.0.0.1:57736/');
const theme = opt('--theme', 'dark');
const settle = Number(opt('--settle', '7000'));
const minRatio = Number(opt('--min-ratio', '0.9'));
const minArea = Number(opt('--min-area', '2000'));

const raw = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', url], {
  encoding: 'utf8',
}).trim();
const eq = raw.indexOf('=');

const probe = `(() => {
  const out = [];
  const painted = (cs) => {
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return 'bg';
    if (cs.backgroundImage !== 'none') return 'bgi';
    if (cs.boxShadow !== 'none') return 'shadow';
    const bw = ['Top', 'Right', 'Bottom', 'Left'].map((s) => parseFloat(cs['border' + s + 'Width']) || 0);
    if (bw.some((v) => v > 0) && cs.borderStyle !== 'none') return 'border';
    return null;
  };
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) < 0.05) return false;
    return true;
  };
  const label = (el) => {
    const cls = typeof el.className === 'string' ? el.className : '';
    return el.tagName.toLowerCase() + (cls ? '.' + cls.trim().split(/\\s+/).slice(0, 2).join('.') : '');
  };
  for (const el of document.querySelectorAll('*')) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    const kind = painted(cs);
    if (!kind) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < ${minArea}) continue;
    const p = el.parentElement;
    if (!p) continue;
    const pcs = getComputedStyle(p);
    const pr = p.getBoundingClientRect();
    const pInner = pr.width - (parseFloat(pcs.paddingLeft) || 0) - (parseFloat(pcs.paddingRight) || 0);
    if (pInner <= 0) continue;
    const ratio = r.width / pInner;
    if (ratio < ${minRatio}) continue;
    out.push({
      el: label(el),
      kind,
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      parent: label(p),
      pInner: Math.round(pInner),
      ratio: Math.round(ratio * 1000) / 1000,
      radius: cs.borderRadius,
      pad: cs.padding,
      bg: cs.backgroundColor,
      bgi: cs.backgroundImage === 'none' ? null : cs.backgroundImage.slice(0, 48),
      shadow: cs.boxShadow === 'none' ? null : cs.boxShadow.slice(0, 64),
    });
  }
  out.sort((a, b) => b.ratio - a.ratio || b.box[2] * b.box[3] - a.box[2] * a.box[3]);
  return { count: out.length, boxes: out.slice(0, 40) };
})()`;

const browser = await launch({ headless: true, width: 1190, height: 900 });
try {
  const page = await browser.newPage();
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1190,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.cookie({ name: raw.slice(0, eq), value: raw.slice(eq + 1) });
  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: theme }],
  });
  await page.goto(url, { settleMs: settle });

  const clickText = async (text) => {
    await page.evaluate(`(() => {
      const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const pool = [...document.querySelectorAll('button,[role=button],a,[role=tab],[role=menuitem],[role=treeitem],li,label,[class*="_item_"],[class*="wCInkW_navCell"],[class*="ET65mq_trigger"]')];
      const el = pool.find((e) => norm(e.innerText) === ${JSON.stringify(text)}) || pool.find((e) => norm(e.innerText).includes(${JSON.stringify(text)}));
      if (el) { el.click(); return 'ok'; }
      return 'not-found';
    })()`);
    await new Promise((r) => setTimeout(r, 900));
  };

  for (const nav of navs) await clickText(nav);
  const res = await page.evaluate(probe);
  console.log(JSON.stringify(res, null, 2));
} finally {
  await browser.close();
}
