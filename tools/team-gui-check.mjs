/**
 * Live GUI observation for the team panel (tasks 1.3 / 8.2 of team-mode-sidebar).
 *
 * Opens the running GUI in a headless browser with a minted session cookie and
 * verifies, against the real application:
 *   1.3 — the team panel mounts inside the sidebar's region area, is visibly
 *         swapped in (open attribute set, browser entries hidden).
 *   8.2 — the ordinary surfaces keep working with the team panel live: the
 *         workspace panel opens, session rows exist, and stowing via the
 *         footer toggle returns the sidebar's own content in place.
 *
 * The only shared-state mutation is the stow toggle, which is reverted before
 * exit (stow -> unstow). No profiles, memory, or side chats are written.
 *
 *   node tools/team-gui-check.mjs [--url http://127.0.0.1:54188/]
 */
import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : process.env.LG_URL ?? 'http://127.0.0.1:54188/';
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = out.indexOf('=');
const name = out.slice(0, eq), value = out.slice(eq + 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Evaluated in the page: true when el and every ancestor up to body render. */
const VISIBLE = `(el) => { let n = el; while (n && n !== document.body) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden') return false; n = n.parentElement; } return true; }`;

const b = await launch({ headless: true, width: 1400, height: 950 });
const results = [];
const note = (label, ok, detail) => {
  results.push({ label, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
};
try {
  const page = await b.newPage();
  await page.cookie({ name, value, domain: '127.0.0.1', path: '/' });
  await page.goto(URL_BASE, { settleMs: 14000 });

  // 1.3 — wait for the team panel to mount (client applies late in boot).
  let mounted = null;
  for (let i = 0; i < 24; i += 1) {
    mounted = await page.evaluate(`(() => {
      const root = document.getElementById('lg-team-root');
      const host = document.querySelector('.lg-team-regionHost');
      const toggle = document.querySelector('.lg-team-sideToggle');
      return {
        root: root !== null,
        hostMounted: root !== null && host !== null && root.parentElement === host,
        open: document.documentElement.getAttribute('data-lg-team-open'),
        toggle: toggle !== null,
        togglePressed: toggle ? toggle.getAttribute('aria-pressed') : null,
        hostShown: host !== null && (${VISIBLE})(host),
      };
    })()`);
    if (mounted.root && mounted.hostMounted && mounted.hostShown) break;
    await sleep(1000);
  }
  note('team root mounted into the region host', mounted !== null && mounted.root && mounted.hostMounted, JSON.stringify(mounted));
  note('open attribute set and host visible (expanded by default)', mounted !== null && mounted.open === 'true' && mounted.hostShown === true, `open=${mounted && mounted.open} shown=${mounted && mounted.hostShown}`);
  note('footer toggle present', mounted !== null && mounted.toggle === true, `pressed=${mounted && mounted.togglePressed}`);

  // Swap semantics: region shows the team panel; other region entries yield.
  const swap = await page.evaluate(`(() => {
    const vis = ${VISIBLE};
    const area = document.querySelector("[class*='regionArea']");
    if (area === null) return { area: false };
    const wrappers = [...area.children];
    const otherShown = wrappers.some((w) => !w.querySelector(':scope > .lg-team-regionHost') && vis(w));
    const center = document.querySelector("[class*='_centerCol']");
    const composer = center !== null && center.querySelector('textarea, [contenteditable="true"], [class*="composer"]') !== null;
    return { area: true, wrappers: wrappers.length, otherShown, centerAlive: center !== null, composer };
  })()`);
  note('region swap: team host shown, sibling entries hidden', swap.area === true && swap.otherShown === false, JSON.stringify(swap));
  note('center column keeps the conversation', swap.centerAlive === true && swap.composer === true, JSON.stringify(swap));

  // 8.2 — session rows still exist in the app with the team panel live.
  const sessions = await page.evaluate(`(() => {
    const vis = ${VISIBLE};
    const rows = [...document.querySelectorAll("[class*='_session'], [class*='sessionRow']")];
    return { rows: rows.length, visibleRows: rows.filter((r) => vis(r)).length };
  })()`);
  note('session surfaces present in the app', sessions.rows > 0, JSON.stringify(sessions));

  // Stow via the footer toggle: the open attribute clears within a tick or two.
  await page.evaluate(`(() => { const t = document.querySelector('.lg-team-sideToggle'); if (t) t.click(); return 1 })()`);
  let stowed = null;
  for (let i = 0; i < 8; i += 1) {
    stowed = await page.evaluate(`(() => {
      const vis = ${VISIBLE};
      const open = document.documentElement.getAttribute('data-lg-team-open');
      const host = document.querySelector('.lg-team-regionHost');
      return { open, hostShown: host !== null && vis(host), mirror: localStorage.getItem('dsh-glass-theme:team') };
    })()`);
    if (stowed.open === null && stowed.hostShown === false) break;
    await sleep(1000);
  }
  note('stow clears the open attribute and hides the team host', stowed !== null && stowed.open === null && stowed.hostShown === false, JSON.stringify(stowed));

  // Unfold again (restores the shared stow preference): the swap returns.
  await page.evaluate(`(() => { const t = document.querySelector('.lg-team-sideToggle'); if (t) t.click(); return 1 })()`);
  let unfolded = null;
  for (let i = 0; i < 8; i += 1) {
    unfolded = await page.evaluate(`(() => {
      const vis = ${VISIBLE};
      const open = document.documentElement.getAttribute('data-lg-team-open');
      const host = document.querySelector('.lg-team-regionHost');
      return { open, hostShown: host !== null && vis(host), mounted: document.getElementById('lg-team-root') !== null, mirror: localStorage.getItem('dsh-glass-theme:team') };
    })()`);
    if (unfolded.open === 'true' && unfolded.hostShown === true) break;
    await sleep(1000);
  }
  note('unfold swaps the team panel back in (state restored)', unfolded !== null && unfolded.open === 'true' && unfolded.hostShown === true && unfolded.mounted === true, JSON.stringify(unfolded));

  // Workspace panel still opens while the team surface is live (8.2).
  await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll("[class*='panelRow']")];
    const ws = rows.find((r) => r.textContent.includes('工作空间'));
    if (ws) ws.click();
    return rows.length;
  })()`);
  await sleep(1800);
  const wsOpen = await page.evaluate(`(() => {
    const ws = document.querySelector('.lgws-root, .lgws-page, [class*="workspace"]');
    return { found: ws !== null, cls: ws ? String(ws.className).slice(0, 50) : null };
  })()`);
  note('workspace panel opens alongside the team surface', wsOpen.found === true, JSON.stringify(wsOpen));
} catch (error) {
  note('script error', false, String(error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : error));
} finally {
  await b.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} live observations pass`);
if (failed.length > 0) process.exitCode = 1;
