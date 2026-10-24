import { launch } from './cdp.mjs'

const args = process.argv.slice(2)
const urlArgIndex = args.indexOf('--url')
const url = urlArgIndex >= 0 ? args[urlArgIndex + 1] : 'http://127.0.0.1:4173/workspace-prototype.html'
if (!url || url.startsWith('--')) throw new Error('Usage: node tools/workspace-prototype-check.mjs --url <url>')

const assert = (condition, message) => {
  if (!condition) throw new Error(`workspace prototype check failed: ${message}`)
}
const wait = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms))

const browser = await launch({ headless: true, width: 1440, height: 960 })
try {
  const page = await browser.newPage()
  await page.addInitScript(`
    window.__opened = [];
    window.open = (...args) => { window.__opened.push(args); return null; };
  `)
  await page.goto(url, { settleMs: 500 })

  const initial = await page.evaluate(`(() => {
    const root = document.querySelector('#workspacePage');
    const active = document.querySelector('.space-option[aria-current="page"]');
    const inspector = document.querySelector('.inspector');
    return {
      root: Boolean(root),
      project: active?.dataset.projectId ?? null,
      href: location.href,
      rows: document.querySelectorAll('[data-row-id]').length,
      detailOpen: inspector?.getAttribute('aria-hidden') === 'false',
      activeName: active?.querySelector('.space-option-name')?.textContent?.trim() ?? '',
    };
  })()`)
  assert(initial.root, 'workspace root is present')
  assert(initial.project === '45368483', `default project should be 45368483, got ${initial.project}`)
  assert(initial.activeName.includes('广州_安利中国_领导人目标管理'), `default project name should be live TAPD project, got ${initial.activeName}`)
  assert(initial.rows >= 4, `expected live work rows, got ${initial.rows}`)
  assert(initial.detailOpen === false, 'detail starts closed')
  const initialHref = initial.href

  await page.evaluate(`document.querySelector('#projectTrigger').click()`)
  await wait()
  const menuVisible = await page.evaluate(`Boolean(document.querySelector('.project-menu'))`)
  assert(menuVisible, 'project menu opens from the switcher')

  await page.evaluate(`document.querySelector('[data-menu-project-id="44035651"]').click()`)
  await wait(160)
  const switched = await page.evaluate(`(() => {
    const active = document.querySelector('.space-option[aria-current="page"]');
    return {
      project: active?.dataset.projectId ?? null,
      activeName: active?.querySelector('.space-option-name')?.textContent?.trim() ?? '',
      rows: document.querySelectorAll('[data-row-id]').length,
      detailOpen: document.querySelector('.inspector')?.getAttribute('aria-hidden') === 'false',
    };
  })()`)
  assert(switched.project === '44035651', `project state should be 44035651, got ${switched.project}`)
  assert(switched.activeName.includes('内部_近期工作安排'), `active project should be live option, got ${switched.activeName}`)
  assert(switched.rows >= 1, `switched project should have rows, got ${switched.rows}`)
  assert(switched.detailOpen === false, 'switching project closes the inspector')

  const targetRow = await page.evaluate(`document.querySelector('[data-row-id][data-open-id]')?.dataset.rowId ?? document.querySelector('[data-row-id]')?.dataset.rowId ?? null`)
  assert(targetRow, 'a work-item row exists in the switched project')
  const hrefBeforeOpen = await page.evaluate('location.href')
  await page.evaluate(`document.querySelector('[data-open-id="${targetRow}"]').click()`)
  await wait(100)
  const opened = await page.evaluate(`(() => {
    const detail = document.querySelector('.inspector');
    return {
      open: detail?.getAttribute('aria-hidden') === 'false',
      hidden: detail?.getAttribute('aria-hidden') ?? null,
      id: detail?.querySelector('.detail-id')?.textContent?.split('·')[0]?.trim() ?? null,
      title: detail?.querySelector('.detail-title')?.textContent?.trim() ?? '',
      href: location.href,
      opened: window.__opened.length,
    };
  })()`)
  assert(opened.open, 'detail opens in page')
  assert(opened.hidden === 'false', `detail aria-hidden false, got ${opened.hidden}`)
  assert(opened.id === targetRow, `detail item id should be ${targetRow}, got ${opened.id}`)
  assert(opened.title.length > 0, 'detail title is rendered')
  assert(opened.href === hrefBeforeOpen, 'opening a row does not navigate')
  assert(opened.opened === 0, `opening a row does not call window.open, got ${opened.opened}`)

  await page.evaluate(`document.querySelector('#inspectorClose').click()`)
  await wait()
  const closed = await page.evaluate(`document.querySelector('.inspector')?.getAttribute('aria-hidden') !== 'false'`)
  assert(closed, 'detail closes in page')

  /* ---- 刷新缺陷列表 ---- */
  await page.evaluate(`document.querySelector('[data-tab-id="bugs"]').click()`)
  await wait(120)
  const beforeRefresh = await page.evaluate(`(() => ({
    rows: document.querySelectorAll('[data-row-id]').length,
    stamp: document.querySelector('[data-sync-stamp]')?.textContent?.trim() ?? '',
    firstStatus: document.querySelector('[data-row-id] .item-chip')?.textContent?.trim() ?? '',
  }))()`)
  assert(beforeRefresh.rows >= 1, `bugs tab lists rows, got ${beforeRefresh.rows}`)

  await page.evaluate(`(() => { const b = document.querySelector('#refreshBugs'); b.focus(); b.click(); })()`)
  await wait(90)
  const inflight = await page.evaluate(`(() => ({
    busy: document.querySelector('.list-body')?.getAttribute('aria-busy') ?? null,
    skeleton: document.querySelectorAll('.skeleton-row').length,
    disabled: document.querySelector('#refreshBugs')?.disabled ?? null,
    label: document.querySelector('#refreshBugs')?.textContent?.trim() ?? '',
  }))()`)
  assert(inflight.busy === 'true', `list is busy while refreshing, got ${inflight.busy}`)
  assert(inflight.skeleton > 0, `skeleton placeholder shown while refreshing, got ${inflight.skeleton}`)
  assert(inflight.disabled === true, 'refresh button is disabled while a refresh is in flight')
  assert(inflight.label.includes('同步中'), `inflight label reads 同步中, got ${inflight.label}`)

  await wait(700)
  const afterRefresh = await page.evaluate(`(() => ({
    busy: document.querySelector('.list-body')?.getAttribute('aria-busy') ?? null,
    rows: document.querySelectorAll('[data-row-id]').length,
    skeleton: document.querySelectorAll('.skeleton-row').length,
    stamp: document.querySelector('[data-sync-stamp]')?.textContent?.trim() ?? '',
    firstStatus: document.querySelector('[data-row-id] .item-chip')?.textContent?.trim() ?? '',
    toast: document.querySelector('.toast')?.textContent?.trim() ?? '',
    focus: document.activeElement?.id ?? null,
    announcer: document.getElementById('syncAnnouncer')?.textContent?.trim() ?? '',
  }))()`)
  assert(afterRefresh.busy === 'false', `list stops being busy, got ${afterRefresh.busy}`)
  assert(afterRefresh.skeleton === 0, 'skeleton is replaced by real rows')
  assert(afterRefresh.rows === beforeRefresh.rows, `row count stable across refresh, ${beforeRefresh.rows} -> ${afterRefresh.rows}`)
  assert(afterRefresh.stamp !== beforeRefresh.stamp, `sync timestamp advances, ${beforeRefresh.stamp} -> ${afterRefresh.stamp}`)
  assert(afterRefresh.firstStatus !== beforeRefresh.firstStatus, `refreshed data is re-rendered, ${beforeRefresh.firstStatus} -> ${afterRefresh.firstStatus}`)
  assert(afterRefresh.toast.includes('已同步') || afterRefresh.toast.includes('已刷新'), `toast reports the refresh, got ${afterRefresh.toast}`)
  assert(afterRefresh.focus === 'refreshBugs', `focus returns to the refresh control, got ${afterRefresh.focus}`)
  assert(afterRefresh.announcer.includes('缺陷列表已刷新'), `live region announces the refresh, got ${afterRefresh.announcer}`)

  /* 刷新进行中切换项目：旧项目的响应必须被丢弃，不能落到新项目列表上。 */
  await page.evaluate(`document.querySelector('#refreshBugs').click()`)
  await wait(60)
  await page.evaluate(`document.querySelector('[data-project-id="45368483"]').click()`)
  await wait(750)
  const afterRace = await page.evaluate(`(() => ({
    project: document.querySelector('.space-option[aria-current="page"]')?.dataset.projectId ?? null,
    ids: Array.from(document.querySelectorAll('[data-row-id]')).map((row) => row.dataset.rowId),
    skeleton: document.querySelectorAll('.skeleton-row').length,
    stamp: document.querySelector('[data-sync-stamp]')?.textContent?.trim() ?? '',
    toast: document.querySelector('.toast')?.textContent?.trim() ?? '',
  }))()`)
  assert(afterRace.project === '45368483', `switched to 45368483, got ${afterRace.project}`)
  assert(afterRace.skeleton === 0, 'no skeleton left over from the abandoned refresh')
  assert(afterRace.stamp.includes('尚未同步'), `sync stamp resets for the new project, got ${afterRace.stamp}`)
  assert(!afterRace.ids.some((id) => id.startsWith('B44035651')), `stale rows from the old project never appear, got ${afterRace.ids.join(',')}`)


  /* 顶栏那枚 ↻ 是同一个动作的第二个入口，行为必须一致。 */
  await page.evaluate(`document.querySelector('[data-tab-id="bugs"]').click()`)
  await wait(120)
  await page.evaluate(`document.querySelector('#refreshButton').click()`)
  await wait(90)
  const topRefresh = await page.evaluate(`(() => ({
    busy: document.querySelector('.list-body')?.getAttribute('aria-busy') ?? null,
    skeleton: document.querySelectorAll('.skeleton-row').length,
  }))()`)
  assert(topRefresh.busy === 'true' && topRefresh.skeleton > 0, 'top-bar refresh triggers the same list sync')
  await wait(650)

  const summary = await page.evaluate(`(() => ({
    project: document.querySelector('.space-option[aria-current="page"]')?.dataset.projectId,
    rows: document.querySelectorAll('[data-row-id]').length,
    url: location.href,
  }))()`)
  console.log(JSON.stringify({ ok: true, ...summary }))
} finally {
  await browser.close()
}
