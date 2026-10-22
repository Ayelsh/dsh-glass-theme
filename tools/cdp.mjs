/**
 * Minimal Chrome DevTools Protocol client.
 *
 * Chrome's command line cannot set a cookie, and the GUI is cookie-gated, so
 * every real check of the skin has to go through CDP. Node ships a global
 * WebSocket, which is all the transport this needs.
 *
 *   const browser = await launch({ headless: true })
 *   const page = await browser.newPage()
 *   await page.cookie({ name, value })
 *   await page.goto(url)
 *   await page.evaluate('document.title')
 *   await page.screenshot('out.png')
 *   await browser.close()
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]

export const chromePath = () => {
  const found = CANDIDATES.find((p) => existsSync(p))
  if (found === undefined) throw new Error('no Chrome or Edge installation found')
  return found
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class Session {
  #ws
  #next = 1
  #pending = new Map()
  #listeners = new Map()

  constructor(ws) {
    this.#ws = ws
    ws.addEventListener('message', (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      if (msg.id !== undefined) {
        const waiter = this.#pending.get(msg.id)
        if (waiter === undefined) return
        this.#pending.delete(msg.id)
        if (msg.error !== undefined) waiter.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)))
        else waiter.resolve(msg.result)
        return
      }
      const handlers = this.#listeners.get(msg.method)
      if (handlers === undefined) return
      for (const handler of handlers) handler(msg.params ?? {})
    })
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.#next++
    const payload = { id, method, params }
    if (sessionId !== undefined) payload.sessionId = sessionId
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
      this.#ws.send(JSON.stringify(payload))
      setTimeout(() => {
        if (!this.#pending.has(id)) return
        this.#pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, 60000)
    })
  }

  on(method, handler) {
    const handlers = this.#listeners.get(method) ?? []
    handlers.push(handler)
    this.#listeners.set(method, handlers)
  }

  once(method) {
    return new Promise((resolve) => {
      const handler = (params) => {
        const handlers = this.#listeners.get(method) ?? []
        this.#listeners.set(method, handlers.filter((h) => h !== handler))
        resolve(params)
      }
      this.on(method, handler)
    })
  }
}

class Page {
  constructor(browser, sessionId, targetId) {
    this.browser = browser
    this.sessionId = sessionId
    this.targetId = targetId
    this.console = []
    this.errors = []
    const s = browser.session
    s.on('Runtime.consoleAPICalled', (p) => {
      if (p.sessionId !== undefined && p.sessionId !== this.sessionId) return
      this.console.push({
        type: p.type,
        text: (p.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(' '),
      })
    })
    s.on('Runtime.exceptionThrown', (p) => {
      this.errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? 'unknown')
    })
    s.on('Log.entryAdded', (p) => {
      if (p.entry?.level === 'error') this.errors.push(p.entry.text)
    })
  }

  send(method, params) {
    return this.browser.session.send(method, params, this.sessionId)
  }

  async cookie({ name, value, domain = '127.0.0.1', path = '/' }) {
    const result = await this.send('Network.setCookie', { name, value, domain, path })
    if (result?.success === false) throw new Error('Network.setCookie was rejected')
    return result
  }

  /**
   * Runs `source` in every document before any page script, which is the only
   * way to reproduce a shell attribute the browser build never sets (the
   * desktop window's `data-windows-titlebar`). Registered per target, so it
   * must be called before goto.
   */
  async addInitScript(source) {
    return this.send('Page.addScriptToEvaluateOnNewDocument', { source })
  }

  async goto(url, { settleMs = 4000, timeoutMs = 30000 } = {}) {
    const loaded = this.send('Page.navigate', { url })
    await Promise.race([loaded, sleep(timeoutMs)])
    await sleep(settleMs)
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    })
    if (result.exceptionDetails !== undefined) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    }
    return result.result?.value
  }

  async screenshot(file, { width = 1440, height = 960, fullPage = false, clip = null } = {}) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: false,
    })
    await sleep(400)
    // A clip turns the capture into a magnifier: `scale` multiplies the CSS
    // pixels of the region, so a 0.5px hairline becomes readable.
    const shot = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: fullPage,
      ...(clip === null ? {} : { clip: { ...clip, scale: clip.scale ?? 3 } }),
    })
    writeFileSync(file, Buffer.from(shot.data, 'base64'))
    return file
  }
}

export async function launch({ headless = true, width = 1440, height = 960 } = {}) {
  const dir = mkdtempSync(resolve(tmpdir(), 'lg-cdp-'))
  const args = [
    headless ? '--headless=new' : '--start-maximized',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-features=Translate,MediaRouter',
    '--hide-scrollbars',
    '--remote-debugging-port=0',
    `--user-data-dir=${resolve(dir, 'ud')}`,
    `--window-size=${width},${height}`,
    'about:blank',
  ]
  const child = spawn(chromePath(), args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (d) => {
    stderr += d.toString()
  })

  const portFile = resolve(dir, 'ud', 'DevToolsActivePort')
  let port
  for (let i = 0; i < 100; i++) {
    if (existsSync(portFile)) {
      const first = readFileSync(portFile, 'utf8').split('\n')[0]
      if (/^\d+$/.test(first.trim())) {
        port = Number(first.trim())
        break
      }
    }
    if (child.exitCode !== null) break
    await sleep(100)
  }
  if (port === undefined) {
    child.kill()
    throw new Error('Chrome did not expose a debugging port\n' + stderr.slice(-2000))
  }

  let wsUrl
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      wsUrl = (await res.json()).webSocketDebuggerUrl
      if (wsUrl !== undefined) break
    } catch {
      /* not up yet */
    }
    await sleep(100)
  }
  if (wsUrl === undefined) {
    child.kill()
    throw new Error('Chrome DevTools endpoint never answered')
  }

  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('devtools websocket failed')), { once: true })
  })
  const session = new Session(ws)

  const browser = {
    session,
    port,
    dir,
    async newPage() {
      const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' })
      const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true })
      const page = new Page(browser, sessionId, targetId)
      for (const domain of ['Page', 'Runtime', 'Network', 'Log', 'DOM']) {
        await session.send(`${domain}.enable`, {}, sessionId).catch(() => {})
      }
      return page
    },
    async close() {
      try {
        ws.close()
      } catch {
        /* already gone */
      }
      child.kill()
      await sleep(300)
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* chrome may still hold a file */
      }
    },
  }
  return browser
}
