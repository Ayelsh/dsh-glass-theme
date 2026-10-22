/**
 * Finds substring-selector leaks.
 *
 * `[class*='X']` matches any class containing X, which is what makes the skin
 * able to address hashed names at all — but it also means a selector written for
 * a root element silently matches every sibling whose local name merely starts
 * with the same word. `[class*='wCInkW_nav']` was written for the settings nav
 * column and also hit navCell, navIcon, navLabel, navList and navTitle, painting
 * a border down the side of every row.
 *
 * The build has no error for this: the rule is valid, it just applies in places
 * it was never meant to. So it is checked statically, the same way dead
 * selectors are.
 *
 *   node tools/leak.mjs [--min 1]
 *
 * Reports every `[class*='T']` in src/css whose T is a strict prefix of another
 * shipped class that is a DIFFERENT local name, with the extra matches listed.
 * Exit 1 if any are found, so it can gate a build.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cssDir = resolve(here, '../src/css')
const mapPath = process.env.LG_CLASS_MAP ?? resolve(here, '../../research/shipped-class-map.json')
const allCssPath = process.env.LG_ALL_CSS ?? resolve(here, '../../research/all-css.txt')

/** Every hashed class the shipped build emits, grouped by local name. */
const map = JSON.parse(readFileSync(mapPath, 'utf8'))
const hashed = new Map() // hashed class -> { pkg, mod, local }
for (const [pkg, mods] of Object.entries(map)) {
  for (const [mod, locals] of Object.entries(mods)) {
    for (const [local, cls] of Object.entries(locals)) {
      hashed.set(cls, { pkg, mod, local })
    }
  }
}

/** Vite-shell classes from the frontend bundle: `_local_hash_index`. */
const allCss = readFileSync(allCssPath, 'utf8')
const vite = new Map() // stem -> full class
for (const m of allCss.matchAll(/\.(_[A-Za-z0-9]+_[a-z0-9]+_\d+)/g)) {
  const full = m[1]
  const parts = full.slice(1).split('_')
  vite.set(full, { local: parts[0], hash: parts[1] })
}

/** Every class token the app can put in a class attribute. */
const everyClass = [...hashed.keys(), ...vite.keys()]

const cssFiles = readdirSync(cssDir).filter((f) => f.endsWith('.css')).sort()
const leaks = []
const seen = new Set()

for (const file of cssFiles) {
  const text = readFileSync(resolve(cssDir, file), 'utf8')
  // Strip comments so documentation examples are not reported.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '')
  // Only `*=` can leak; `~=` tests whole class tokens and cannot over-match.
  for (const m of code.matchAll(/\[class\*=['"]([^'"]+)['"]\]/g)) {
    const token = m[1]
    const key = token
    if (seen.has(key)) continue
    seen.add(key)

    // Only a COMPLETE hashed class can be over-matching in a way worth fixing:
    // `[class*='fO69Vq_pageTab']` reads as one element but also catches
    // pageTabList and pageTabs. Partial stems (`_markdown`, `_toast_l6cvn`)
    // are deliberately broad — they address a build-unstable name — and the
    // locals they also hit are the same element under its unhashed name.
    if (!hashed.has(token)) continue

    const prefixed = everyClass
      .filter((c) => c !== token && c.startsWith(token))
      .map((c) => hashed.get(c)?.local ?? vite.get(c)?.local ?? c)
    const extra = [...new Set(prefixed)].filter((l) => l !== token)
    if (extra.length === 0) continue

    leaks.push({ file, token, matches: extra.sort() })
  }
}

if (leaks.length === 0) {
  console.log('no substring leaks')
} else {
  console.log(`${leaks.length} substring leak(s):\n`)
  for (const l of leaks) {
    console.log(`  ${l.file}: [class*='${l.token}'] also matches`)
    console.log(`      ${l.matches.join(', ')}`)
  }
  process.exitCode = 1
}
