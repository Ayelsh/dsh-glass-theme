/**
 * Rewrites exact hashed class selectors from substring to word match.
 *
 * `[class*='X']` is a substring test, so a selector written for one element
 * also matches every descendant whose class merely starts with the same word:
 * `[class*='wCInkW_nav']` (the settings nav column) also caught navCell,
 * navIcon and navTitle, painting a border down the side of every row.
 *
 * When the token is a COMPLETE hashed class — which is the common case, since
 * the hash prefix already makes it unique — the right operator is `~=`, which
 * tests whitespace-separated class tokens. That is exactly what a class name is,
 * so the selector stops leaking by construction rather than by hand-picking a
 * longer prefix.
 *
 * Partial stems (e.g. `_sidebarCol`, or the Vite shell's `_toast_l6cvn`) are
 * left alone: those are deliberately matching an unstable name.
 *
 *   node tools/exact.mjs [--write]
 *
 * Without --write it only reports what it would change.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cssDir = resolve(here, '../src/css')
const mapPath = process.env.LG_CLASS_MAP ?? resolve(here, '../../research/shipped-class-map.json')
const write = process.argv.includes('--write')

const map = JSON.parse(readFileSync(mapPath, 'utf8'))
const exact = new Set()
for (const mods of Object.values(map)) {
  for (const locals of Object.values(mods)) {
    for (const cls of Object.values(locals)) exact.add(cls)
  }
}

const files = readdirSync(cssDir).filter((f) => f.endsWith('.css')).sort()
let total = 0

for (const file of files) {
  const path = resolve(cssDir, file)
  const text = readFileSync(path, 'utf8')

  // Only rewrite inside selectors, and only the quoted token itself; comments
  // are skipped so documentation that quotes a selector stays readable.
  const next = text.replace(/(\/\*[\s\S]*?\*\/)|(\[class\*=['"]([^'"]+)['"]\])/g, (m, comment, selector, token) => {
    if (comment !== undefined) return comment
    if (!exact.has(token)) return selector
    total++
    return `[class~='${token}']`
  })

  if (next !== text) {
    const n = (text.match(/\[class\*=/g) ?? []).length - (next.match(/\[class\*=/g) ?? []).length
    console.log(`${file}: ${n} selector(s) -> word match`)
    if (write) writeFileSync(path, next)
  }
}

console.log(`${total} exact hashed class selector(s) ${write ? 'rewritten' : 'would be rewritten (pass --write)'}`)
