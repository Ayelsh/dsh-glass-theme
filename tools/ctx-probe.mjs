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
  await new Promise(r => setTimeout(r, 6000));
  const r = await page.evaluate(`(() => {
    const ctx = window.__lgCtx;
    if (!ctx) return { err: 'no ctx' };
    const names = ['sessions','uiSession','modelDirectories','settings','slots','locale','conversation','uiConversation','projections','sessionQuery'];
    const out = {};
    for (const n of names) {
      try {
        const v = ctx.get(n);
        out[n] = v === undefined ? 'undefined' : (v === null ? 'null' : typeof v);
      } catch (e) { out[n] = 'THROW ' + e.message; }
    }
    let proj = null;
    try {
      const s = ctx.get('sessions');
      const cur = s && s.list ? s.list.getSnapshot().current : null;
      out.currentSession = cur;
      const binding = s && typeof s.binding === 'function' ? (()=>{ try { return !!s.binding(cur) } catch(e){ return 'THROW '+e.message } })() : 'no binding fn';
      out.binding = binding;
    } catch (e) { out.sessionsErr = e.message; }
    return out;
  })()`);
  console.log(JSON.stringify(r, null, 2));
} finally { await b.close(); }
