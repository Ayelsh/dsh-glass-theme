/**
 * Print the hashed class names for one or more client modules, in a compact
 * `local => .hash_local` form, so a skin stylesheet can be authored against the
 * REAL names of the installed build (they differ from the source checkout).
 *
 *   node tools/cm.mjs InputBar ConversationRoot
 *   node tools/cm.mjs --grep bubble
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const map = JSON.parse(readFileSync(resolve(here, '../../research/shipped-class-map.json'), 'utf8'))

const args = process.argv.slice(2)
const grepAt = args.indexOf('--grep')
const needle = grepAt >= 0 ? args[grepAt + 1] : null
const modules = grepAt >= 0 ? [] : args

// map shape: { pkg: { Module: { local: hashed } } } — discover it once.
const sample = Object.values(map)[0]
const shape = sample && typeof Object.values(sample)[0] === 'object' ? 'pkg-module-map' : 'module-map'

const wanted = (pkg, mod) => {
  const hay = `${pkg} ${mod}`.toLowerCase()
  if (needle) return hay.includes(needle.toLowerCase())
  if (modules.length === 0) return true
  return modules.some((m) => mod.toLowerCase() === m.toLowerCase() || mod.toLowerCase().includes(m.toLowerCase()))
}

for (const [key, value] of Object.entries(map)) {
  if (shape === 'pkg-module-map') {
    for (const [mod, locals] of Object.entries(value)) {
      if (!wanted(key, mod)) continue
      console.log(`\n## ${mod}   (${key})`)
      for (const [local, hashed] of Object.entries(locals)) console.log(`  ${local.padEnd(30)} .${hashed}`)
    }
  } else if (wanted(key, key)) {
    console.log(`\n## ${key}`)
    for (const [local, hashed] of Object.entries(value)) console.log(`  ${local.padEnd(30)} .${hashed}`)
  }
}
