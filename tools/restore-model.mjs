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
  await page.evaluate(`(() => { const r=[...document.querySelectorAll('[class*=hIlkoa_sessionRow]')]; if(r[1]) r[1].click(); return 1 })()`);
  await new Promise(r => setTimeout(r, 7000));
  const r = await page.evaluate(`(() => {
    const ctx=window.__lgCtx; const v=ctx.get('uiSession').current.value;
    const dir=ctx.get('modelDirectories').directoryFor(v.key);
    let res=[];
    try { const o=dir.select({provider:'workbuddy', model:'glm-5.3', reasoningEffort:'max'}); if(o&&o.catch) o.catch(()=>{}); res.push('glm-5.3/max'); } catch(e){ res.push(String(e)); }
    try { localStorage.removeItem('dsh-glass-theme:quick-providers'); res.push('quick cleared'); } catch(e){}
    return res;
  })()`);
  await new Promise(r => setTimeout(r, 1500));
  const after = await page.evaluate(`(() => {
    const ctx=window.__lgCtx; const v=ctx.get('uiSession').current.value;
    const s=ctx.get('modelDirectories').directoryFor(v.key).store.getSnapshot();
    return { current: s.current, ls: localStorage.getItem('dsh-glass-theme:quick-providers') };
  })()`);
  console.log('DONE', JSON.stringify(r), JSON.stringify(after));
} finally { process.exit(0); }
