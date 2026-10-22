/**
 * Where does the shipped app actually define its palette?
 *
 * The theme bundle ships the default ThemeDefinition.tokens; the CSS files ship
 * the static palette. Knowing which names the JS object defines tells us which
 * tokens are inline on <body> (and therefore need `!important` from a sheet).
 *
 *   node tools/probe-theme-tokens.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const research = resolve(here, '../../research')

const bundle = readFileSync(resolve(research, 'shipped/dsh-client-ui-theme.js'), 'utf8')

const quoted = [...bundle.matchAll(/"(--dsw-[a-z0-9-]+)"\s*:/g)].map((m) => m[1])
console.log(`quoted "--dsw-*" object keys in theme bundle: ${quoted.length}`)
if (quoted.length > 0) console.log('sample:', quoted.slice(0, 12).join(' '))

const at = bundle.indexOf('--dsw-alias-bg-base')
console.log('\nfirst textual occurrence of --dsw-alias-bg-base @', at)
if (at >= 0) console.log(JSON.stringify(bundle.slice(at - 500, at + 700)))

// Which token names appear at all?
const names = new Set([...bundle.matchAll(/--dsw-[a-z0-9-]+/g)].map((m) => m[0]))
console.log(`\ndistinct --dsw-* names mentioned in theme bundle: ${names.size}`)
