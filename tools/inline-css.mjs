/**
 * Extract every `0dsh-inline-css:` stylesheet from every shipped client bundle.
 *
 * The extraction pipeline that produced research/all-css.txt only collected
 * `0dsh-css:` CSS-module strings, so it missed the global stylesheets the theme
 * package ships inline (base, focus, onboarding, scrollbar, gradient-shadow-text,
 * shiki, design-platform). Those files define the --dsw-font-*, --dsw-elevation-*
 * and --dsw-shadow-* ladders — without them the token inventory looks broken.
 *
 *   node tools/inline-css.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, basename } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const research = resolve(root, '../research')
const shippedDir = resolve(research, 'shipped')

/** Read a JS double-quoted string literal starting at `open`. */
const readLiteral = (text, open) => {
  let i = open + 1
  while (i < text.length) {
    if (text[i] === '\\') { i += 2; continue }
    if (text[i] === '"') return { value: JSON.parse(text.slice(open, i + 1)), end: i + 1 }
    i += 1
  }
  throw new Error(`unterminated literal at ${open}`)
}

const found = []
for (const file of readdirSync(shippedDir).filter((f) => f.endsWith('.js'))) {
  const text = readFileSync(resolve(shippedDir, file), 'utf8')
  const re = /0dsh-inline-css:([^\n]*?)\.mjs\n/g
  let m
  while ((m = re.exec(text))) {
    const path = m[1]
    // The literal follows the region header as `var <name> = "...";`
    const assign = text.indexOf('"', m.index + m[0].length)
    if (assign < 0) continue
    const { value } = readLiteral(text, assign)
    if (!value.includes('{')) continue
    found.push({ pkg: basename(file, '.js'), file: basename(path), css: value })
  }
}

const parts = []
const byFile = new Map()
for (const { pkg, file, css } of found) {
  byFile.set(file, (byFile.get(file) ?? 0) + css.length)
  parts.push(`/* ===== ${pkg} :: ${file} ===== */\n${css}`)
}
writeFileSync(resolve(research, 'inline-css.txt'), parts.join('\n\n'), 'utf8')

console.log(`${found.length} inline stylesheets → research/inline-css.txt`)
for (const [file, bytes] of [...byFile].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${file.padEnd(30)} ${(bytes / 1024).toFixed(1)} KB`)
}
