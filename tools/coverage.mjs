/**
 * How much of the app does the skin actually touch?
 *
 * "All pages" is a claim that needs a number behind it. This walks every hashed
 * class the shipped build emits, groups them by owning package, and reports how
 * many are referenced by src/css/*.css. A package at 0% is a page nobody
 * repainted yet.
 *
 * Note on honesty: a class being referenced does not mean the rule that
 * references it is beautiful — it means the surface is not untouched. Use it to
 * find blind spots, not to declare victory.
 *
 *   node tools/coverage.mjs            # per-package table, worst first
 *   node tools/coverage.mjs --missing  # also list the untouched classes
 *   node tools/coverage.mjs <pkg>      # one package in detail
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const research = resolve(root, '../research')

const map = JSON.parse(readFileSync(resolve(research, 'shipped-class-map.json'), 'utf8'))

/** hashed class -> package */
const owner = new Map()
for (const [pkg, modules] of Object.entries(map)) {
  for (const locals of Object.values(modules)) {
    for (const hashed of Object.values(locals)) owner.set(hashed, pkg)
  }
}

/** Every hashed class the skin mentions, via [class*='…'], [class~='…'] or a
 *  bare .class. `~=` names the class exactly; `*=` is a substring test. */
const css = readdirSync(resolve(root, 'src/css'))
  .map((file) => readFileSync(resolve(root, 'src/css', file), 'utf8'))
  .join('\n')

const referenced = new Set()
for (const m of css.matchAll(/\[class~=['"]([^'"]+)['"]\]/g)) {
  if (owner.has(m[1])) referenced.add(m[1])
}
for (const m of css.matchAll(/\[class\*=['"]([^'"]+)['"]\]/g)) {
  const token = m[1]
  for (const hashed of owner.keys()) if (hashed.includes(token)) referenced.add(hashed)
}
for (const m of css.matchAll(/\.([A-Za-z0-9_-]{6,}_[A-Za-z0-9_-]+)/g)) {
  if (owner.has(m[1])) referenced.add(m[1])
}

const byPackage = new Map()
for (const [hashed, pkg] of owner) {
  if (!byPackage.has(pkg)) byPackage.set(pkg, { total: 0, hit: [] , miss: [] })
  const row = byPackage.get(pkg)
  row.total += 1
  if (referenced.has(hashed)) row.hit.push(hashed)
  else row.miss.push(hashed)
}

const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null
const showMissing = process.argv.includes('--missing')

const rows = [...byPackage]
  .filter(([pkg]) => only === null || pkg === only)
  .map(([pkg, row]) => ({ pkg, ...row, pct: (row.hit.length / row.total) * 100 }))
  .sort((a, b) => a.pct - b.pct || a.pkg.localeCompare(b.pkg))

const totalClasses = rows.reduce((n, r) => n + r.total, 0)
const totalHit = rows.reduce((n, r) => n + r.hit.length, 0)

console.log(
  `${totalHit}/${totalClasses} shipped classes referenced ` +
    `(${((totalHit / totalClasses) * 100).toFixed(1)}%) across ${rows.length} package(s)\n`,
)
console.log('   %   hit/total  package')
for (const row of rows) {
  const pct = row.pct.toFixed(0).padStart(4)
  console.log(`${pct}%   ${String(row.hit.length).padStart(3)}/${String(row.total).padEnd(4)}   ${row.pkg}`)
  if (showMissing || only !== null) {
    if (row.miss.length > 0) console.log(`         untouched: ${row.miss.slice(0, 24).join(' ')}`)
  }
}
