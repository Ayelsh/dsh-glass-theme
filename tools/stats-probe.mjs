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
  await new Promise(r => setTimeout(r, 9000));
  const r = await page.evaluate(`(() => {
    const o = {};
    const seat = document.querySelector('.lg-stats');
    o.seat = seat ? { children: seat.children.length, html: seat.innerHTML.slice(0, 200) } : null;
    // read the projections the same way stats.js does
    const ctx = window.__lgCtx;
    const ui = ctx.get('uiSession');
    const v = ui.current.value;
    o.hasHooks = !!(v && v.hooks && v.hooks.session);
    const sess = v.hooks.session;
    o.projFaceOf = typeof (sess.projections && sess.projections.faceOf);
    const names = ['contextPressure','contextBreakdown','sessionStats','tokenUsage'];
    o.vals = {};
    for (const n of names) {
      try { const f = sess.projections.faceOf(n); o.vals[n] = f ? (f.getSnapshot() ? 'ok' : 'nullsnap') : 'noface'; }
      catch (e) { o.vals[n] = 'THROW ' + e.message; }
    }
    o.dock = (() => { const d = document.querySelector('[data-composer-dock]'); return d ? [...d.children].map(c => c.className || c.tagName) : null; })();
    return o;
  })()`);
  console.log(JSON.stringify(r, null, 2));
} finally { await b.close(); }
