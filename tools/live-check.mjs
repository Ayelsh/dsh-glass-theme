import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'http://127.0.0.1:54810/';
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = out.indexOf('=');
const name = out.slice(0, eq), value = out.slice(eq + 1);
const b = await launch({ headless: true, width: 1400, height: 950 });
try {
  const page = await b.newPage();
  await page.cookie({ name, value, domain: '127.0.0.1', path: '/' });
  await page.goto(URL_BASE, { settleMs: 13000 });
  await page.evaluate(`(() => { const r=[...document.querySelectorAll('[class*=hIlkoa_sessionRow]')]; if(r[1]) r[1].click(); return 1 })()`);
  await new Promise(r => setTimeout(r, 8000));
  const r = await page.evaluate(`(() => {
    const o = {};
    o.hasStatsSeat = !!document.querySelector('.lg-stats');
    o.statsAttr = document.documentElement.hasAttribute('data-lg-stats');
    o.hostPillsHidden = [...document.querySelectorAll('[data-composer-stat]')].map(e => getComputedStyle(e).display);
    o.meterHidden = (() => { const m = document.querySelector('[class*=_2WTFBq_root]'); return m ? getComputedStyle(m).display : 'absent'; })();
    const t = document.querySelector('.lg-stats-trigger');
    o.trigger = t ? { text: t.textContent, aria: t.getAttribute('aria-label') } : null;
    const pk = document.querySelector('.lg-picker-trigger');
    o.pickerTrigger = pk ? pk.textContent : null;
    return o;
  })()`);
  console.log(JSON.stringify(r, null, 2));
  // open the picker
  const box = await page.evaluate(`(() => { const t=document.querySelector('.lg-picker-trigger'); if(!t) return null; const r=t.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2} })()`);
  if (box) {
    for (const type of ['mousePressed','mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 1200));
    const card = await page.evaluate(`(() => {
      const c = document.querySelector('.lg-picker-card');
      if (!c) return { err: 'no card' };
      const secs = [...c.querySelectorAll('.lg-picker-section')];
      return {
        sections: secs.map(s => ({ open: s.getAttribute('data-lg-open'), quick: s.getAttribute('data-lg-quick'), name: (s.querySelector('.lg-picker-headingName')||{}).textContent, rows: s.querySelectorAll('.lg-picker-option').length, visibleRows: [...s.querySelectorAll('.lg-picker-option')].filter(o=>getComputedStyle(o).display!=='none').length })),
        more: !!c.querySelector('.lg-picker-more'),
        effortRow: (()=>{const e=c.querySelector('.lg-picker-effort-row'); return e ? e.textContent : null})(),
        checked: [...c.querySelectorAll('.lg-picker-option[aria-checked=true]')].map(o=>o.querySelector('.lg-picker-name').textContent),
      };
    })()`);
    console.log('CARD', JSON.stringify(card, null, 2));
  }
  // open stats
  const sbox = await page.evaluate(`(() => { const t=document.querySelector('.lg-stats-trigger'); if(!t) return null; const r=t.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2} })()`);
  if (sbox) {
    for (const type of ['mousePressed','mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: sbox.x, y: sbox.y, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 1200));
    const panel = await page.evaluate(`(() => {
      const p = document.querySelector('.lg-stats-panel');
      if (!p) return { err: 'no panel' };
      return { text: p.innerText.slice(0, 700), box: (()=>{const r=p.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]})(), bg: getComputedStyle(p).backgroundColor, radius: getComputedStyle(p).borderRadius, backdrop: getComputedStyle(p).backdropFilter };
    })()`);
    console.log('PANEL', JSON.stringify(panel, null, 2));
  }
} finally { await b.close(); }
