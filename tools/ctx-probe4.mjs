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
    const ui = ctx.get('uiSession');
    const key = ui.current.value.key;
    const md = ctx.get('modelDirectories');
    let dir = null;
    try { dir = md.directoryFor(key); } catch (e) { o.dirErr = e.message; }
    if (dir) {
      o.dirKeys = Object.keys(dir);
      o.dirProto = Object.getOwnPropertyNames(Object.getPrototypeOf(dir) || {});
      try { o.snap = (()=>{ const s = dir.store.getSnapshot(); return { keys: Object.keys(s), current: s.current, status: s.status, groupCount: (s.groups||[]).length }; })(); } catch(e){ o.snapErr = e.message; }
      try {
        const g = (dir.store.getSnapshot().groups || [])[0];
        o.firstGroup = g ? { keys: Object.keys(g), id: g.id, modelKeys: g.models && g.models[0] ? Object.keys(g.models[0]) : null, m0: g.models && g.models[0] } : null;
      } catch (e) { o.gErr = e.message; }
      try {
        const groups = dir.store.getSnapshot().groups || [];
        const withReasoning = [];
        for (const g of groups) for (const m of (g.models||[])) if (m.reasoning) withReasoning.push({ g: g.id, m: m.id, r: m.reasoning });
        o.withReasoning = withReasoning.slice(0, 3);
        o.reasoningCount = withReasoning.length;
      } catch (e) { o.rErr = e.message; }
    }
    o.hasSettings = ctx.get('settings') === undefined ? 'undef' : 'present';
    try { o.ctxKeys = Object.keys(ctx).slice(0,40); } catch(e) {}
    return o;
  })()`);
  console.log(JSON.stringify(r, null, 2).slice(0, 5000));
} finally { await b.close(); }
