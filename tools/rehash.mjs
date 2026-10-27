/**
 * Re-derive every CSS-module hash the skin targets after a DSH update.
 *
 *   node tools/rehash.mjs           # print the stale -> fresh map (dry run)
 *   node tools/rehash.mjs --write   # rewrite src/css/*.css in place
 *   ASAR=<path> node tools/rehash.mjs
 *
 * WHY THIS EXISTS
 * The skin keys hundreds of rules on the host's CSS-module class names
 * (`[class~='RlGAzG_card']`). Those names are `<hash>_<suffix>` where the hash
 * is derived from the module's file path and content — a DSH update that moves
 * or rebuilds a module rehashes it (the 2026-10-23 update rehashed ALL of
 * them), and every hashed rule silently stops matching while the DOM itself is
 * unchanged.
 *
 * HOW IT RECOVERS
 * The SUFFIXES are stable (`card`, `panel`, `sessionRow`, …); only the hash in
 * front churns. Each module's class map is a set of `<hash>_<suffix>` literals
 * inside one `lib/*.js` file of the new asar, and each stale prefix's expected
 * suffix set is exactly what the sheets already select on. So: read every
 * client bundle, collect each candidate prefix's suffix set, and match each
 * stale prefix to the candidate whose set covers the sheet's set. A unique
 * full cover is a confident rename; anything else is reported for a manual
 * override in tools/rehash-overrides.json.
 */
import { readAsar, listDir } from './asar-lib.mjs'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const BASE = 'dsh/node_modules/@deepseek-ai' // inside the asar asar-lib.mjs opens
const WRITE = process.argv.includes('--write')

// ---- 1. what the sheets expect: prefix -> suffix set ----------------------
const expected = new Map() // prefix -> { suffixes:Set, sheets:Set }
const token = /\[class~='([A-Za-z0-9_-]+)'\]/g
for (const f of readdirSync(resolve(root, 'src/css')).filter((x) => x.endsWith('.css'))) {
  const css = readFileSync(resolve(root, 'src/css', f), 'utf8')
  for (const [, cls] of css.matchAll(token)) {
    const i = cls.lastIndexOf('_')
    if (i < 1) continue
    const p = cls.slice(0, i), s = cls.slice(i + 1)
    if (!expected.has(p)) expected.set(p, { suffixes: new Set(), sheets: new Set() })
    expected.get(p).suffixes.add(s)
    expected.get(p).sheets.add(f)
  }
}

// manual overrides win before anything else
const overridesPath = resolve(here, 'rehash-overrides.json')
const overrides = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, 'utf8')) : {}

// ---- 2. what the asar offers: candidate prefix -> { suffixes, file } ------
const candidates = new Map()
const pkgList = listDir(BASE) ?? []
let fileCount = 0
for (const pkg of pkgList) {
  const lib = (listDir(`${BASE}/${pkg}/lib`) ?? []).filter((x) => x.endsWith('.js'))
  for (const f of lib) {
    const buf = readAsar(`${BASE}/${pkg}/lib/${f}`)
    if (!buf) continue
    fileCount += 1
    const text = buf.toString('utf8')
    for (const [, cand, suf] of text.matchAll(/([A-Za-z][A-Za-z0-9-]{3,9}|_[A-Za-z0-9]{5,7})_([A-Za-z][A-Za-z0-9]*)/g)) {
      if (!candidates.has(cand)) candidates.set(cand, { suffixes: new Set(), file: `${pkg}/${f}` })
      candidates.get(cand).suffixes.add(suf)
    }
  }
}

// ---- 3. match --------------------------------------------------------------
const map = new Map() // stale -> fresh
const manual = []
for (const [stale, { suffixes, sheets }] of expected) {
  if (overrides[stale]) { map.set(stale, overrides[stale]); continue }
  // alive: the exact hash still occurs somewhere in the new bundles
  if (candidates.has(stale)) continue
  const covers = []
  for (const [cand, { suffixes: have }] of candidates) {
    if (cand === stale || cand.includes('_')) continue
    let ok = true
    for (const s of suffixes) if (!have.has(s)) { ok = false; break }
    if (ok) covers.push(cand)
  }
  if (covers.length === 1) map.set(stale, covers[0])
  else manual.push({ stale, sheets: [...sheets].join(','), n: covers.length, covers: covers.slice(0, 6) })
}

// ---- 4. report / write -----------------------------------------------------
const renames = [...map].filter(([a, b]) => a !== b)
console.log(`asar: ${fileCount} js file(s) scanned; sheet prefixes: ${expected.size}`)
for (const [a, b] of renames) console.log(`  ${a} -> ${b}   (${[...expected.get(a).sheets].join(',')})`)
if (manual.length) {
  console.log(`\n${manual.length} prefix(es) need a manual call — add them to tools/rehash-overrides.json:`)
  for (const m of manual) console.log(`  ${m.stale}  sheets=${m.sheets}  ${m.n} full-cover candidate(s): ${m.covers.join(' ') || 'NONE'}`)
}
if (!renames.length && !manual.length) console.log('everything already current; nothing to do')

if (WRITE) {
  if (renames.length) {
    for (const f of new Set([...expected].flatMap(([, v]) => [...v.sheets]))) {
      const path = resolve(root, 'src/css', f)
      let css = readFileSync(path, 'utf8')
      for (const [a, b] of renames) css = css.replaceAll(`${a}_`, `${b}_`)
      writeFileSync(path, css, 'utf8')
    }
    console.log(`rewrote sheets with ${renames.length} rename(s)`)
  } else console.log('nothing to write')
}
