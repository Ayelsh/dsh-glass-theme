/**
 * Emit the shipped definitions of tokens the skin has not re-keyed yet, so the
 * "coverage" section can be written from the real values instead of invented
 * ones. Prints name, light value and dark value side by side.
 *
 *   node tools/gap-defs.mjs [filter]
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const research = resolve(here, '../../research')

const filter = process.argv[2] ?? ''

/** Every stylesheet the app ships, concatenated in source order. */
const css = readFileSync(resolve(research, 'inline-css.txt'), 'utf8')

/**
 * Split the blob into light and dark regions. The dark region is everything
 * inside a `body[data-ds-dark-theme]` block; light is everything else. Crude but
 * exact enough: these sheets never nest dark inside light.
 */
const lightChunks = []
const darkChunks = []
let i = 0
while (i < css.length) {
  const at = css.indexOf('body[data-ds-dark-theme]', i)
  if (at < 0) {
    lightChunks.push(css.slice(i))
    break
  }
  lightChunks.push(css.slice(i, at))
  const open = css.indexOf('{', at)
  let depth = 0
  let j = open
  for (; j < css.length; j += 1) {
    if (css[j] === '{') depth += 1
    else if (css[j] === '}') {
      depth -= 1
      if (depth === 0) break
    }
  }
  darkChunks.push(css.slice(open + 1, j))
  i = j + 1
}

const collect = (chunks) => {
  const map = new Map()
  for (const chunk of chunks) {
    for (const m of chunk.matchAll(/(--dsw-[a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
      if (!map.has(m[1])) map.set(m[1], m[2].trim())
    }
  }
  return map
}

const light = collect(lightChunks)
const dark = collect(darkChunks)

const skin = readFileSync(resolve(here, '../src/css/tokens.css'), 'utf8')
const rekeyed = new Set([...skin.matchAll(/(--dsw-[a-z0-9-]+)\s*:/g)].map((m) => m[1]))

const rows = [...light]
  .filter(([name]) => !rekeyed.has(name) && name.includes(filter))
  .sort((a, b) => a[0].localeCompare(b[0]))

console.log(`${rows.length} un-rekeyed token(s) matching "${filter || '*'}"\n`)
for (const [name, value] of rows) {
  const d = dark.get(name)
  console.log(name)
  console.log(`   light: ${value}`)
  if (d !== undefined) console.log(`   dark : ${d}`)
}
