import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'http://127.0.0.1:54810/';
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = out.indexOf('=');
const b = await launch({ headless: true, width: 1400, height: 950 });
let payload = { error: 'not reached' };
try {
  const page = await b.newPage();
  await page.cookie({ name: out.slice(0, eq), value: out.slice(eq + 1), domain: '127.0.0.1', path: '/' });
  await page.goto(URL_BASE, { settleMs: 12000 });
  await page.evaluate(`(() => { const r=[...document.querySelectorAll('[class*=hIlkoa_sessionRow]')]; if(r[1]) r[1].click(); return 1 })()`);
  await new Promise(r => setTimeout(r, 7000));
  payload = await page.evaluate(`(() => {
    const ctx = window.__lgCtx;
    if (!ctx) return { error: 'no __lgCtx' };
    const v = ctx.get('uiSession').current.value;
    const sid = v.key;
    const dir = ctx.get('modelDirectories').directoryFor(sid);
    const snap = dir.store.getSnapshot();
    const all = [];
    for (const g of snap.groups) for (const m of g.models||[]) all.push({ p: g.id, id: m.id, name: m.name, hasReas: !!m.reasoning, efforts: m.reasoning ? (m.reasoning.efforts||[]).map(e=>e.id) : null });
    const byId = {};
    for (const m of all) { (byId[m.id] = byId[m.id] || []).push(m.p + '/' + m.name); }
    const dups = Object.entries(byId).filter(([,v]) => v.length > 1);
    return { total: all.length, current: snap.current, status: snap.status, dupIds: dups, withReas: all.filter(m=>m.hasReas).length, sample: all.filter(m=>m.hasReas).slice(0,5) };
  })()`);
} catch (e) { payload = { error: String(e && e.message || e) }; }
writeFileSync('G:/dsh-build/research/dup.json', JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2).slice(0, 3000));
process.exit(0);
