// Dump main-card and all-card rects to see why they overlap.
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
  // configure quick providers like two-level.mjs does, then reload
  await page.evaluate(`(() => { localStorage.setItem('dsh-glass-theme:quick-providers', JSON.stringify(['workbuddy'])); return 1 })()`);
  await page.goto(URL_BASE, { settleMs: 12000 });
  await page.evaluate(`(() => { const r=[...document.querySelectorAll('[class*=hIlkoa_sessionRow]')]; if(r[1]) r[1].click(); return 1 })()`);
  await new Promise(r => setTimeout(r, 6000));
  const box = await page.evaluate(`(() => { const t=document.querySelector('.lg-picker-trigger'); const r=t.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`);
  await clickAt(page, box.x, box.y);
  await new Promise(r => setTimeout(r, 800));
  const door = await page.evaluate(`(() => { const d=document.querySelector('.lg-picker-more'); if(!d) return null; const r=d.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`);
  if (door) { await clickAt(page, door.x, door.y); await new Promise(r => setTimeout(r, 900)); }
  const rects = await page.evaluate(`(() => {
    const pick = (el) => { if(!el) return null; const r=el.getBoundingClientRect(); return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]; };
    const all = document.querySelector('.lg-picker-card-all');
    const card = document.querySelector('.lg-picker-card:not(.lg-picker-card-all)');
    const a = all && all.getBoundingClientRect(), c = card && card.getBoundingClientRect();
    return {
      trigger: pick(document.querySelector('.lg-picker-trigger')),
      card: card ? pick(card) : null,
      all: all ? pick(all) : null,
      overlaps: !!(a && c) && !(a.right <= c.left || a.left >= c.right || a.bottom <= c.top || a.top >= c.bottom),
      allStyle: all ? all.getAttribute('style') : null,
      innerWidth: window.innerWidth,
    };
  })()`);
  console.log('RECTS', JSON.stringify(rects, null, 1));
} finally { process.exit(0); }
