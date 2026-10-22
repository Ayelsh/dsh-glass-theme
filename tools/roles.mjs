// Generates the "shared idiom" selector groups from the shipped class map, so
// every settings page inherits one card/button/input/tab language without the
// stylesheet hand-listing 200 hashed names (and drifting out of date).
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const map = JSON.parse(readFileSync(resolve(here, '../../research/shipped-class-map.json'), 'utf8'))

const all = new Map()
for (const [pkg, mods] of Object.entries(map)) {
  for (const [mod, locals] of Object.entries(mods)) {
    for (const [local, hashed] of Object.entries(locals)) {
      if (!all.has(hashed)) all.set(hashed, { pkg, mod, local, hashed })
    }
  }
}

/** Role groups: the parts of the settings idiom that must look identical. */
const GROUPS = {
  card: /^(card|rowCard|setupCard|balanceCard|sectionCard|infoCard|groupCard)$/,
  button:
    /^(primaryButton|secondaryButton|dangerButton|addButton|ghostButton|linkButton|saveButton|newButton|addPrimary|confirmButton|cancelButton|emptyAction|actionButton|helpButton|creatorButton|deleteButton)$/,
  input:
    /^(input|fieldInput|selectInput|keyInput|searchField|searchInput|textarea|ruleInput|fieldValue|modelInputChoices|modelInputTypes)$/,
  head: /^(title|sectionTitle|pageTitle|pageHeading|heading|titleRow|rowHead|detailHeader|editorHeader|cardHead)$/,
  muted:
    /^(intro|desc|description|hint|hintText|help|meta|subtitle|caption|empty|emptyHint|emptyTitle|notice|accountInfo)$/,
  tab: /^(tabs|tab|tabActive|filterTab|filterTabActive|filterTabs|nav|navList|navCell|navLabel|navTitle|detailTab|detailTabs|detailTabActive)$/,
}

const out = []
/** Classes already given dedicated treatment in an earlier sheet. Re-styling
 *  them here would either fight that sheet or flatten a surface that is
 *  deliberately unlike a settings card (the composer, the transcript bubble). */
const EXCLUDE = new Set([
  'RlGAzG_card', // composer card — the app's most prominent glass, styled in composer.css
  'RlGAzG_input', // composer text field — styled in composer.css
  'GjTS2W_card', // deliverable card — styled in widgets.css
  'Dc7zOa_tabs', // conversation segmented tabs — styled in conversation.css
  'Dc7zOa_tab',
  'Dc7zOa_tabActive',
])
for (const [group, re] of Object.entries(GROUPS)) {
  const hashes = [
    ...new Set(
      [...all.values()].filter((v) => re.test(v.local) && !EXCLUDE.has(v.hashed)).map((v) => v.hashed),
    ),
  ]
  out.push(`/* ${group} — ${hashes.length} shipped classes */`)
  out.push(hashes.map((h) => `[class*='${h}']`).join(',\n'))
  out.push('')
}
writeFileSync(resolve(here, '../../gen-roles.txt'), out.join('\n'))
console.log(out.join('\n'))
