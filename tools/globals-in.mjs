// Extract global class names and data-attributes a shipped bundle emits or references.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const shippedDir = resolve(here, '../../research/shipped')

const name = process.argv[2]
if (!name) {
  console.error('usage: node tools/globals-in.mjs <bundle>')
  process.exit(2)
}
const src = readFileSync(resolve(shippedDir, `${name}.js`), 'utf8')

const classes = new Set()
for (const m of src.matchAll(/["'`]((?:md|ds|dsh)-[a-z][a-z0-9-]{2,32})["'`]/g)) classes.add(m[1])
console.log(`global classes in ${name}.js:\n  ${[...classes].sort().join('\n  ') || '(none)'}`)

const attrs = new Set()
for (const m of src.matchAll(/["'`](data-[a-z][a-z0-9-]{2,36})["'`]/g)) attrs.add(m[1])
console.log(`\ndata-attributes in ${name}.js:\n  ${[...attrs].sort().join('\n  ') || '(none)'}`)

// data-x="y" style attribute keys written inline in JSX
const jsxAttrs = new Set()
for (const m of src.matchAll(/["']?(data-[a-z][a-z0-9-]{2,36})=/g)) jsxAttrs.add(m[1])
console.log(`\nattributes with values:\n  ${[...jsxAttrs].sort().join('\n  ') || '(none)'}`)
