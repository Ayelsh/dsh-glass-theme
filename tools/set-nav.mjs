import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = 'http://127.0.0.1:54810/';
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = out.indexOf('=');
const b = await launch({ headless: true, width: 1400, height: 950 });
try {
  const page = await b.newPage();
  await page.cookie({ name: out.slice(0, eq), value: out.slice(eq + 1), domain: '127.0.0.1', path: '/' });
  await page.goto(URL_BASE, { settleMs: 12000 });
  // find the account trigger by its avatar row class
  const acc = await page.evaluate(`(() => { const t=document.querySelector('[class*="ET65mq_trigger"]'); if(!t) return null; const r=t.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`);
  console.log('ACCOUNT', JSON.stringify(acc));
  if (acc) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: acc.x, y: acc.y });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: acc.x, y: acc.y, button: 'left', clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: acc.x, y: acc.y, button: 'left', clickCount: 1 });
  }
  await new Promise(r => setTimeout(r, 1100));
  const menu = await page.evaluate(`(() => { const items=[...document.querySelectorAll('[role=menuitem],[role=menuitemradio],[class*="_item_"]')].map(x=>x.textContent.trim()).filter(Boolean); return items.slice(0,20) })()`);
  console.log('MENU', JSON.stringify(menu));
  const set = await page.evaluate(`(() => { const m=[...document.querySelectorAll('[role=menuitem],[role=menuitemradio],[class*="_item_"],button')].find(x=>x.textContent.trim().indexOf('设置')===0); if(!m) return null; const r=m.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`);
  console.log('SET', JSON.stringify(set));
  if (set) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: set.x, y: set.y });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: set.x, y: set.y, button: 'left', clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: set.x, y: set.y, button: 'left', clickCount: 1 });
  }
  await new Promise(r => setTimeout(r, 3500));
  const nav = await page.evaluate(`(() => [...document.querySelectorAll('[class*=wCInkW_navCell]')].map(x=>x.textContent.trim()) )()`);
  console.log('NAV', JSON.stringify(nav));
} finally { process.exit(0); }
