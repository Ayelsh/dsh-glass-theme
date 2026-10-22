/**
 * Query the extracted host stylesheet for the rules that mention a given
 * selector token, so a skin author can see exactly what they are overriding.
 *
 *   node tools/q.mjs BynINW_frame RlGAzG_card
 *   node tools/q.mjs --props BynINW_frame
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const HOST_CSS = process.env.LG_HOST_CSS || resolve(here, '../../research/shipped-css.txt')

const args = process.argv.slice(2)
const propsOnly = args.includes('--props')
const needles = args.filter((a) => !a.startsWith('--'))

if (needles.length === 0) {
  console.error('usage: node tools/q.mjs [--props] <class-or-selector-token> [...]')
  process.exit(2)
}

const text = readFileSync(HOST_CSS, 'utf8')

/** Split a flat stylesheet into top-level rules (handles nested @media one level). */
function splitRules(css) {
  const out = []
  let depth = 0
  let start = 0
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        out.push(css.slice(start, i + 1).trim())
        start = i + 1
      }
    }
  }
  return out
}

const rules = splitRules(text)

for (const needle of needles) {
  console.log(`\n=== ${needle} ===`)
  let hits = 0
  for (const rule of rules) {
    if (!rule.includes(needle)) continue
    // For @media blocks, keep the wrapper header but show inner rules that match.
    if (rule.startsWith('@')) {
      const inner = splitRules(rule.slice(rule.indexOf('{') + 1, -1))
      const keep = inner.filter((r) => r.includes(needle))
      if (keep.length === 0) continue
      hits += keep.length
      console.log(rule.slice(0, rule.indexOf('{')).trim() + ' {')
      for (const r of keep) console.log('  ' + r.replace(/\s+/g, ' '))
      console.log('}')
    } else {
      hits++
      if (propsOnly) {
        const sel = rule.slice(0, rule.indexOf('{')).trim()
        const body = rule.slice(rule.indexOf('{') + 1, -1)
        console.log(sel + ' =>')
        for (const d of body.split(';')) if (d.trim()) console.log('  ' + d.trim())
      } else {
        console.log(rule.replace(/\s+/g, ' '))
      }
    }
  }
  if (hits === 0) console.log('(no rule mentions this token)')
}

