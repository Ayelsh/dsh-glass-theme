import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', 'http://127.0.0.1:56465/']).toString().trim();
const eq = out.indexOf('=');
const b = await launch({ headless: true });
try {
  const page = await b.newPage();
  await page.cookie({ name: out.slice(0, eq), value: out.slice(eq + 1), domain: '127.0.0.1', path: '/' });
  await page.goto('http://127.0.0.1:56465/', { settleMs: 12000 });
  const info = await page.evaluate(`(() => {
    const ctx = window.__lgCtx;
    const sessions = ctx.get('sessions');
    const snap = sessions && sessions.list && sessions.list.getSnapshot ? sessions.list.getSnapshot() : null;
    const ids = snap && Array.isArray(snap.ids) ? snap.ids.slice(0, 6) : [];
    const one = (id) => { const v = snap.byId[id]; return v ? { keys: Object.keys(v), title: String(v.title || v.name || v.label || '').slice(0, 60) } : null; };
    return { top: snap ? Object.keys(snap) : null, sample: ids.map(one) };
  })()`);
  console.log(JSON.stringify(info, null, 1));
} finally { process.exit(0); }
