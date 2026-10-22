import { launch } from './cdp.mjs'
import { execFileSync } from 'node:child_process'
const url = 'http://127.0.0.1:57736/'
const c = execFileSync(process.execPath, ['tools/auth-cookie.mjs', '--url', url], { encoding: 'utf8' }).trim()
const eq = c.indexOf('=')
const b = await launch({ headless: true })
const p = await b.newPage()
await p.send('Emulation.setDeviceMetricsOverride', { width: 1190, height: 900, deviceScaleFactor: 1, mobile: false })
await p.cookie({ name: c.slice(0, eq), value: c.slice(eq + 1) })
await p.addInitScript('document.documentElement.setAttribute("data-platform","win32");document.documentElement.setAttribute("data-windows-titlebar","");')
await p.goto(url, { settleMs: 9000 })
await p.evaluate('(() => { const r = [...document.querySelectorAll("[class*=hIlkoa_sessionRow]")]; if (r[2]) r[2].click(); return 1 })()')
await new Promise((r) => setTimeout(r, 6000))
await p.evaluate('(() => { const t = document.querySelector("[class*=codexModelSelectTrigger]"); if (t) t.click(); return 1 })()')
await new Promise((r) => setTimeout(r, 1200))
await p.evaluate('(() => { const cs = [...document.querySelectorAll("[class*=codexModelSelectCell]")]; const m = cs.find((x) => /模型/.test(x.textContent || "")); if (m) m.click(); return 1 })()')
await new Promise((r) => setTimeout(r, 1500))
console.log(
  await p.evaluate(`(() => {
    const s = document.querySelector('[data-lg-state]')
    const pr = document.querySelector('[data-lg-price]')
    return JSON.stringify({
      state: s && s.textContent,
      reason: s && s.getAttribute('data-lg-reason'),
      tone: s && s.getAttribute('data-lg-tone'),
      price: pr && pr.textContent,
      title: pr && pr.title,
    })
  })()`)
)
const r = await p.evaluate(`(() => { const b = document.querySelector('[data-lg-price]').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } })()`)
await p.screenshot('G:/dsh-build/research/chip-dark.png', {
  width: 1190, height: 900,
  clip: { x: r.x - 10, y: r.y - 10, width: r.w + 20, height: r.h + 20, scale: 3 },
})
console.log('wrote chip-dark.png')
await b.close()
