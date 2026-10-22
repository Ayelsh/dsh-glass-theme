/* Assert that the BUILT bundle carries the rules we authored.
 *
 * The bundle embeds each sheet as a JSON string, so every newline appears as
 * the two characters `\` + `n` and every quote as `\"`. A regex written against
 * the SOURCE text therefore misses in the bundle — not because the rule is
 * absent, but because the text is escaped. Unescape once, then assert.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const built = readFileSync(resolve(here, '..', 'lib', 'client.js'), 'utf8')
const css = built.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')

const checks = [
  ['jobs: every row line is flat',
    /\[class~='foD-wG_rowLine'\],\s*\[class~='foD-wG_rowLineLive'\]\s*\{[^}]*background-color:\s*transparent/],
  ['jobs: live row line is flat (no accent wash)',
    /\[class~='foD-wG_rowLineLive'\][^{]*\{[^}]*background-color:\s*transparent/],
  ['jobs: primary is a text column',
    /\[class~='foD-wG_primary'\]\s*\{[^}]*background-color:\s*transparent/],
  ['jobs: live command text is tinted',
    /\[class~='foD-wG_rowLineLive'\]\s+\[class~='foD-wG_label'\]\s*\{[^}]*color:/],
  ['jobs: state indicator only stops shrinking',
    /\[class~='foD-wG_rowDot'\],\s*\[class~='foD-wG_triggerDot'\]\s*\{[^}]*flex:\s*none/],
  ['jobs: shell radius is the panel radius',
    /\[class~='foD-wG_menu'\]\s*\{[^}]*border-radius:\s*var\(--lg-r-lg\)/],
  ['jobs: kind chip is an outline',
    /\[class~='foD-wG_kind'\]\s*\{[^}]*background-color:\s*transparent/],
  ['jobs: no 999px capsule survives on a row line',
    /\[class~='foD-wG_rowLine'\](?![^{]*\{[^}]*999px)/],
]

let bad = 0
for (const [name, re] of checks) {
  const ok = re.test(css)
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`)
}

/* Negative checks: things that must NOT be in the bundle. */
const forbidden = [
  ['jobs: no pill-radius row plate', /\[class~='foD-wG_rowLine'\][^{]*\{[^}]*border-radius:\s*999px/],
  ['jobs: no accent fill on a row line', /\[class~='foD-wG_rowLineLive'\][^{]*\{[^}]*--lg-accent-soft/],
]
for (const [name, re] of forbidden) {
  const ok = !re.test(css)
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`)
}

console.log(bad ? `\n${bad} assertion(s) failed` : '\nall built-bundle assertions pass')
process.exit(bad ? 1 : 0)
