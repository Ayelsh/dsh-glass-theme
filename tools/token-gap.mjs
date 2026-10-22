/**
 * Diff the shipped token vocabulary against the skin's token layer.
 *
 * The skin re-keys `--dsw-*` aliases so pages it has no rule for still inherit
 * the new palette. That promise only holds if the re-keyed set actually covers
 * what the app consumes — this prints the gap, with both mode values so a
 * missing token can be filled in directly.
 *
 *   node tools/token-gap.mjs            # summary + every gap token
 *   node tools/token-gap.mjs --defined  # only tokens the app never defines
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const research = resolve(root, '../research')

const platform = readFileSync(resolve(research, 'design-platform.css'), 'utf8')
const allCss =
  readFileSync(resolve(research, 'all-css.txt'), 'utf8') +
  '\n' +
  readFileSync(resolve(research, 'inline-css.txt'), 'utf8')
const skin = readFileSync(resolve(root, 'src/css/tokens.css'), 'utf8')

/**
 * Walk the stylesheet block by block, keeping only top-level rules whose
 * selector is one of `selectors`. design-platform.css declares the static
 * palette and the alias layer in four separate `body` blocks, so mode has to be
 * read per block — slicing at the first dark selector gets it wrong.
 */
const collect = (css, selectors) => {
  const out = new Map()
  let depth = 0
  let selector = ''
  let body = ''
  let start = 0
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') {
      if (depth === 0) {
        selector = css.slice(start, i).trim()
        body = ''
      }
      depth += 1
    } else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        if (selectors.includes(selector)) {
          for (const m of body.matchAll(/(--dsw-[a-z0-9-]+)\s*:\s*([^;}]+)/g)) out.set(m[1], m[2].trim())
        }
        start = i + 1
      }
    } else if (depth > 0) {
      body += ch
    }
  }
  return out
}

const light = collect(platform, ['body'])
const dark = collect(platform, ['body[data-ds-dark-theme]'])

const defined = new Set([...allCss.matchAll(/(--dsw-[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
const used = new Set([...allCss.matchAll(/var\((--dsw-[a-z0-9-]+)/g)].map((m) => m[1]))
const rekeyed = new Set([...skin.matchAll(/^\s*(--dsw-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]))

const undefinedButUsed = [...used].filter((t) => !defined.has(t) && !rekeyed.has(t)).sort()
const gap = [...used].filter((t) => defined.has(t) && !rekeyed.has(t)).sort()

console.log(`used ${used.size} · defined by app ${defined.size} · re-keyed by skin ${rekeyed.size}`)
console.log(`\nconsumed but defined nowhere (${undefinedButUsed.length}):`)
console.log(undefinedButUsed.join('  '))

if (process.argv.includes('--defined')) {
  console.log(`\nused by app, not re-keyed by skin (${gap.length}):`)
  for (const name of gap) {
    console.log(`${name}\n    light: ${light.get(name) ?? '—'}\n    dark : ${dark.get(name) ?? '—'}`)
  }
} else {
  console.log(`\nused by app, not re-keyed by skin (${gap.length}):`)
  console.log(gap.join('  '))
}
