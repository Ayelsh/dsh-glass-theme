/**
 * Live verification requested by the user: with team mode ENABLED and the
 * team panel STOWED, the sidebar's own session list must still be there.
 *
 * Boots the real GUI in a headless browser with a minted cookie, waits for
 * the team panel to mount, ensures the stowed state (clicks the footer
 * toggle if the panel happens to be open), counts visible session rows,
 * and captures a screenshot of the whole window.
 *
 *   node tools/team-stowed-shot.mjs [--url http://127.0.0.1:54188/] [--out team-stowed-sidebar.png]
 */
import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : process.env.LG_URL ?? 'http://127.0.0.1:54188/';
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'team-stowed-sidebar.png';
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = out.indexOf('=');
const name = out.slice(0, eq), value = out.slice(eq + 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Evaluated in the page: true when el and every ancestor up to body render. */
const VISIBLE = `(el) => { let n = el; while (n && n !== document.body) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden') return false; n = n.parentElement; } return true; }`;

const b = await launch({ headless: true, width: 1440, height: 960 });
try {
  const page = await b.newPage();
  await page.cookie({ name, value, domain: '127.0.0.1', path: '/' });
  await page.goto(URL_BASE, { settleMs: 14000 });

  // Wait for the team panel to mount (team mode enabled = the root exists).
  let state = null;
  for (let i = 0; i < 24; i += 1) {
    state = await page.evaluate(`(() => ({
      mounted: document.getElementById('lg-team-root') !== null,
      toggle: document.querySelector('.lg-team-sideToggle') !== null,
      open: document.documentElement.getAttribute('data-lg-team-open'),
    }))()`);
    if (state.mounted && state.toggle) break;
    await sleep(1000);
  }
  console.log(`boot: ${JSON.stringify(state)}`);
  if (!state?.mounted) throw new Error('team panel never mounted (is team mode enabled?)');

  // Ensure the stowed state the user asked about.
  if (state.open === 'true') {
    await page.evaluate(`(() => { document.querySelector('.lg-team-sideToggle')?.click(); return true; })()`);
    for (let i = 0; i < 10; i += 1) {
      await sleep(1000);
      const open = await page.evaluate(`document.documentElement.getAttribute('data-lg-team-open')`);
      if (open === null) break;
    }
  }

  // Measure: stowed panel + visible session rows.
  const measure = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll("[class*='_session'], [class*='sessionRow']")];
    const visibleRows = rows.filter((el) => (${VISIBLE})(el));
    const region = document.querySelector("[class*='regionArea']");
    const root = document.getElementById('lg-team-root');
    return {
      open: document.documentElement.getAttribute('data-lg-team-open'),
      stowed: root ? root.getAttribute('data-collapsed') : null,
      sessionRows: rows.length,
      visibleSessionRows: visibleRows.length,
      firstRowText: (visibleRows[0]?.textContent ?? '').slice(0, 40),
      regionAreaPresent: region !== null,
    };
  })()`);
  console.log(`measure: ${JSON.stringify(measure, null, 2)}`);
  if (measure.open !== null) throw new Error('panel is not stowed — open attribute still set');
  if (measure.visibleSessionRows === 0) throw new Error('no visible session rows while stowed');

  const saved = await page.screenshot(resolve(here, '..', OUT), { width: 1440, height: 960 });
  console.log(`screenshot: ${saved}`);
} finally {
  await b.close();
}
