import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'http://127.0.0.1:54810/';
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
  const snap = await page.evaluate(`(() => {
    const ctx = window.__lgCtx; const v = ctx.get('uiSession').current.value;
    const dir = ctx.get('modelDirectories').directoryFor(v.key); const s = dir.store.getSnapshot();
    return { current: s.current };
  })()`);
  console.log('CURRENT', JSON.stringify(snap));
  const box = await page.evaluate(`(() => { const t=document.querySelector('.lg-picker-trigger'); const r=t.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`);
  await clickAt(page, box.x, box.y);
  await new Promise(r => setTimeout(r, 800));
  const row = await page.evaluate(`(() => {
    const r=document.querySelector('.lg-picker-effort-row'); if(!r) return {row:null};
    const b=r.getBoundingClientRect(); const el=document.elementFromPoint(b.x+b.width/2, b.y+b.height/2);
    return { row:{x:b.x+b.width/2,y:b.y+b.height/2,w:b.width,h:b.height}, hit: el?el.className+'|'+el.tagName:null, text:r.textContent };
  })()`);
  console.log('ROW', JSON.stringify(row));
  if (row.row) { await clickAt(page, row.row.x, row.row.y); await new Promise(r => setTimeout(r, 800)); }
  const pane = await page.evaluate(`(() => {
    const p=document.querySelector('.lg-picker-effort-pane');
    const c=document.querySelector('.lg-picker-card');
    return { pane: p ? { text: p.textContent, opts: [...p.querySelectorAll('.lg-picker-effort-option')].map(o=>({t:o.textContent, ch:o.getAttribute('aria-checked')})) } : null,
             cardOpen: !!c, cardText: c ? c.textContent.slice(0,120) : null };
  })()`);
  console.log('PANE', JSON.stringify(pane));
} finally { process.exit(0); }
