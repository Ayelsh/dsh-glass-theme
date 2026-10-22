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
  /* Quick-provider page: the board IS the page's material, lit from inside. */
  ['quick: the board is frosted glass',
    /\.lg-settings-board\s*\{[^}]*backdrop-filter:\s*blur\(24px\)\s*saturate\(185%\)/],
  ['quick: the board carries a specular rim',
    /\.lg-settings-board\s*\{[^}]*inset 0 0\.5px 0 rgba\(255, 255, 255, 0\.95\)/],
  ['quick: the light field refracts through the pane',
    /\.lg-settings-glow\s*\{[^}]*filter:\s*blur\(18px\)\s*saturate\(130%\)/],
  ['quick: the glow is positioned, never layout',
    /\.lg-settings-glow\s*\{[^}]*position:\s*absolute[^}]*pointer-events:\s*none/],
  ['quick: frosted grain is etched into the pane',
    /\.lg-settings-board::after\s*\{[^}]*feTurbulence[^}]*opacity:\s*var\(--lg-grain-opacity\)[^}]*mix-blend-mode:\s*overlay/],
  ['quick: grain stops when transparency is reduced',
    /prefers-reduced-transparency:\s*reduce\)\s*\{[^@]*?\.lg-settings-board::after\s*\{[^}]*display:\s*none/],
  ['quick: rows travel on translate, not transform',
    /@keyframes lg-settings-row-in\s*\{\s*from\s*\{[^}]*translate: 0 6px;/],
  ['quick: rows end at rest, untransformed',
    /@keyframes lg-settings-row-in\s*\{[\s\S]*?to\s*\{[^}]*translate: 0 0;/],
  ['quick: the meter is a picture, not a control',
    /className: 'lg-settings-meter'[\s\S]{0,400}role: 'img'[\s\S]{0,200}'已选 '/],
  ['quick: the switch keeps iOS proportions',
    /\.lg-settings-switch\s*\{[^}]*width:\s*34px[^}]*height:\s*20px/],
  ['quick: the knob lands without motion too',
    /prefers-reduced-motion:\s*reduce\)\s*\{[^@]*?\.lg-settings-switch\[data-on='true'\]\s+\.lg-settings-knob\s*\{[^}]*translateX\(14px\)/],
  /* Usage pill: right edge rides the input box's right edge. */
  ['stats: the dock row is stretched and end-aligned',
    /html\[data-lg-stats\]\s+\[data-composer-dock\]\s*\{[^}]*width:\s*100%[^}]*justify-content:\s*flex-end/],
  ['stats: the gap rides the seat, not the dock',
    /marginInlineEnd = Math\.max\(0, Math\.round\(inset\)\)/],
  ['stats: the card is re-found, never cached',
    /const findCard = \(\) =>\s*\n\s*Array\.prototype\.find\.call\(\s*\n\s*dock\.parentElement\.children,?\s*\n?\s*\(el\) => el !== dock && el\.querySelector\('textarea, \[contenteditable=true\]'\)/],
  ['stats: the panel hangs off the trigger right edge',
    /let left = a\.right - panelWidth;/],
  ['stats: the panel is measured at layout size, not animated size',
    /const panelWidth = panel\.offsetWidth;/],
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
