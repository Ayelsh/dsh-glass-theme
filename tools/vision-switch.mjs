// Switch THIS conversation's model: default target is the headless page's own
// current session (uiSession.current — no title search, immune to duplicate
// titles from forked sessions); --find still works for a remote session.
// usage: node tools/vision-switch.mjs --provider <id> --model <id> [--find <substr>] [--url ...]
import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const argv = process.argv.slice(2);
const one = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const URL_BASE = one('--url', 'http://127.0.0.1:56465/');
const find = one('--find', '');
const provider = one('--provider', '');
const model = one('--model', '');
if (!provider || !model) { console.error('usage: --provider <id> --model <id> [--find <substr>]'); process.exit(2); }
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = out.indexOf('=');
const b = await launch({ headless: true, width: 1400, height: 950 });
try {
  const page = await b.newPage();
  await page.cookie({ name: out.slice(0, eq), value: out.slice(eq + 1), domain: '127.0.0.1', path: '/' });
  await page.goto(URL_BASE, { settleMs: 12000 });
  const info = await page.evaluate(`(() => {
    const ctx = window.__lgCtx;
    if (!${JSON.stringify(find)}) {
      const cur = ctx.get('uiSession').current.value;
      return { mode: 'current', key: cur.key, title: String(cur.displayTitle || cur.title || '').slice(0, 40) };
    }
    const snap = ctx.get('sessions').list.getSnapshot();
    const rows = Array.isArray(snap.ids) ? snap.ids.map((id) => snap.byId[id]).filter(Boolean) : [];
    const pick = rows.find((r) => String(r.displayTitle || r.title || '').includes(${JSON.stringify(find)}));
    return { mode: 'find', total: rows.length, titles: rows.slice(0, 6).map((r) => String(r.displayTitle || '').slice(0, 36)), key: pick ? pick.id : null };
  })()`);
  console.log('SESSIONS', JSON.stringify(info));
  if (!info.key) { console.log('NO-MATCH'); process.exit(1); }
  // The directory only resolves a scope for a session the PAGE has opened. In
  // --find mode that means clicking the sidebar row; in current mode the page
  // is already on it.
  if (info.mode === 'find') {
    await page.evaluate(`(() => {
      const needle = ${JSON.stringify(find)}.toLowerCase();
      const rows = [...document.querySelectorAll('[class*=hIlkoa_sessionRow]')];
      const row = rows.find((r) => (r.textContent || '').toLowerCase().includes(needle));
      if (row) row.click();
      return !!row;
    })()`);
    await new Promise(r => setTimeout(r, 6000));
  }
  // The directory resolves a scope lazily after the page opens the session;
  // retry — a too-early select is the 'resolved no scope' failure mode.
  let after = null;
  for (let attempt = 0; attempt < 3 && after === null; attempt += 1) {
    try {
      after = await page.evaluate(`(() => {
        const ctx = window.__lgCtx;
        return ctx.get('modelDirectories').directoryFor(${JSON.stringify(info.key)}).select({ provider: ${JSON.stringify(provider)}, model: ${JSON.stringify(model)} });
      })()`);
    } catch (error) {
      if (attempt === 2) { console.log('SELECT-ERROR', String(error)); }
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  if (after !== null) console.log('SELECT-RETURNED', String(after));
  await new Promise(r => setTimeout(r, 2500));
  try {
    const check = await page.evaluate(`(() => {
      const ctx = window.__lgCtx;
      return ctx.get('modelDirectories').directoryFor(${JSON.stringify(info.key)}).store.getSnapshot().current;
    })()`);
    console.log('SWITCHED', JSON.stringify(check));
  } catch (error) {
    console.log('CHECK-ERROR', String(error && error.message ? error.message : error));
  }
} finally { process.exit(0); }
