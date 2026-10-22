/**
 * Which shipped tokens are consumed but never defined?
 *
 * Those are the ones the skin must invent a value for, because the app falls
 * back to an unstyled default (transparent, currentColor, none) when they are
 * missing. Tokens the app defines but the skin does not re-key are a different
 * problem — see tools/token-gap.mjs.
 *
 *   node tools/orphans.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const research = resolve(root, '../research')

const allCss =
  readFileSync(resolve(research, 'all-css.txt'), 'utf8') +
  '\n' +
  readFileSync(resolve(research, 'inline-css.txt'), 'utf8')

const defined = new Set([...allCss.matchAll(/(--dsw-[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
const consumers = new Map()
for (const m of allCss.matchAll(/var\((--dsw-[a-z0-9-]+)/g)) {
  consumers.set(m[1], (consumers.get(m[1]) ?? 0) + 1)
}

const orphans = [...consumers]
  .filter(([name]) => !defined.has(name))
  .sort((a, b) => b[1] - a[1])

console.log(`${orphans.length} token(s) consumed but never defined:\n`)
for (const [name, count] of orphans) console.log(`${String(count).padStart(4)}  ${name}`)
