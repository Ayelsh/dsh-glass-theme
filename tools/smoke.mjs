/**
 * Smoke-test the built bundle without a browser.
 *
 * The bundle only needs `window.__ModuleLoader__.load`, so a stub loader plus a
 * stub DOM is enough to prove: the wrapper registers the right package id, the
 * factory runs, apply() mounts every sheet exactly once, the tags carry the
 * ownership attributes the loader's removeOwnedStyles() keys on, and the
 * disposer removes them.
 *
 *   node tools/smoke.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const source = readFileSync(resolve(root, 'lib/client.js'), 'utf8')

/** Minimal DOM good enough for the skin runtime. */
const makeDom = () => {
  const children = []
  /** Real DOM keeps `dataset` and the attribute map in sync; so must the stub. */
  const makeEl = (tag) => {
    const attrs = new Map()
    const el = {
      tagName: tag.toUpperCase(),
      textContent: '',
      isConnected: false,
      _children: children,
      getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
      hasAttribute: (n) => attrs.has(n),
      setAttribute: (n, v) => attrs.set(n, String(v)),
      removeAttribute: (n) => attrs.delete(n),
      remove() {
        this.isConnected = false
        const at = children.indexOf(this)
        if (at >= 0) children.splice(at, 1)
      },
    }
    const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    el.dataset = new Proxy(
      {},
      {
        get: (_, key) => attrs.get(`data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`),
        set: (_, key, value) => {
          attrs.set(`data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, String(value))
          return true
        },
        deleteProperty: (_, key) => {
          attrs.delete(`data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`)
          return true
        },
        has: (_, key) => attrs.has(`data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`),
      },
    )
    void camel
    return el
  }
  const head = {
    ...makeEl('head'),
    appendChild(el) {
      const at = children.indexOf(el)
      if (at >= 0) children.splice(at, 1)
      children.push(el)
      el.isConnected = true
      return el
    },
  }
  const body = makeEl('body')
  const documentElement = makeEl('html')
  const document = {
    head,
    body,
    documentElement,
    visibilityState: 'visible',
    createElement: makeEl,
    querySelector(selector) {
      const m = /^style\[data-plugin-css="(.+)"\]$/.exec(selector)
      if (!m) return null
      return children.find((el) => el.dataset.pluginCss === m[1]) ?? null
    },
    // The decorator queries for surfaces this stub does not model (the model
    // picker lives in a third-party plugin). An empty list is the honest
    // answer here: there is nothing to decorate, and the code must survive it.
    //
    // The one selector family the stub MUST answer is the skin's own style
    // tags: the poll backstop counts them and the disposer removes them by
    // `style[data-plugin="..."]`. Returning `[]` there made the disposer a
    // no-op and the poll re-raise forever, so disposal looked broken when the
    // stub was the thing that was incomplete.
    querySelectorAll(selector) {
      const byOwner = /^style\[data-plugin="(.+)"\]$/.exec(selector)
      if (byOwner) return children.filter((el) => el.tagName === 'STYLE' && el.dataset.plugin === byOwner[1])
      const bySheet = /^style\[data-plugin-css="(.+)"\]$/.exec(selector)
      if (bySheet) return children.filter((el) => el.tagName === 'STYLE' && el.dataset.pluginCss === bySheet[1])
      return []
    },
    addEventListener() {},
    removeEventListener() {},
  }
  return { document, children }
}

const { document, children } = makeDom()

let registration = null
const window = {
  __ModuleLoader__: {
    load(record) {
      registration = record
    },
  },
}

const sandbox = { window, document, console, Symbol, Object, JSON, requestAnimationFrame: undefined }
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'lib/client.js' })

const fail = []
const check = (ok, message) => {
  if (!ok) fail.push(message)
}

check(registration !== null, 'the bundle never called window.__ModuleLoader__.load')
check(registration?.id === 'dsh-glass-theme', `registered id is ${registration?.id}`)

const exported = registration.factory((name) => {
  throw new Error(`unexpected require(${name})`)
})
check(typeof exported.apply === 'function', 'apply is not exported as a function')
check(Array.isArray(exported.inject), 'inject is not exported as an array')

const cleanups = []
const ctx = {
  effect(fn) {
    cleanups.push(fn())
  },
}

exported.apply(ctx)

const tags = children.filter((el) => el.tagName === 'STYLE')
check(tags.length >= 9, `expected at least 9 style tags, got ${tags.length}`)
check(
  tags.every((t) => t.dataset.plugin === 'dsh-glass-theme'),
  'a style tag is missing data-plugin="dsh-glass-theme" — removeOwnedStyles() would leak it',
)
check(
  tags.every((t) => typeof t.dataset.pluginCss === 'string' && t.dataset.pluginCss.length > 0),
  'a style tag is missing data-plugin-css',
)
check(
  new Set(tags.map((t) => t.dataset.pluginCss)).size === tags.length,
  'two sheets share the same data-plugin-css id',
)
check(
  tags.every((t) => t.textContent.trim().length > 0),
  'a sheet was inlined empty',
)
check(document.documentElement.dataset.dshGlassTheme === '', 'html marker attribute was not stamped')

// Applying twice must not double-inject: the loader can re-run a module.
exported.apply(ctx)
check(
  children.filter((el) => el.tagName === 'STYLE').length === tags.length,
  'a second apply() injected duplicate style tags',
)

// Disposal must leave nothing behind.
for (const cleanup of cleanups) cleanup()
check(
  children.filter((el) => el.tagName === 'STYLE').length === 0,
  'disposal left style tags in the document',
)
check(
  document.documentElement.dataset.dshGlassTheme === undefined,
  'disposal left the html marker attribute set',
)

const bytes = Buffer.byteLength(source)
if (fail.length === 0) {
  console.log(`ok — ${tags.length} sheets, ${(bytes / 1024).toFixed(1)} KB bundle`)
} else {
  for (const message of fail) console.log(`FAIL ${message}`)
  process.exitCode = 1
}
