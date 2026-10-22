/**
 * Pull design-platform.css (the whole token vocabulary) out of the shipped
 * ui-theme client bundle, where it lives as one minified JS string literal.
 *
 *   node tools/theme-css.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const research = resolve(root, '../research')
const bundle = readFileSync(resolve(research, 'shipped/dsh-client-ui-theme.js'), 'utf8')

const tag = 'design_platform_css_default = '
const at = bundle.indexOf(tag)
if (at < 0) throw new Error('design-platform.css not found in the theme bundle')

const open = bundle.indexOf('"', at)
let i = open + 1
while (i < bundle.length) {
  if (bundle[i] === '\\') { i += 2; continue }
  if (bundle[i] === '"') break
  i += 1
}

const css = JSON.parse(bundle.slice(open, i + 1))
writeFileSync(resolve(research, 'design-platform.css'), css, 'utf8')

const names = new Set([...css.matchAll(/(--dsw-[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
const dark = css.indexOf('data-ds-dark-theme')
console.log(`${css.length} bytes, ${names.size} tokens, dark block at ${dark}`)
