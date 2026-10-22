// Aggregate every data-* attribute and global class the shipped bundles reference,
// with a per-bundle count, so the skin can target hooks that actually exist.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const research = resolve(here, '../../research')
const shippedDir = resolve(research, 'shipped')

/** attr -> Set(pkg) */
const attrs = new Map()
/** global class -> Set(pkg) */
const globals = new Map()

for (const file of readdirSync(shippedDir).filter((f) => f.endsWith('.js'))) {
  const pkg = file.replace(/\.js$/, '')
  const src = readFileSync(resolve(shippedDir, file), 'utf8')

  for (const m of src.matchAll(/["'`](data-[a-z][a-z0-9-]{2,40})["'`]/g)) {
    if (!attrs.has(m[1])) attrs.set(m[1], new Set())
    attrs.get(m[1]).add(pkg)
  }
  for (const m of src.matchAll(/["'`]((?:md|ds|dsh)-[a-z][a-z0-9-]{2,34})["'`]/g)) {
    if (!globals.has(m[1])) globals.set(m[1], new Set())
    globals.get(m[1]).add(pkg)
  }
}

const attrRows = [...attrs.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
const globalRows = [...globals.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))

const short = (pkg) => pkg.replace(/^dsh-client-/, '').replace(/^ui-/, '')
const lines = []
lines.push('# Shipped data-* attribute inventory\n')
for (const [attr, pkgs] of attrRows) {
  lines.push(`${attr.padEnd(38)} ${[...pkgs].map(short).sort().join(' ')}`)
}
lines.push('\n# Shipped global (unhashed) class inventory\n')
for (const [cls, pkgs] of globalRows) {
  lines.push(`${cls.padEnd(38)} ${[...pkgs].map(short).sort().join(' ')}`)
}

const out = resolve(research, 'shipped-attrs.txt')
writeFileSync(out, lines.join('\n'))
console.log(`${attrRows.length} attributes, ${globalRows.length} global classes -> ${out}`)
