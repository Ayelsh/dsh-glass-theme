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
    const o = {};
    const s = ctx.get('sessions');
    o.sessionsKeys = Object.keys(s || {});
    const list = s && s.list;
    o.listKeys = list ? Object.keys(list) : null;
    const snap = list && typeof list.getSnapshot === 'function' ? list.getSnapshot() : null;
    o.snapKeys = snap ? Object.keys(snap) : null;
    o.snapCurrent = snap ? snap.current : null;
    o.snapSessionsType = snap && snap.sessions ? (Array.isArray(snap.sessions) ? 'array' + snap.sessions.length : typeof snap.sessions) : null;
    const ui = ctx.get('uiSession');
    o.uiKeys = Object.keys(ui || {});
    o.uiCurrent = ui && ui.current ? ui.current.value : null;
    const md = ctx.get('modelDirectories');
    o.mdKeys = Object.keys(md || {});
    return o;
  })()`);
  console.log(JSON.stringify(r, null, 2));
} finally { await b.close(); }
