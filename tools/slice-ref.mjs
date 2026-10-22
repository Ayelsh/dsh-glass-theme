#!/usr/bin/env node
/**
 * Slice a function out of the minified reference bundle by brace matching.
 *
 * The reference implementation ships as one minified file; reading a feature
 * means extracting one top-level function body. Naive regex cannot do it, and
 * passing the code through a shell -e string mangles the quotes. This tool does
 * the scan with a proper string/comment state machine.
 *
 *   node tools/slice-ref.mjs <needle> [--max <chars>] [--list]
 */
import { readFileSync } from 'node:fs'

const REF = 'C:/Users/lenovo/.dsh/profiles/desktop/node_modules/dsh-claude-style/lib/client.js'
const src = readFileSync(REF, 'utf8')

const argv = process.argv.slice(2)
const needle = argv.find((a) => !a.startsWith('--'))
if (!needle) {
  console.error('usage: node tools/slice-ref.mjs <needle> [--max N]')
  process.exit(2)
}
const maxIdx = argv.indexOf('--max')
const max = maxIdx >= 0 ? Number(argv[maxIdx + 1]) || 4000 : 4000

/** Walk forward from `from` and return the index just past the balanced close. */
function matchBrace(from) {
  let depth = 0
  let i = from
  while (i < src.length) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i)
      if (i < 0) return -1
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      if (end < 0) return -1
      i = end + 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      i += 1
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === quote) { i += 1; break }
        i += 1
      }
      continue
    }
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return i + 1
    }
    i += 1
  }
  return -1
}

const at = src.indexOf(needle)
if (at < 0) {
  console.error(`not found: ${needle}`)
  process.exit(1)
}

// Find the nearest `{` after the needle, then balance from there.
const open = src.indexOf('{', at)
const end = open < 0 ? -1 : matchBrace(open)
const stop = end > 0 ? end : at + max
const text = src.slice(at, Math.min(stop, at + max))
console.log(`/* offset ${at} … ${stop} (${stop - at} chars) */`)
console.log(text)
