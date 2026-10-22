import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'http://127.0.0.1:54810/';
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = out.indexOf('=');
const b = await launch({ headless: true, width: 1400, height: 950 });
const clickAt = async (page, x, y) => {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
};
const boxOf = (page, sel) => page.evaluate(`(() => { const t=document.querySelector(${JSON.stringify(sel)}); if(!t) return null; const r=t.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2} })()`);
const report = {};
try {
  const page = await b.newPage();
  await page.cookie({ name: out.slice(0, eq), value: out.slice(eq + 1), domain: '127.0.0.1', path: '/' });
  await page.goto(URL_BASE, { settleMs: 12000 });
  await page.evaluate(`(() => { const r=[...document.querySelectorAll('[class*=hIlkoa_sessionRow]')]; if(r[1]) r[1].click(); return 1 })()`);
  await new Promise(r => setTimeout(r, 7000));

  // open card, expand all
  let box = await boxOf(page, '.lg-picker-trigger');
  await clickAt(page, box.x, box.y);
  await new Promise(r => setTimeout(r, 700));
  await page.evaluate(`(() => { const m=document.querySelector('.lg-picker-more'); if(m) m.click(); return 1 })()`);
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(`(() => { document.querySelectorAll('.lg-picker-section').forEach(s=>{ if(s.getAttribute('data-lg-open')==='false') s.querySelector('.lg-picker-heading').click(); }); return 1 })()`);
  await new Promise(r => setTimeout(r, 700));

  // which GLM-5.3 rows are checked
  report.checkedBefore = await page.evaluate(`(() => {
    const out=[];
    document.querySelectorAll('.lg-picker-section').forEach(sec=>{
      const p=(sec.querySelector('.lg-picker-headingName')||{}).textContent;
      sec.querySelectorAll('.lg-picker-option').forEach(o=>{
        const n=(o.querySelector('.lg-picker-name')||{}).textContent||'';
        if(/GLM-5\.3/.test(n)) out.push({p, n, checked:o.getAttribute('aria-checked')});
      });
    });
    return out;
  })()`);

  // click the workbuddy GLM-5.3 row
  const target = await page.evaluate(`(() => {
    const secs=[...document.querySelectorAll('.lg-picker-section')];
    const sec=secs.find(s=>(s.querySelector('.lg-picker-headingName')||{}).textContent==='workbuddy');
    if(!sec) return null;
    const opt=[...sec.querySelectorAll('.lg-picker-option')].find(o=>{ const n=(o.querySelector('.lg-picker-name')||{}).textContent||''; return /^GLM-5\.3/.test(n); });
    if(!opt) return null;
    const r=opt.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2, label:(opt.querySelector('.lg-picker-name')||{}).textContent};
  })()`);
  report.clicked = target;
  if (target) { await clickAt(page, target.x, target.y); await new Promise(r => setTimeout(r, 1200)); }

  report.triggerAfter = await page.evaluate(`(() => { const t=document.querySelector('.lg-picker-label'); return t?t.textContent:null })()`);

  // reopen and inspect checks
  box = await boxOf(page, '.lg-picker-trigger');
  await clickAt(page, box.x, box.y);
  await new Promise(r => setTimeout(r, 800));
  await page.evaluate(`(() => { const m=document.querySelector('.lg-picker-more'); if(m && m.textContent.indexOf('显示全部')===0) m.click(); return 1 })()`);
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(`(() => { document.querySelectorAll('.lg-picker-section').forEach(s=>{ if(s.getAttribute('data-lg-open')==='false') s.querySelector('.lg-picker-heading').click(); }); return 1 })()`);
  await new Promise(r => setTimeout(r, 700));
  report.checkedAfter = await page.evaluate(`(() => {
    const out=[];
    document.querySelectorAll('.lg-picker-section').forEach(sec=>{
      const p=(sec.querySelector('.lg-picker-headingName')||{}).textContent;
      sec.querySelectorAll('.lg-picker-option').forEach(o=>{
        if(o.getAttribute('aria-checked')==='true') out.push({p, n:(o.querySelector('.lg-picker-name')||{}).textContent});
      });
    });
    return out;
  })()`);

  // effort pane
  report.effortRow = await page.evaluate(`(() => { const r=document.querySelector('.lg-picker-effort-row'); return r ? r.textContent : null })()`);
  const eb = await boxOf(page, '.lg-picker-effort-row');
  if (eb) { await clickAt(page, eb.x, eb.y); await new Promise(r => setTimeout(r, 700)); }
  report.effortPane = await page.evaluate(`(() => {
    const p=document.querySelector('.lg-picker-effort-pane');
    if(!p) return null;
    return { text:p.textContent, options:[...p.querySelectorAll('.lg-picker-effort-option')].map(o=>({t:o.textContent, checked:o.getAttribute('aria-checked')})), box:(()=>{const r=p.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})() };
  })()`);
  // pick a different effort
  const pick = await page.evaluate(`(() => {
    const opts=[...document.querySelectorAll('.lg-picker-effort-option')];
    const target=opts.find(o=>o.getAttribute('aria-checked')==='false');
    if(!target) return null;
    const r=target.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,label:target.textContent};
  })()`);
  report.effortClick = pick;
  if (pick) { await clickAt(page, pick.x, pick.y); await new Promise(r => setTimeout(r, 1500)); }
  report.effortAfter = await page.evaluate(`(() => { const t=document.querySelector('.lg-picker-effort'); return t?t.textContent:null })()`);
  await page.screenshot('G:/dsh-build/research/pick-check.png', {});
} catch (e) { report.error = String(e && e.message || e); }
writeFileSync('G:/dsh-build/research/pick-check.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2).slice(0, 5000));
process.exit(0);
