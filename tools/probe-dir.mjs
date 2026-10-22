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
  await page.goto(URL_BASE, { settleMs: 9000 });
  const r = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[class*=hIlkoa_sessionRow]')];
    const row = rows[2] || rows[0];
    if (row) row.click();
    return { rows: rows.length, clicked: row ? row.textContent.slice(0,30) : null };
  })()`);
  await new Promise(r => setTimeout(r, 5000));
  const d = await page.evaluate(`(() => {
    const ld = window.__ModuleLoader__;
    return { hasLoader: !!ld, keys: ld ? Object.keys(ld) : [] };
  })()`);
  console.log(JSON.stringify({ r, d }, null, 2));
} finally { await b.close(); }
