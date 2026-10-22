import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = 'http://127.0.0.1:54810/';
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
  await page.evaluate(`(() => { const r=[...document.querySelectorAll('[class*=hIlkoa_sessionRow]')]; if(r[1]) r[1].click(); return 1 })()`);
  await new Promise(r => setTimeout(r, 7000));
  const s1 = await page.evaluate(`(() => {
    const ctx = window.__lgCtx; const v = ctx.get('uiSession').current.value;
    const dir = ctx.get('modelDirectories').directoryFor(v.key); const s = dir.store.getSnapshot();
    return { current: s.current, retained: s.retainedEffort, keys: Object.keys(s) };
  })()`);
  console.log('BEFORE', JSON.stringify(s1));
  // try selecting with an explicit effort via directory
  const s2 = await page.evaluate(`(() => {
    const ctx = window.__lgCtx; const v = ctx.get('uiSession').current.value;
    const dir = ctx.get('modelDirectories').directoryFor(v.key);
    let res=null;
    try { const o = dir.select({ provider:'workbuddy', model:'glm-5.3-flash', reasoningEffort:'high' }); if(o&&o.catch) o.catch(()=>{}); res='called'; } catch(e){ res=String(e); }
    return res;
  })()`);
  await new Promise(r => setTimeout(r, 1500));
  const s3 = await page.evaluate(`(() => {
    const ctx = window.__lgCtx; const v = ctx.get('uiSession').current.value;
    const dir = ctx.get('modelDirectories').directoryFor(v.key); const s = dir.store.getSnapshot();
    return { current: s.current, retained: s.retainedEffort };
  })()`);
  console.log('SELECT', s2, '→', JSON.stringify(s3));
} finally { process.exit(0); }
