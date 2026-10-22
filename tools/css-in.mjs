/**
 * Find the CSS-module string(s) in a shipped bundle that contain a given token.
 *
 *   node tools/css-in.mjs <bundle-name> <token> [contextChars]
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const shippedDir = resolve(here, '../../research/shipped')

const [name, token, ctxRaw] = process.argv.slice(2)
if (!name || !token) {
  console.error('usage: node tools/css-in.mjs <bundle> <token> [contextChars]')
  process.exit(2)
}
const ctx = Number(ctxRaw || 500)

const src = readFileSync(resolve(shippedDir, `${name}.js`), 'utf8')

// CSS-module strings are the long string literals in each bundle.
const literals = []
const re = /"((?:[^"\\\n]|\\.){120,})"/g
let m
while ((m = re.exec(src)) !== null) literals.push({ at: m.index, text: m[1] })

console.log(`${literals.length} long string literals in ${name}.js`)

let found = 0
for (const lit of literals) {
  const text = lit.text.replace(/\\n/g, '\n')
  const i = text.indexOf(token)
  if (i < 0) continue
  found++
  console.log(`\n=== literal at offset ${lit.at} (${text.length} chars) ===`)
  // Print the rules that mention the token.
  for (const rule of text.split('}')) {
    if (!rule.includes(token)) continue
    console.log(rule.trim().slice(0, ctx) + '}')
  }
}
if (found === 0) console.log(`token "${token}" not found in any CSS literal`)
