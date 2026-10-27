/**
 * Loads the ported host half against a stub ctx and reports what it registers.
 *
 * WHY THIS EXISTS: the host half only loads when the GUI process starts, and a
 * throw there can take the whole app down. The GUI I am working against is the
 * one serving this conversation, so "restart and see" is not an available test.
 * This runs the same `apply(ctx)` the harness will run, against a ctx that
 * records every call, so a missing service, a bad import or a throw at module
 * top level shows up here instead of at the user's next launch.
 *
 *   node tools/host-check.mjs
 */
import { pathToFileURL } from 'node:url'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const entry = resolve(here, '..', 'lib', 'host', 'index.js')

/**
 * The host half resolves `@deepseek-ai/schemastery` with `createRequire` on
 * `process.argv[1]`, which inside the app is the app's own entry point. Run
 * from here, that anchor is this script, and the package's nearest
 * `node_modules` chain carries no schemastery — so `Config` came back
 * `undefined` and the projected keys could not be checked at all. Re-anchor
 * argv[1] on the installed profile's `node_modules` when that is where the
 * factory lives. Nothing about the shipped resolution changes: the app's own
 * anchor is still the first one tried.
 */
const resolveAnchor = () => {
  const home = process.env.DSH_HOME || resolve(homedir(), '.dsh')
  const candidates = [
    resolve(home, 'profiles', 'desktop', 'node_modules'),
    resolve(home, 'profiles', 'web', 'node_modules'),
    resolve(here, '..', 'node_modules'),
  ]
  for (const dir of candidates) {
    if (existsSync(resolve(dir, '@deepseek-ai', 'schemastery'))) return resolve(dir, '.host-check-anchor.js')
  }
  return null
}
const anchor = resolveAnchor()
if (anchor !== null) process.argv[1] = anchor

const calls = []
const routes = []
const services = new Map()

const makeScope = (label) => ({
  effect(fn, name) {
    calls.push(`${label}.effect(${name ?? 'anonymous'})`)
    // Run the effect body: that is where routes and services are created.
    try {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    } catch (error) {
      calls.push(`${label}.effect THREW: ${error && error.message}`)
      throw error
    }
  },
  get(name) {
    return services.get(name) ?? null
  },
  webServer: {
    register(route) {
      routes.push(`${route.kind ?? 'exact'} ${route.path}`)
      return () => {}
    },
  },
  settings: {
    configure() {
      calls.push(`${label}.settings.configure`)
    },
  },
})

const ctx = {
  fiber: {},
  get(name) {
    calls.push(`ctx.get(${name})`)
    return services.get(name) ?? null
  },
  inject(names, fn) {
    calls.push(`ctx.inject([${names.join(',')}])`)
    return fn(makeScope(`scope<${names.join(',')}>`))
  },
  effect(fn, name) {
    return makeScope('ctx').effect(fn, name)
  },
}

// Services the host modules look up.
services.set('sessionQuery', { observeSession: async () => [], list: async () => [] })

let mod
try {
  mod = await import(pathToFileURL(entry).href)
} catch (error) {
  console.log(`FAIL: import threw: ${error && error.message}`)
  process.exit(1)
}

console.log(`module exports: ${Object.keys(mod).join(', ')}`)
console.log(`name: ${mod.name}`)
console.log(`Config: ${mod.Config === undefined ? 'undefined (schemastery not resolvable — matches the reference)' : 'defined'}`)

/* The projected form keys are what the settings page can read and write, so a
   preference added to PREFS but never projected is invisible to the client. */
const projected = mod.Config && mod.Config.dict ? Object.keys(mod.Config.dict) : []
console.log(`Config keys: ${projected.length}`)
for (const key of projected) {
  const field = mod.Config.dict[key]
  const meta = field && field.meta ? field.meta : {}
  const shape = field && field.type ? field.type : '?'
  console.log(`  ${key.padEnd(20)} ${String(shape).padEnd(8)} default=${JSON.stringify(meta.default)}${meta.volatile === true ? ' volatile' : ''}`)
}

if (typeof mod.apply !== 'function') {
  console.log('FAIL: apply is not a function')
  process.exit(1)
}

let threw = null
try {
  mod.apply(ctx)
} catch (error) {
  threw = error
}

for (const line of calls) console.log(`  ${line}`)
console.log(`routes registered: ${routes.length}`)
for (const route of routes) console.log(`  ${route}`)

if (threw !== null) {
  console.log(`FAIL: apply threw: ${threw && threw.message}`)
  console.log(threw && threw.stack)
  process.exit(1)
}

if (routes.length === 0) {
  console.log('WARN: no routes registered — the host half would serve nothing')
}

console.log(threw === null ? 'ok' : 'FAIL')
