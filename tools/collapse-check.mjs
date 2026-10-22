import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'http://127.0.0.1:54810/';
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = out.indexOf('=');
const name = out.slice(0, eq), value = out.slice(eq + 1);
const b = await launch({ headless: true, width: 1400, height: 950 });
const click = async (page, sel) => {
  const box = await page.evaluate(`(() => { const t=document.querySelector(${JSON.stringify(sel)}); if(!t) return null; const r=t.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2} })()`);
  if (!box) return false;
  for (const type of ['mousePressed','mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  return true;
};
try {
  const page = await b.newPage();
  await page.cookie({ name, value, domain: '127.0.0.1', path: '/' });
  await page.goto(URL_BASE, { settleMs: 13000 });
  await page.evaluate(`(() => { const r=[...document.querySelectorAll('[class*=hIlkoa_sessionRow]')]; if(r[1]) r[1].click(); return 1 })()`);
  await new Promise(r => setTimeout(r, 8000));
  await click(page, '.lg-picker-trigger');
  await new Promise(r => setTimeout(r, 900));
  const initial = await page.evaluate(`(() => { const c=document.querySelector('.lg-picker-card'); return { more: (()=>{const m=c.querySelector('.lg-picker-more'); return m?m.textContent:null})(), open: [...c.querySelectorAll('.lg-picker-section')].map(s=>s.getAttribute('data-lg-open')) } })()`);
  console.log('INITIAL', JSON.stringify(initial));
  // pin two providers via the star
  for (const id of ['DeepSeek Account', 'zai-coding-cn']) {
    const ok = await page.evaluate(`(() => { const secs=[...document.querySelectorAll('.lg-picker-section')]; const s=secs.find(x=>(x.querySelector('.lg-picker-headingName')||{}).textContent===${JSON.stringify(id)}); if(!s) return false; s.querySelector('.lg-picker-pin').click(); return true })()`);
    await new Promise(r => setTimeout(r, 300));
    console.log('pin', id, ok);
  }
  await new Promise(r => setTimeout(r, 600));
  const afterPin = await page.evaluate(`(() => { const c=document.querySelector('.lg-picker-card'); const secs=[...c.querySelectorAll('.lg-picker-section')]; return { n: secs.length, names: secs.map(s=>(s.querySelector('.lg-picker-headingName')||{}).textContent), more: (()=>{const m=c.querySelector('.lg-picker-more'); return m?m.textContent:null})(), ls: localStorage.getItem('dsh-glass-theme:quick-providers') } })()`);
  console.log('AFTER PIN', JSON.stringify(afterPin));
  // now expand
  await click(page, '.lg-picker-more');
  await new Promise(r => setTimeout(r, 700));
  const afterExpand = await page.evaluate(`(() => { const c=document.querySelector('.lg-picker-card'); const secs=[...c.querySelectorAll('.lg-picker-section')]; return { n: secs.length, open: secs.map(s=>s.getAttribute('data-lg-open')), visRows: secs.map(s=>[...s.querySelectorAll('.lg-picker-option')].filter(o=>getComputedStyle(o).display!=='none').length), more: (()=>{const m=c.querySelector('.lg-picker-more'); return m?m.textContent:null})() } })()`);
  console.log('AFTER EXPAND', JSON.stringify(afterExpand));
  // open one group
  await page.evaluate(`(() => { const secs=[...document.querySelectorAll('.lg-picker-section')]; const s=secs.find(x=>(x.querySelector('.lg-picker-headingName')||{}).textContent==='workbuddy'); if(s) s.querySelector('.lg-picker-heading').click(); return 1 })()`);
  await new Promise(r => setTimeout(r, 600));
  const afterOpenOne = await page.evaluate(`(() => { const secs=[...document.querySelectorAll('.lg-picker-section')]; const s=secs.find(x=>(x.querySelector('.lg-picker-headingName')||{}).textContent==='workbuddy'); return { open: s.getAttribute('data-lg-open'), vis: [...s.querySelectorAll('.lg-picker-option')].filter(o=>getComputedStyle(o).display!=='none').length } })()`);
  console.log('AFTER OPEN WORKBUDDY', JSON.stringify(afterOpenOne));
  // restore: unpin both
  await page.evaluate(`(() => { localStorage.removeItem('dsh-glass-theme:quick-providers'); return 1 })()`);
} finally { await b.close(); }
