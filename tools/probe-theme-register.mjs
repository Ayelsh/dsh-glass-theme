/**
 * Find how the shipped theme bundle declares its built-in themes.
 *
 * The ThemePresenter writes `snapshot.active.tokens` as inline custom properties
 * on <body>, which outranks any stylesheet. So it matters enormously whether
 * `active.tokens` is (a) the whole palette or (b) empty with the palette living
 * in CSS. Print the neighbourhood of the theme-registration call.
 *
 *   node tools/probe-theme-register.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const research = resolve(here, '../../research')
const bundle = readFileSync(resolve(research, 'shipped/dsh-client-ui-theme.js'), 'utf8')

const KEYS = ['colorScheme', 'tokens:', 'register(', 'STYLES', 'DEFAULT_THEME', 'builtin']

for (const key of KEYS) {
  let from = -1
  let shown = 0
  while (shown < 3) {
    const at = bundle.indexOf(key, from + 1)
    if (at < 0) break
    from = at
    shown += 1
    console.log(`\n=== ${key} @${at} ===`)
    console.log(JSON.stringify(bundle.slice(Math.max(0, at - 300), at + 340)))
  }
  if (shown === 0) console.log(`\n=== ${key} — not found ===`)
}
