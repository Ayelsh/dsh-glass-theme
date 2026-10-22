import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'http://127.0.0.1:54810/';
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = out.indexOf('=');
const name = out.slice(0, eq), value = out.slice(eq + 1);
const b = await launch({ headless: true, width: 1280, height: 900 });
try {
  const page = await b.newPage();
  await page.cookie({ name, value, domain: '127.0.0.1', path: '/' });
  await page.goto(URL_BASE, { settleMs: 12000 });
  await page.evaluate(`(() => { const r=[...document.querySelectorAll('[class*=hIlkoa_sessionRow]')]; if(r[1]) r[1].click(); return 1 })()`);
  await new Promise(r => setTimeout(r, 7000));
  const r = await page.evaluate(`(() => {
    const ctx = window.__lgCtx;
    const ui = ctx.get('uiSession');
    const val = ui.current.value;
    const sess = val.hooks.session;
    const o = { sessKeys: Object.keys(sess) };
    o.projKeys = sess.projections ? Object.keys(sess.projections) : null;
    o.optKeys = sess.options ? Object.keys(sess.options) : null;
    const vc = sess.options && sess.options.projections ? sess.options.projections.valuesCache : null;
    o.cacheKeys = vc ? Object.keys(vc) : null;
    if (vc) {
      o.sample = {};
      for (const k of ['contextPressure','contextBreakdown','sessionStats','tokenUsage','modelSelection','turnOutline']) {
        o.sample[k] = vc[k] === undefined ? 'ABSENT' : vc[k];
      }
    }
    if (sess.projections && typeof sess.projections.faceOf === 'function') {
      o.face = {};
      for (const k of ['contextPressure','contextBreakdown','sessionStats','tokenUsage','modelSelection']) {
        try { const f = sess.projections.faceOf(k); o.face[k] = f && typeof f.getSnapshot === 'function' ? f.getSnapshot() : 'nofn'; }
        catch (e) { o.face[k] = 'THROW ' + e.message; }
      }
    }
    return o;
  })()`);
  console.log(JSON.stringify(r, null, 2).slice(0, 6000));
} finally { await b.close(); }
