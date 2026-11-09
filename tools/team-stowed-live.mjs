import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = process.env.LG_URL ?? 'http://127.0.0.1:65131/';
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = out.indexOf('=');
const name = out.slice(0, eq), value = out.slice(eq + 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const READ_SIDEBAR = `(() => {
  const toggle = document.querySelector('.lg-team-sideToggle');
  const regionHost = document.querySelector('.lg-team-regionHost');
  const teamRoot = document.getElementById('lg-team-root');
  const openAttr = document.documentElement.getAttribute('data-lg-team-open');
  const workspaceSlot = document.querySelector('[data-slot="sidebar.workspaces"]');
  const workspaceText = workspaceSlot ? workspaceSlot.innerText.slice(0, 150) : null;
  const sessionRows = document.querySelectorAll('[class*="sessionRow"], [class*="_session"], [class*="session_item"]');
  const allSlots = [...document.querySelectorAll('[data-slot]')].map((s) => s.getAttribute('data-slot'));
  return {
    toggle: toggle !== null,
    togglePressed: toggle ? toggle.getAttribute('aria-pressed') : null,
    toggleLabel: toggle ? toggle.getAttribute('aria-label') : null,
    regionHost: regionHost !== null,
    teamRoot: teamRoot !== null,
    teamVisible: teamRoot ? (teamRoot.offsetWidth > 0 && teamRoot.offsetHeight > 0) : false,
    openAttr,
    workspaceSlot: workspaceSlot !== null,
    workspaceText,
    sessionRowCount: sessionRows.length,
    allSlots: allSlots.slice(0, 15),
  };
})()`;

const CLICK_TOGGLE = `(() => {
  const toggle = document.querySelector('.lg-team-sideToggle');
  if (!toggle) return false;
  toggle.click();
  return true;
})()`;

const b = await launch({ headless: true, width: 1440, height: 960 });
try {
  const page = await b.newPage();
  await page.cookie({ name, value, domain: '127.0.0.1', path: '/' });
  await page.goto(URL_BASE, { settleMs: 12000 });

  console.log('--- PHASE 1: INITIAL STOWED STATE ---');
  let s1 = await page.evaluate(READ_SIDEBAR);
  console.log('Stowed info:', JSON.stringify(s1, null, 2));

  // Take screenshot of stowed sidebar
  await page.screenshot(resolve(here, '..', 'team-stowed-live.png'), {
    width: 1440,
    height: 960,
  });
  console.log('Captured team-stowed-live.png');

  console.log('--- PHASE 2: CLICK EXPAND ---');
  await page.evaluate(CLICK_TOGGLE);
  await sleep(3000);
  let s2 = await page.evaluate(READ_SIDEBAR);
  console.log('Expanded info:', JSON.stringify(s2, null, 2));

  await page.screenshot(resolve(here, '..', 'team-expanded-live.png'), {
    width: 1440,
    height: 960,
  });
  console.log('Captured team-expanded-live.png');

  console.log('--- PHASE 3: CLICK STOW BACK ---');
  await page.evaluate(CLICK_TOGGLE);
  await sleep(3000);
  let s3 = await page.evaluate(READ_SIDEBAR);
  console.log('Re-stowed info:', JSON.stringify(s3, null, 2));

  await page.screenshot(resolve(here, '..', 'team-restowed-live.png'), {
    width: 1440,
    height: 960,
  });
  console.log('Captured team-restowed-live.png');

  console.log('Summary:');
  console.log('Phase 1 stowed -> openAttr:', s1.openAttr, 'teamRoot:', s1.teamRoot, 'workspaceText:', JSON.stringify(s1.workspaceText));
  console.log('Phase 2 expanded -> openAttr:', s2.openAttr, 'teamRoot:', s2.teamRoot, 'teamVisible:', s2.teamVisible);
  console.log('Phase 3 restowed -> openAttr:', s3.openAttr, 'teamRoot:', s3.teamRoot, 'workspaceText:', JSON.stringify(s3.workspaceText));

} finally {
  await b.close();
}
