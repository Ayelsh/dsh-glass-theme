// tools/ws-live.mjs
//
// Opens the real GUI, walks to the workspace page and looks at it. The render
// suite (tools/ws-render.mjs) proves the React tree; this proves what the shell
// actually paints — the rail the page registers into, the project switcher, the
// in-page inspector the rows open, and the four panes behind their tabs.
//
//   node tools/ws-live.mjs --shot out/ws-light.png
//   node tools/ws-live.mjs --tab bugs --shot out/ws-bugs.png
//   node tools/ws-live.mjs --open-row 0 --shot out/ws-detail.png
//   node tools/ws-live.mjs --theme dark --vp 1440x1000 --shot out/ws-dark.png
//   node tools/ws-live.mjs --eval "document.querySelectorAll('.lgwsp-item-row').length"
//
// Options:
//   --url <url>        GUI url (default $LG_URL or the port the app prints)
//   --tab <id>         click a segmented tab first: overview|bugs|stories|docs|console
//   --open-row <n>     click row n's primary button (opens the in-page detail)
//   --refresh          click 刷新缺陷列表 and shoot mid-flight (skeleton state)
//   --theme dark|light set body[data-ds-dark-theme] before shooting
//   --vp WxH           viewport (default 1440x1000)
//   --settle <ms>      settle after load (default 9000)
//   --shot <path>      screenshot after the above
//   --eval <expr>      extra in-page expression, printed as JSON
//   --json             print the collected DOM facts instead of a summary line
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const one = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
}
const flag = (name) => argv.includes(name)

const url = one('--url', process.env.LG_URL ?? 'http://127.0.0.1:49363/')
const settle = Number(one('--settle', '9000'))
const vp = /^(\d+)x(\d+)$/.exec(one('--vp', '1440x1000')) ?? []
const width = Number(vp[1] ?? 1440)
const height = Number(vp[2] ?? 1000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', url], {
  encoding: 'utf8',
}).trim()
const equals = cookie.indexOf('=')
const name = cookie.slice(0, equals)
const value = cookie.slice(equals + 1)

const browser = await launch({ headless: true })
const page = await browser.newPage()
const out = { url, steps: [] }

try {
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false })
  /* The bundle is served with a rev query; a cached copy would hide a rebuild. */
  await page.send('Network.enable')
  await page.send('Network.setCacheDisabled', { cacheDisabled: true })
  await page.cookie({ name, value })
  await page.goto(url, { settleMs: settle })

  /* The rail entry is a real button; find it by the label the panel registers. */
  const opened = await page.evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button, [role="button"]')];
    const hit = buttons.find((el) => (el.textContent || '').trim().includes('工作空间'));
    if (hit === undefined) return false;
    hit.click();
    return true;
  })()`)
  out.steps.push({ op: 'open-panel', ok: opened })
  /* boot probes the CLIs, then load() fans out over TAPD + wecom; the panel
     paints placeholders until the last of those returns. Wait for real rows
     instead of guessing a duration. */
  const bootCap = Number(one('--boot', '60000'))
  const bootStart = Date.now()
  const until = async (expr, cap) => {
    const started = Date.now()
    while (Date.now() - started < cap) {
      if (await page.evaluate(expr)) return true
      await sleep(400)
    }
    return false
  }
  /* Three separate loads race here: CLI status, the project list (`workspace
     list` spawns the CLI, so it is the slowest) and the item fan-out. */
  const booted = {
    rail: await until(`document.querySelector('.lgwsp-space-option') !== null`, bootCap),
    /* The placeholders are `.lgwsp-empty-state` too, so the honest signal is
       a real row or a settled count (the focus numbers leave "—" only after
       load() resolves). */
    items: await until(
      `document.querySelector('.lgwsp-item-row') !== null || [...document.querySelectorAll('.lgwsp-focus-card-number')].every((el) => el.textContent.trim() !== '—')`,
      bootCap
    ),
  }
  booted.ms = Date.now() - bootStart
  out.booted = booted

  if (flag('--theme')) {
    const dark = one('--theme', 'light') === 'dark'
    await page.evaluate(`(() => {
      const body = document.body;
      body.setAttribute('data-ds-dark-theme', ${dark ? `'dark'` : `''`});
      if (${dark}) body.classList.add('dark'); else body.classList.remove('dark');
      return true;
    })()`)
    await sleep(400)
  }

  const tab = one('--tab', null)
  if (tab !== null) {
    out.steps.push({
      op: `tab:${tab}`,
      ok: await page.evaluate(`(() => {
        const hit = [...document.querySelectorAll('[data-tab-id="${tab}"]')][0];
        if (hit === undefined) return false;
        hit.click();
        return true;
      })()`),
    })
    await sleep(500)
  }

  if (flag('--refresh')) {
    out.steps.push({
      op: 'refresh',
      ok: await page.evaluate(`(() => {
        const hit = document.querySelector('[data-sync-bugs]');
        if (hit === undefined) return false;
        hit.click();
        return true;
      })()`),
    })
    await sleep(120)
  }

  const row = one('--open-row', null)
  if (row !== null) {
    out.steps.push({
      op: `open-row:${row}`,
      ok: await page.evaluate(`(() => {
        const rows = document.querySelectorAll('.lgwsp-item-primary');
        const hit = rows[${Number(row)}];
        if (hit === undefined) return false;
        hit.click();
        return true;
      })()`),
    })
    await sleep(700)
  }

  out.facts = await page.evaluate(`(() => {
    const q = (sel) => document.querySelector(sel);
    const qa = (sel) => document.querySelectorAll(sel);
    const text = (sel) => (q(sel)?.textContent ?? '').trim().slice(0, 80);
    return {
      shell: q('.lgwsp-workspace-shell') !== null,
      rail: q('.lgwsp-space-rail') !== null,
      railRows: qa('.lgwsp-space-option').length,
      projectLabel: text('.lgwsp-project-name'),
      focusCards: qa('.lgwsp-focus-card').length,
      segmented: qa('.lgwsp-segment').length,
      activeTab: q('.lgwsp-segment.lgwsp-is-active')?.textContent?.trim() ?? null,
      rows: qa('.lgwsp-item-row').length,
      skeletons: qa('.lgwsp-skeleton-row').length,
      inspector: q('.lgwsp-inspector') !== null,
      inspectorTitle: text('.lgwsp-detail-title'),
      frame: q('.lgwsp-embedded-frame') !== null,
      toast: text('.lgwsp-toast'),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      errors: 0,
    };
  })()`)

  const shot = one('--shot', null)
  if (shot !== null) {
    const target = resolve(shot)
    mkdirSync(dirname(target), { recursive: true })
    await page.screenshot(target, { width, height })
    out.shot = target
  }

  const expr = one('--eval', null)
  if (expr !== null) out.eval = await page.evaluate(expr)

  out.consoleErrors = page.errors.slice(0, 6)
} finally {
  await browser.close()
}

if (flag('--json')) console.log(JSON.stringify(out, null, 2))
else {
  const f = out.facts
  console.log(
    `shell:${f.shell} rail:${f.railRows} cards:${f.focusCards} tabs:${f.segmented} rows:${f.rows} ` +
      `skeleton:${f.skeletons} inspector:${f.inspector} overflowX:${f.overflowX}`
  )
  if (out.consoleErrors.length > 0) console.log('page errors:', out.consoleErrors.join(' | '))
  if (out.shot !== undefined) console.log('shot:', out.shot)
  if (out.eval !== undefined) console.log('eval:', JSON.stringify(out.eval))
}
