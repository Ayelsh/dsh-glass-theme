// tools/wsselect-probe.mjs
//
// Why the TAPD project picker's options were invisible (0.3.1). The native
// <select> popup is painted by the browser, so this probe cannot screenshot it
// — instead it proves the input to that paint: the select and its options must
// compute a real background colour, not `rgba(0, 0, 0, 0)`. Chrome copies the
// select's own background into the open list, and a transparent one is copied
// verbatim with no themed fallback; the option rule inks the rows themselves.
//
//   node tools/wsselect-probe.mjs [--url http://127.0.0.1:63019/]
//
// Needs the GUI running; it mints its own auth cookie from the local credential
// store, same as the other live probes.
import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://127.0.0.1:63019/';
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = out.indexOf('=');

const browser = await launch({ headless: true, width: 1400, height: 950 });
try {
  const page = await browser.newPage();
  await page.cookie({ name: out.slice(0, eq), value: out.slice(eq + 1), domain: '127.0.0.1', path: '/' });
  await page.goto(URL_BASE, { settleMs: 12000 });
  const report = await page.evaluate(`(() => {
    const result = {};
    result.theme = {
      dark: document.body.hasAttribute('data-ds-dark-theme'),
      built: document.documentElement.getAttribute('data-dsh-glass-theme-built'),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    };
    const host = document.querySelector('[data-slot=main]') || document.body;
    const select = document.createElement('select');
    select.className = 'lgws-wsSelect';
    for (const label of ['alpha', 'beta']) {
      const option = document.createElement('option');
      option.value = label;
      option.textContent = label;
      select.appendChild(option);
    }
    host.appendChild(select);
    const optionStyle = getComputedStyle(select.options[0]);
    const selectStyle = getComputedStyle(select);
    result.select = {
      background: selectStyle.backgroundColor,
      color: selectStyle.color,
      colorScheme: selectStyle.colorScheme,
      font: selectStyle.font,
    };
    result.option = { background: optionStyle.backgroundColor, color: optionStyle.color };
    select.remove();
    return result;
  })()`);
  const transparent = (c) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
  const fail = [];
  if (transparent(report.select.background)) fail.push('select background is still transparent — the popup will open white');
  if (transparent(report.option.background)) fail.push('option background is transparent — rows will not ink');
  if (report.option.color === report.select.background) fail.push('option colour equals its own background');
  console.log(JSON.stringify(report, null, 2));
  if (fail.length > 0) {
    for (const line of fail) console.error('FAIL', line);
    process.exitCode = 1;
  } else {
    console.log('ok — select and options carry an opaque, legible background');
  }
} finally {
  await browser.close();
}
