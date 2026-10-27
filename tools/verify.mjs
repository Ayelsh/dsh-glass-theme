/**
 * Verify every selector token used in src/css/*.css can actually match something
 * the shipped app renders.
 *
 * The skin is nothing but selectors, so a wrong hash prefix or a wrong local
 * name is a silently dead rule — no error, no warning, just a surface that never
 * gets styled. This check is the skin's only real test.
 *
 * Sources of truth, both extracted from the installed app.asar:
 *   research/shipped-class-map.json  hashed CSS-module classes of the client bundles
 *   research/all-css.txt             every stylesheet (client bundles + the Vite
 *                                    frontend shell, which owns markdown/code/dockkit)
 *   research/shipped-attrs.txt       every data-* attribute the bundles reference
 *
 * Tokens are matched as substrings, because that is what `[class*='…']` tests.
 *
 *   node tools/verify.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const research = resolve(root, '../research')

const map = JSON.parse(readFileSync(resolve(research, 'shipped-class-map.json'), 'utf8'))
const allCss = readFileSync(resolve(research, 'all-css.txt'), 'utf8')
const attrInventory = readFileSync(resolve(research, 'shipped-attrs.txt'), 'utf8')

/**
 * Classes emitted by INSTALLED THIRD-PARTY plugins (tools/foreign-inventory.mjs).
 *
 * The skin decorates a few surfaces it does not own — the composer model picker
 * is rendered by dsh-codex-subscription, whose classes are plain
 * `.codexModelSelectOption` rather than hashed CSS-module names. Without this
 * set every such selector reads as dead. The set is not a blanket allowlist: it
 * is extracted from the installed bundles, so a renamed plugin class still
 * fails here.
 */
const foreign = existsSync(resolve(research, 'foreign-class-map.json'))
  ? JSON.parse(readFileSync(resolve(research, 'foreign-class-map.json'), 'utf8'))
  : {}
const foreignClasses = new Set()
for (const classes of Object.values(foreign)) for (const c of classes) foreignClasses.add(c)

// Classes styled deliberately although this machine no longer emits them
// (tools/verify-legacy.json documents each one). Enumerated, committed, and
// reasoned — not a blanket allowlist: anything absent from the inventories AND
// this file still fails the run.
const legacy = existsSync(resolve(here, 'verify-legacy.json'))
  ? JSON.parse(readFileSync(resolve(here, 'verify-legacy.json'), 'utf8'))
  : {}
for (const c of legacy.classes ?? []) foreignClasses.add(c)

/** Every class name the app emits, hashed or global. */
const shipped = new Set()

// Hashed CSS-module classes from the client bundles.
const prefixPkg = new Map()
for (const [pkg, modules] of Object.entries(map)) {
  for (const classes of Object.values(modules)) {
    for (const hashed of Object.values(classes)) {
      if (typeof hashed !== 'string' || !hashed) continue
      shipped.add(hashed)
      const at = hashed.indexOf('_')
      if (at > 0) prefixPkg.set(hashed.slice(0, at), pkg)
    }
  }
}

// Vite frontend-shell classes: `_local_hash_index` — the hash is build-unstable,
// so index the stable `_local_` stem as well as the full name.
const viteClasses = new Set()
for (const m of allCss.matchAll(/\.(_[a-zA-Z][a-zA-Z0-9]*_[a-z0-9]{5}_\d+)/g)) {
  viteClasses.add(m[1])
  shipped.add(m[1])
}
/** `_local_` stems, so `[class*='_markdown_']` can be validated. */
const viteStems = new Set([...viteClasses].map((c) => c.slice(0, c.lastIndexOf('_') + 1)))

/** True when `token` appears inside some class name the app emits. */
const matchesSomething = (token) => {
  for (const hashed of shipped) if (hashed.includes(token)) return true
  for (const stem of viteStems) if (stem.includes(token)) return true
  return false
}

const cssDir = resolve(root, 'src/css')
const files = readdirSync(cssDir).filter((f) => f.endsWith('.css'))

const misses = []
const seen = new Set()
let total = 0

for (const file of files) {
  const css = readFileSync(resolve(cssDir, file), 'utf8')
  // Both operators are validated: `*=` (substring, used for stems) and `~=`
  // (whole class token, used for complete hashed names). For `~=` the token
  // must be an exact shipped class, since that is what the operator tests.
  for (const m of css.matchAll(/class([*~])=['"]([^'"\]]+)['"]\]/g)) {
    const [, op, token] = m
    total++
    const key = `${file}\u0000${op}\u0000${token}`
    if (seen.has(key)) continue
    seen.add(key)
    if (op === '~') {
      if (!shipped.has(token) && !foreignClasses.has(token)) {
        misses.push(`MISS ${file.padEnd(18)} ${token.padEnd(30)} [class~=] requires an exact shipped or installed-plugin class`)
      }
      continue
    }
    if (matchesSomething(token)) continue
    if (foreignClasses.has(token)) continue
    // A substring token over a plugin class is legitimate when it addresses a
    // whole family, e.g. `codexModelSelectOption` catching Option/OptionName.
    let foreignHit = false
    for (const c of foreignClasses) {
      if (c.includes(token)) {
        foreignHit = true
        break
      }
    }
    if (foreignHit) continue

    const bare = token.replace(/^_/, '')
    const at = bare.indexOf('_')
    const prefix = at > 0 ? bare.slice(0, at) : bare
    const local = at > 0 ? bare.slice(at + 1) : ''
    const owner = prefixPkg.get(prefix)
    let why
    if (owner && local) {
      const exact = `${prefix}_${local}`
      why = shipped.has(exact)
        ? `class is ${exact} but the token has a leading underscore — [class*=] cannot match it`
        : `prefix ${prefix} (${owner}) has no local name "${local}"`
    } else if (owner) {
      why = `prefix ${prefix} belongs to ${owner}`
    } else if (/^_[a-zA-Z]/.test(token)) {
      why = `looks like a Vite frontend class, but no "${token}" stem in all-css.txt`
    } else {
      why = `prefix ${prefix} is not in the shipped build`
    }
    misses.push(`MISS ${file.padEnd(18)} ${token.padEnd(30)} ${why}`)
  }
}

for (const line of misses) console.log(line)

// Attribute hooks: must be either referenced by a shipped stylesheet, emitted by
// a bundle, or written by the skin's own client half. The last case is not a
// loophole: `data-lg-input` is stamped by src/client.js, so it is checked
// against that file rather than trusted — an attribute that no one sets is a
// dead selector, whichever side was supposed to set it.
const attrSeen = new Set()
for (const file of files) {
  const css = readFileSync(resolve(cssDir, file), 'utf8')
  for (const m of css.matchAll(/\[(data-[a-z0-9-]+)[\]=]/g)) attrSeen.add(m[1])
}
// The skin's own executable half spans more than one source file (the picker,
// the stats panel and the catalog are spliced into the bundle at build time), so
// an attribute is "set by the skin" when ANY authored source emits it.
const ownSources = ['client.js', 'picker.js', 'stats.js', 'settings-section.js', 'catalog.js']
  .map((name) => {
    try {
      return readFileSync(resolve(here, '..', 'src', name), 'utf8')
    } catch {
      return ''
    }
  })
  .join('\n')
const attrBad = []
const attrOwned = []
for (const attr of [...attrSeen].sort()) {
  if (allCss.includes(attr) || attrInventory.includes(attr)) continue
  if (ownSources.includes(attr)) {
    attrOwned.push(attr)
    continue
  }
  attrBad.push(attr)
  console.log(`ATTR ${attr} — neither styled by a shipped stylesheet nor emitted by a bundle`)
}

console.log(
  `\n${total} class references (${seen.size} distinct), ${misses.length} unresolved; ` +
    `${attrSeen.size} attribute hooks, ${attrBad.length} unconfirmed` +
    (attrOwned.length > 0 ? ` (${attrOwned.join(', ')} set by the skin)` : '') +
    (foreignClasses.size > 0 ? `; ${foreignClasses.size} installed-plugin classes in scope` : ''),
)
process.exitCode = misses.length === 0 && attrBad.length === 0 ? 0 : 1
