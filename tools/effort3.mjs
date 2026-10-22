import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = 'http://127.0.0.1:54810/';
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
  // scroll the effort row into view, then click it
  const row = await page.evaluate(`(() => { const r=document.querySelector('.lg-picker-effort-row'); r.scrollIntoView({block:'center'}); const b=r.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2,text:r.textContent} })()`);
  await new Promise(r => setTimeout(r, 400));
  await clickAt(page, row.x, row.y);
  await new Promise(r => setTimeout(r, 800));
  const pane = await page.evaluate(`(() => {
    const p=document.querySelector('.lg-picker-effort-pane'); if(!p) return null;
    return { text:p.textContent, opts:[...p.querySelectorAll('.lg-picker-effort-option')].map(o=>({t:o.textContent,ch:o.getAttribute('aria-checked')})) };
  })()`);
  console.log('PANE', JSON.stringify(pane));
  // pick a non-checked level
  const pick = await page.evaluate(`(() => {
    const opts=[...document.querySelectorAll('.lg-picker-effort-option')];
    const t=opts.find(o=>o.getAttribute('aria-checked')==='false'); if(!t) return null;
    t.scrollIntoView({block:'center'}); const r=t.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,label:t.textContent};
  })()`);
  if (pick) { await new Promise(r=>setTimeout(r,300)); await clickAt(page, pick.x, pick.y); await new Promise(r => setTimeout(r, 1500)); }
  const after = await page.evaluate(`(() => {
    const ctx=window.__lgCtx; const v=ctx.get('uiSession').current.value;
    const s=ctx.get('modelDirectories').directoryFor(v.key).store.getSnapshot();
    return { current: s.current, trigger: (document.querySelector('.lg-picker-effort')||{}).textContent || null };
  })()`);
  console.log('CLICKED', JSON.stringify(pick));
  console.log('AFTER', JSON.stringify(after));
} finally { process.exit(0); }
