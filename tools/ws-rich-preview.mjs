// tools/ws-rich-preview.mjs
//
// Static visual check for the detail panel's rich description: pulls the real
// tokens.css + workspace.css out of the built bundle, drops them into a plain
// page with the inspector's DOM, and screenshots it.
//
//   node tools/ws-rich-preview.mjs [--out out/ws-rich-preview.png]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback
}
const out = resolve(argOf('--out', resolve(root, 'out/ws-rich-preview.png')))

const bundle = readFileSync(resolve(root, 'lib/client.js'), 'utf8')
const sheet = (id) => {
  const marker = `dsh-glass-theme/${id}`
  const at = bundle.indexOf(marker)
  if (at === -1) throw new Error(`${id} not in bundle`)
  const start = bundle.indexOf('css:', at) + 4
  // the sheet is a template literal in the bundle; find its closing backtick
  let end = start + 1
  while (bundle[end] !== '`' || bundle[end - 1] === '\\') end += 1
  return bundle.slice(start + 1, end).replace(/\\`/g, '`').replace(/\\\$/g, '$').replace(/\\\\/g, '\\')
}
const tokens = sheet('tokens.css')
const workspace = sheet('workspace.css')

const markdownSample = [
  '# 复现步骤',
  '',
  '打开「多城市群 AM」页面，点击 **成长研讨会** 后观察右侧列表：',
  '',
  '- 预估达成 数据 与列表不一致',
  '- 部分卡片 `达成率` 显示为 0',
  '',
  '> 疑似是筛选器没有带上本月须达 q 的口径，见截图。',
  '',
  '![现场截图](https://www.tapd.cn/tapd_app_data/display_image/11536848380012673.png)',
  '',
  '| 字段 | 列表值 | 详情值 |',
  '| --- | --- | --- |',
  '| 预估达成 | 82% | 0% |',
  '| 截止 | 10月25日 | 未设置 |',
  '',
  '详细口径见 [统计说明](https://www.tapd.cn/tapd_fe/45368483/docs)。',
].join('\n')

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${tokens}</style><style>${workspace}</style>
<style>body { margin: 0; padding: 28px; background: #0b0e16; } .wrap { width: 430px; }</style></head>
<body><div class="wrap"><div class="lgwsp-embedded-frame" role="document">
<div class="lgwsp-frame-toolbar"><span class="lgwsp-frame-dots"><i class="lgwsp-frame-dot"></i><i class="lgwsp-frame-dot"></i><i class="lgwsp-frame-dot"></i></span><span class="lgwsp-frame-address">tapd://workspace/45368483/bug/1145368483001012673</span><span>↗</span></div>
<div class="lgwsp-frame-content">
<div class="lgwsp-detail-type" style="--item-color:#c0392b"><span class="lgwsp-detail-type-mark" style="--item-bg:rgba(192,57,43,.12)">BUG</span>缺陷</div>
<h2 class="lgwsp-detail-title">【领导人列表】多城市群 AM（CNVTABCITYS），成长研讨会的 预估达成 数据 与 列表不一致</h2>
<div class="lgwsp-detail-id">1145368483001012673 · 广州_安利中国-领导人目标管理</div>
<div class="lgwsp-detail-chips"><span class="lgwsp-detail-chip lgwsp-is-accent" style="--item-color:#c0392b;--item-bg:rgba(192,57,43,.12)">待开发</span><span class="lgwsp-detail-chip">优先级 · 严重</span><span class="lgwsp-detail-chip">刘运辉2</span></div>
<div class="lgwsp-detail-divider"></div>
<h3 class="lgwsp-detail-label">描述</h3>
<div class="lgwsp-detail-rich">
<h3>复现步骤</h3>
<p>打开「多城市群 AM」页面，点击 <strong>成长研讨会</strong> 后观察右侧列表：</p>
<ul><li>预估达成 数据 与列表不一致</li><li>部分卡片 <code>达成率</code> 显示为 0</li></ul>
<blockquote>疑似是筛选器没有带上本月须达 q 的口径，见截图。</blockquote>
<img src="https://www.tapd.cn/tapd_app_data/display_image/11536848380012673.png" alt="现场截图" loading="lazy">
<table><thead><tr><th>字段</th><th>列表值</th><th>详情值</th></tr></thead><tbody><tr><td>预估达成</td><td>82%</td><td>0%</td></tr><tr><td>截止</td><td>10月25日</td><td>未设置</td></tr></tbody></table>
<p>详细口径见 <a href="https://www.tapd.cn/tapd_fe/45368483/docs" target="_blank" rel="noreferrer noopener">统计说明</a>。</p>
</div>
<div class="lgwsp-detail-divider"></div>
<h3 class="lgwsp-detail-label">最近动态</h3>
<div class="lgwsp-activity"><div class="lgwsp-activity-row"><span class="lgwsp-activity-dot"></span><span>创建于 10月23日 16:08</span></div><div class="lgwsp-activity-row"><span class="lgwsp-activity-dot"></span><span>最近更新 10月23日 17:37</span></div></div>
</div></div></div>
<script>window.__MD__ = ${JSON.stringify(markdownSample)};</script>
</body></html>`

mkdirSync(dirname(out), { recursive: true })
const file = resolve(dirname(out), 'ws-rich-preview.html')
writeFileSync(file, html)

const browser = await launch({ headless: true, width: 520, height: 1060 })
try {
  const page = await browser.newPage()
  await page.goto('file:///' + file.replace(/\\/g, '/'), { settleMs: 900 })
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  await page.screenshot(out, { fullPage: true })
  console.log(`shot: ${out}`)
} finally {
  await browser.close()
}
