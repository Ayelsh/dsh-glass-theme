import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = 'http://127.0.0.1:54810/';
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = out.indexOf('=');
const theme = process.argv.includes('--theme') ? process.argv[process.argv.indexOf('--theme') + 1] : 'dark';
const b = await launch({ headless: true, width: 1400, height: 950 });
const clickAt = async (page, x, y) => {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
};
const shot = (page, file, box, pad) => page.screenshot(file, { clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 } });
try {
  const page = await b.newPage();
  await page.cookie({ name: out.slice(0, eq), value: out.slice(eq + 1), domain: '127.0.0.1', path: '/' });
  await page.goto(URL_BASE, { settleMs: 12000 });
  if (theme === 'light') await page.evaluate(`(() => { document.body.removeAttribute('data-ds-dark-theme'); document.documentElement.setAttribute('data-ds-theme-source','light'); return 1 })()`);
  await page.evaluate(`(() => { const r=[...document.querySelectorAll('[class*=hIlkoa_sessionRow]')]; if(r[1]) r[1].click(); return 1 })()`);
  await new Promise(r => setTimeout(r, 7000));

  // pin two quick providers for the shot
  await page.evaluate(`(() => { localStorage.setItem('dsh-glass-theme:quick-providers', JSON.stringify({ providers: ['deepseek-account', 'zai-coding-cn'], models: {} })); return 1 })()`);
  await page.evaluate(`(() => { window.dispatchEvent(new Event('storage')); return 1 })()`);

  // --- picker: quick view ---
  let box = await page.evaluate(`(() => { const t=document.querySelector('.lg-picker-trigger'); const r=t.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`);
  await clickAt(page, box.x, box.y);
  await new Promise(r => setTimeout(r, 900));
  let card = await page.evaluate(`(() => { const c=document.querySelector('.lg-picker-card'); if(!c) return null; const r=c.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height} })()`);
  if (card) await shot(page, `G:/dsh-build/research/fin-${theme}-quick.png`, card, 14);
  // --- expand to full collapsed list ---
  await page.evaluate(`(() => { const m=document.querySelector('.lg-picker-more'); if(m) m.click(); return 1 })()`);
  await new Promise(r => setTimeout(r, 700));
  card = await page.evaluate(`(() => { const c=document.querySelector('.lg-picker-card'); if(!c) return null; const r=c.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height} })()`);
  if (card) await shot(page, `G:/dsh-build/research/fin-${theme}-all.png`, card, 14);
  // --- effort pane ---
  await page.evaluate(`(() => { const r=document.querySelector('.lg-picker-effort-row'); if(r) r.scrollIntoView({block:'center'}); return 1 })()`);
  await new Promise(r => setTimeout(r, 300));
  const eb = await page.evaluate(`(() => { const r=document.querySelector('.lg-picker-effort-row'); if(!r) return null; const b=r.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2} })()`);
  if (eb) { await clickAt(page, eb.x, eb.y); await new Promise(r => setTimeout(r, 700)); }
  card = await page.evaluate(`(() => { const c=document.querySelector('.lg-picker-card'); if(!c) return null; const r=c.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height} })()`);
  if (card) await shot(page, `G:/dsh-build/research/fin-${theme}-effort.png`, card, 14);
  // close
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 20, y: 20, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 20, y: 20, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 500));

  // --- stats panel ---
  const sb = await page.evaluate(`(() => { const t=document.querySelector('.lg-stats-trigger'); if(!t) return null; const r=t.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`);
  if (sb) { await clickAt(page, sb.x, sb.y); await new Promise(r => setTimeout(r, 900)); }
  const panel = await page.evaluate(`(() => { const p=document.querySelector('.lg-stats-panel'); if(!p) return null; const r=p.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height} })()`);
  if (panel) await shot(page, `G:/dsh-build/research/fin-${theme}-stats.png`, panel, 14);

  // --- settings page ---
  await page.evaluate(`(() => { const t=[...document.querySelectorAll('button,[role=button]')].find(x=>x.textContent.trim()&&(x.textContent.trim().startsWith('阿耶')||x.textContent.trim().length<8&&/阿耶/.test(x.textContent))); if(t){t.click();return true} return false })()`);
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(`(() => { const m=[...document.querySelectorAll('[role=menuitem],[role=menuitemradio],button,li')].find(x=>x.textContent.trim()==='设置'); if(m){m.click();return true} return false })()`);
  await new Promise(r => setTimeout(r, 1800));
  const nav = await page.evaluate(`(() => { const c=[...document.querySelectorAll('[class*=wCInkW_navCell]')].find(x=>/Liquid Glass/i.test(x.textContent)); if(c){c.click();return true} return false })()`);
  await new Promise(r => setTimeout(r, 1200));
  const sec = await page.evaluate(`(() => { const s=document.querySelector('.lg-settings'); if(!s) return null; const r=s.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:Math.min(r.height,700)} })()`);
  if (sec) await shot(page, `G:/dsh-build/research/fin-${theme}-settings.png`, sec, 14);
  console.log(JSON.stringify({ theme, pickerQuick: true, navFound: nav }));
} catch (e) { console.log('ERR', String(e && e.message || e)); } finally { process.exit(0); }
