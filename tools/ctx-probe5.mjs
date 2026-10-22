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
    const sess = ui.current.value.hooks.session;
    const p = sess.projections;
    const f = p.faceOf('sessionStats');
    const o = { faceKeys: f ? Object.keys(f) : null, faceProto: f ? Object.getOwnPropertyNames(Object.getPrototypeOf(f)||{}) : null };
    // dock slot
    const dock = document.querySelector('[data-slot="conversation.composer.dock"]');
    o.dock = dock ? { children: dock.children.length, html: dock.innerHTML.slice(0,300) } : null;
    const cd = document.querySelector('[data-composer-dock]');
    o.composerDock = cd ? { children: cd.children.length, kids: [...cd.children].map(c=>c.className) } : null;
    // settings slots
    o.slotsKeys = Object.keys(ctx.get('slots') || {});
    return o;
  })()`);
  console.log(JSON.stringify(r, null, 2).slice(0, 4000));
} finally { await b.close(); }
