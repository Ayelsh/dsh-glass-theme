// Probe the INLINE thinking-effort segmented control (2026-10 redesign):
// the seg control must be on screen at the SAME TIME as the model list
// (that simultaneity is the requirement), one thumb must translate between
// whole segments, and picking a level must reach directory.select while the
// card stays open.
import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'http://127.0.0.1:56465/';
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = out.indexOf('=');
const b = await launch({ headless: true, width: 1400, height: 950 });
const clickAt = async (page, x, y) => {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
};
try {
  const page = await b.newPage();
  await page.cookie({ name: out.slice(0, eq), value: out.slice(eq + 1), domain: '127.0.0.1', path: '/' });
  await page.goto(URL_BASE, { settleMs: 12000 });
  await page.evaluate(`(() => { const r=[...document.querySelectorAll('[class*=hIlkoa_sessionRow]')]; if(r[1]) r[1].click(); return 1 })()`);
  await new Promise(r => setTimeout(r, 7000));
  const box = await page.evaluate(`(() => { const t=document.querySelector('.lg-picker-trigger'); const r=t.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`);
  await clickAt(page, box.x, box.y);
  await new Promise(r => setTimeout(r, 800));
  // The simultaneity assertion: seg control AND model rows visible at once.
  const both = await page.evaluate(`(() => {
    const seg=document.querySelector('.lg-picker-seg'); const body=document.querySelector('.lg-picker-body');
    if(!seg) return { seg:false };
    const sb=seg.getBoundingClientRect(); const rows=[...(body?body.querySelectorAll('.lg-picker-option'):[])];
    const visible=rows.filter(r=>{const b=r.getBoundingClientRect();return b.height>0&&b.bottom>sb.bottom;}).length;
    const items=[...seg.querySelectorAll('.lg-picker-seg-item')].map(o=>({t:o.textContent,ch:o.getAttribute('aria-checked')}));
    const thumb=seg.querySelector('.lg-picker-seg-thumb');
    return { seg:true, items, thumb: thumb ? { w: thumb.style.width, transform: thumb.style.transform } : null, rowsBelowSeg: visible, totalRows: rows.length };
  })()`);
  console.log('SIMULTANEOUS', JSON.stringify(both));
  if (!both.seg || !both.items || both.items.length === 0) throw new Error('no segmented control on card');
  // Pick a non-checked level; the card must STAY open (no pane to close).
  const pick = await page.evaluate(`(() => {
    const items=[...document.querySelectorAll('.lg-picker-seg-item')];
    const t=items.find(o=>o.getAttribute('aria-checked')==='false'); if(!t) return null;
    const r=t.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,label:t.textContent};
  })()`);
  if (pick) { await clickAt(page, pick.x, pick.y); await new Promise(r => setTimeout(r, 1500)); }
  const after = await page.evaluate(`(() => {
    const ctx=window.__lgCtx; const v=ctx.get('uiSession').current.value;
    const s=ctx.get('modelDirectories').directoryFor(v.key).store.getSnapshot();
    const card=document.querySelector('.lg-picker-card');
    const seg=document.querySelector('.lg-picker-seg');
    const thumb=seg && seg.querySelector('.lg-picker-seg-thumb');
    const checked=seg ? (seg.querySelector('.lg-picker-seg-item[aria-checked="true"]')||{}).textContent : null;
    return { current: s.current, cardStillOpen: !!card, thumb: thumb ? thumb.style.transform : null, checked };
  })()`);
  console.log('CLICKED', JSON.stringify(pick));
  console.log('AFTER', JSON.stringify(after));
  if (!after.cardStillOpen) throw new Error('card closed on effort pick');
  if (after.current.reasoningEffort == null) throw new Error('reasoningEffort never reached the directory');
} finally { process.exit(0); }
