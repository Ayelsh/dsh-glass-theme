#!/usr/bin/env node
/**
 * jobs-fixture.mjs — render the background-jobs popover against the LIVE skin.
 *
 * The real popover only exists while a background job runs, which makes it
 * impossible to iterate on. This tool loads the live GUI (so every token and
 * sheet of the skin is mounted), then injects the popover's EXACT markup —
 * copied from dsh-client-ui-jobs JobListAction — as a fixed-position element.
 * Computed styles are therefore the skin's real computed styles.
 *
 * Options:
 *   --theme dark|light   (informational; the app stores its own preference)
 *   --url <url>          default http://127.0.0.1:57736/
 *   --vp WxH             default 1190x900
 *   --shot <file>        screenshot of the fixture box
 *   --scale <n>          screenshot scale, default 2
 *   --measure            print computed styles of the key parts
 *   --settle <ms>        default 8000
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf('--' + name)
  return i < 0 ? fallback : argv[i + 1]
}
const flag = (name) => argv.includes('--' + name)
const repeat = (name) => {
  const out = []
  argv.forEach((a, i) => { if (a === '--' + name) out.push(argv[i + 1]) })
  return out
}

const URL_BASE = arg('url', 'http://127.0.0.1:57736/')
const [VP_W, VP_H] = arg('vp', '1190x900').split('x').map(Number)
const SETTLE = Number(arg('settle', '8000'))
const SHOT = arg('shot', null)
const SCALE = Number(arg('scale', '2'))
const THEME = arg('theme', null)

/* ---------------------------------------------------------------- fixture --
 * Markup mirrors JobListAction's render tree one-for-one:
 *   button.trigger > StateDot + span.count + svg
 *   div.menu(MenuSurface) > ul.menuBody > li.sectionHeader + li.item* ...
 * Live row:  rowLine > row(button) [rowDot, main[primary[label], secondary[kind,status,duration]], chevronBox[svg]] + stop
 * Settled row: rowLine > row(button) [rowDot, kind, label, status, duration, chevronBox[svg]]
 * The popover is fixed so it composites over the real page like the portal does.
 */
const FIXTURE = String.raw`
(() => {
  document.querySelectorAll('[data-lg-fixture]').forEach((n) => n.remove())

  const CH = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'

  /* StateDot (ui-primitives renderer) renders TWO different things and always
     sets its size INLINE:
       state === 'ongoing' -> <svg class="_spinner_1i3xo_37" width=14 height=14>
       anything else       -> <span class="_dot_1i3xo_2" data-state=X>
     Inline width/height beat any stylesheet rule, so a fixture that emits a
     bare <span class="foD-wG_rowDot"> measures the fixture, not the app. */
  const DOT = (state) => state === 'ongoing'
    ? '<svg class="_spinner_1i3xo_37 foD-wG_rowDot" data-state="ongoing" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style="width:14px;height:14px">' +
      '<g class="_spinnerMotion_1i3xo_42"><circle class="_spinnerTrack_1i3xo_47" cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<circle class="_spinnerArc_1i3xo_48" cx="12" cy="12" r="9.5"/></g></svg>'
    : '<span class="_dot_1i3xo_2 foD-wG_rowDot" data-state="' + state + '" style="width:10px;height:10px"></span>'

  const settled = [
    ['bash', 'cd /g/dsh-build/plugin/dsh-glass-theme && time...', 'exit code: 0', '2分4秒', 'done'],
    ['bash', 'cd /g/dsh-build/plugin/dsh-glass-theme &&...', 'exit code: 0', '2分15秒', 'done'],
    ['bash', 'cd /g/dsh-build/plugin/dsh-glass-theme && ...', 'exit code: 0', '2分5秒', 'done'],
    ['pwsh', 'cd G:\\dsh-build...', 'killed before exit; screenshot written; browser close hangs', '1分45秒', 'warning'],
    ['pwsh', 'cd G:\\dsh-...', 'killed before exit; screenshot already written; browser hung on ...', '4分17秒', 'warning'],
    ['pwsh', 'cd G:\\dsh-build\\plugin\\dsh-glass-theme; n...', 'exit code: 0', '2分20秒', 'done'],
    ['pwsh', 'cd G:\\dsh-build\\plugin\\dsh-glass-theme; n...', 'exit code: 0', '2分27秒', 'done'],
    ['pwsh', 'cd G:\\dsh-build\\plugin\\dsh-liquid-g...', 'killed before exit; hung; retry', '3分10秒', 'warning'],
    ['pwsh', 'cd G:\\dsh-build\\plugin\\dsh-glass-theme; n...', 'exit code: 0', '2分23秒', 'done'],
    ['pwsh', 'cd G:\\dsh-b...', 'killed before exit; hung; will retry without the settings click chain', '6分53秒', 'warning'],
  ]

  const settledRows = settled.map(([kind, label, status, duration, dot]) => (
    '<li class="foD-wG_item"><div class="foD-wG_rowLine">' +
      '<button type="button" class="foD-wG_row">' +
        DOT(dot) +
        '<span class="foD-wG_kind">' + kind + '</span>' +
        '<span class="foD-wG_label">' + label.replace(/</g, '&lt;') + '</span>' +
        '<span class="foD-wG_status">' + status.replace(/</g, '&lt;') + '</span>' +
        '<span class="foD-wG_duration">' + duration + '</span>' +
        '<span class="foD-wG_chevronBox"><span class="foD-wG_chevron">' + CH + '</span></span>' +
      '</button>' +
    '</div></li>'
  )).join('')

  const liveRow =
    '<li class="foD-wG_item"><div class="foD-wG_rowLine foD-wG_rowLineLive">' +
      '<button type="button" class="foD-wG_row">' +
        DOT('ongoing') +
        '<span class="foD-wG_main">' +
          '<span class="foD-wG_primary"><span class="foD-wG_label">cd /g/dsh-build/plugin/dsh-glass-theme &amp;&amp; timeout 150 nod...</span></span>' +
          '<span class="foD-wG_secondary"><span class="foD-wG_kind">bash</span><span class="foD-wG_duration">43秒</span></span>' +
        '</span>' +
        '<span class="foD-wG_chevronBox"><span class="foD-wG_chevron">' + CH + '</span></span>' +
      '</button>' +
      '<button type="button" class="foD-wG_stop" aria-label="停止任务"></button>' +
    '</div></li>'

  const host = document.createElement('div')
  host.setAttribute('data-lg-fixture', 'jobs')
  host.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2000;pointer-events:none'
  host.innerHTML =
    '<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)">' +
      '<div class="foD-wG_menu" role="presentation" style="position:relative;left:auto;top:auto">' +
        '<ul class="foD-wG_menuBody" aria-label="后台任务">' +
          '<li class="foD-wG_sectionHeader" aria-hidden="true">进行中</li>' +
          liveRow +
          '<li class="foD-wG_sectionHeader">' +
            '<button type="button" class="foD-wG_sectionToggle" aria-expanded="true">' +
              '<span class="foD-wG_sectionChevron foD-wG_sectionChevronOpen">' + CH + '</span>已结束 10' +
            '</button>' +
            '<button type="button" class="foD-wG_sectionClear">清空</button>' +
          '</li>' +
          settledRows +
        '</ul>' +
      '</div>' +
    '</div>'
  document.body.appendChild(host)
  return 'ok'
})()
`

const MEASURE = String.raw`
(() => {
  const q = (s) => document.querySelector('[data-lg-fixture] ' + s)
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  const st = (el, props) => { if (!el) return null; const s = getComputedStyle(el); const o = {}; for (const p of props) o[p] = s[p]; return o }
  const TEXT = ['fontSize', 'lineHeight', 'color', 'fontFamily', 'fontVariantNumeric']
  const SKIN = ['backgroundColor', 'backgroundImage', 'borderRadius', 'padding', 'margin', 'boxShadow', 'backdropFilter']
  return {
    menu: { box: box(q('.foD-wG_menu')), style: st(q('.foD-wG_menu'), SKIN) },
    body: { box: box(q('.foD-wG_menuBody')), style: st(q('.foD-wG_menuBody'), ['gap', 'padding']) },
    sectionHeader: { box: box(q('.foD-wG_sectionHeader')), style: st(q('.foD-wG_sectionHeader'), SKIN.concat(['borderTopColor', 'borderTopWidth'])) },
    liveLine: { box: box(q('.foD-wG_rowLineLive')), style: st(q('.foD-wG_rowLineLive'), SKIN) },
    liveRow: { box: box(q('.foD-wG_rowLineLive .foD-wG_row')), style: st(q('.foD-wG_rowLineLive .foD-wG_row'), SKIN.concat(['minHeight'])) },
    settledLine: { box: box(q('.foD-wG_item:nth-of-type(4) .foD-wG_rowLine')), style: st(q('.foD-wG_item:nth-of-type(4) .foD-wG_rowLine'), SKIN) },
    settledRow: { box: box(q('.foD-wG_item:nth-of-type(4) .foD-wG_row')), style: st(q('.foD-wG_item:nth-of-type(4) .foD-wG_row'), SKIN.concat(['minHeight'])) },
    kind: { box: box(q('.foD-wG_kind')), style: st(q('.foD-wG_kind'), SKIN.concat(TEXT)) },
    label: { style: st(q('.foD-wG_label'), TEXT) },
    status: { style: st(q('.foD-wG_status'), TEXT) },
    duration: { style: st(q('.foD-wG_duration'), TEXT) },
    chevronBox: { box: box(q('.foD-wG_chevronBox')), style: st(q('.foD-wG_chevronBox'), SKIN) },
    stop: { box: box(q('.foD-wG_stop')), style: st(q('.foD-wG_stop'), SKIN) },
    rowDot: { box: box(q('.foD-wG_rowDot')), style: st(q('.foD-wG_rowDot'), SKIN.concat(['width', 'height'])) },
    dark: document.body.hasAttribute('data-ds-dark-theme'),
  }
})()
`

const main = async () => {
  const browser = await launch({ headless: true, width: VP_W, height: VP_H })
  const page = await browser.newPage()

  try {
    const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE], { encoding: 'utf8' }).trim()
    const eq = cookie.indexOf('=')
    const name = cookie.slice(0, eq)
    const value = cookie.slice(eq + 1)
    if (name && value) await page.cookie({ name, value, domain: '127.0.0.1', path: '/' })

    await page.addInitScript(`
      try {
        document.documentElement.setAttribute('data-platform', 'win32')
        document.documentElement.setAttribute('data-windows-titlebar', '')
      } catch (e) {}
    `)
    await page.goto(URL_BASE, { settleMs: SETTLE })
    await page.evaluate(`document.documentElement.setAttribute('data-platform','win32'); document.documentElement.setAttribute('data-windows-titlebar',''); 'ok'`)
    await new Promise((r) => setTimeout(r, 400))

    /* The app keys its palette on `body[data-ds-dark-theme]`, NOT on
       `prefers-color-scheme`, so emulation alone cannot produce a light run
       when the stored preference is dark. Setting the attribute directly is
       the only reliable way to exercise the other half of the token sheet. */
    if (THEME !== null) {
      await page.evaluate(
        `(() => { const b = document.body; if (${THEME === 'dark'} !== b.hasAttribute('data-ds-dark-theme')) { ${THEME === 'dark'} ? b.setAttribute('data-ds-dark-theme','') : b.removeAttribute('data-ds-dark-theme'); } return 'ok' })()`,
      )
      await new Promise((r) => setTimeout(r, 300))
    }

    const injected = await page.evaluate(FIXTURE)
    if (injected !== 'ok') throw new Error('fixture injection failed: ' + injected)
    await new Promise((r) => setTimeout(r, 600))

    if (flag('measure') || !SHOT) {
      const out = await page.evaluate(MEASURE)
      console.log(JSON.stringify(out, null, 2))
    }

    if (SHOT) {
      const rect = await page.evaluate(`(() => { const m = document.querySelector('[data-lg-fixture] .foD-wG_menu'); const r = m.getBoundingClientRect(); return JSON.stringify({x:r.x-14,y:r.y-14,w:r.width+28,h:r.height+28}) })()`)
      const { x, y, w, h } = JSON.parse(rect)
      await page.screenshot(SHOT, { clip: { x, y, width: w, height: h, scale: SCALE } })
      console.log('shot: ' + SHOT)
    }
  } finally {
    await browser.close().catch(() => {})
  }
}

main().catch((e) => {
  console.error('FAILED: ' + (e && e.message ? e.message : e))
  process.exit(1)
})
