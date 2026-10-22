/**
 * Inline every src/css/*.css sheet (in manifest order) and src/catalog.js into
 * lib/client.js.
 *
 * The DSH client-module loader expects a plain script that calls
 * window.__ModuleLoader__.load({ id, factory }) — no bundler, no ESM syntax in
 * the shipped file. Authoring happens in readable .css/.js sources; this script
 * emits the single self-contained bundle the loader consumes.
 *
 * The catalog is spliced in as a BARE OBJECT EXPRESSION rather than JSON: it
 * carries regular expressions (the family matchers), which JSON cannot round
 * trip. It is written as `{ ... }` for exactly that reason.
 *
 *   node tools/build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

/** Sheet order is cascade order — later sheets win at equal specificity. */
const SHEETS = [
  ['tokens', 'tokens.css'],
  ['base', 'base.css'],
  ['shell', 'shell.css'],
  ['sidebar', 'sidebar.css'],
  ['conversation', 'conversation.css'],
  ['composer', 'composer.css'],
  ['overlays', 'overlays.css'],
  ['model', 'model.css'],
  ['picker', 'picker.css'],
  ['stats', 'stats.css'],
  ['settings-section', 'settings-section.css'],
  ['settings', 'settings.css'],
  ['pages', 'pages.css'],
  ['widgets', 'widgets.css'],
  ['motion', 'motion.css'],
]

const sheets = []
for (const [id, file] of SHEETS) {
  let css
  try {
    css = readFileSync(resolve(root, 'src/css', file), 'utf8')
  } catch {
    console.warn(`  skip ${file} (not written yet)`)
    continue
  }
  sheets.push({ id: `dsh-glass-theme/${file}`, css: css.replace(/\r\n/g, '\n').trim() + '\n' })
}

const template = readFileSync(resolve(root, 'src/client.js'), 'utf8')

/**
 * The catalog is authored as a bare object expression so its regex literals
 * survive. Strip the leading comment block, then verify it parses before
 * splicing it in — a typo in the catalog would otherwise only surface as a
 * syntax error in the browser.
 */
const catalogSource = readFileSync(resolve(root, 'src/catalog.js'), 'utf8')
  .replace(/^[\s\S]*?\*\/\s*/, '')
  .trim()
if (!catalogSource.startsWith('{') || !catalogSource.endsWith('}')) {
  console.error('catalog.js must be a bare object expression starting with { and ending with }')
  process.exit(1)
}
try {
  // eslint-disable-next-line no-new-func
  new Function(`return (${catalogSource})`)()
} catch (error) {
  console.error(`catalog.js does not parse: ${error.message}`)
  process.exit(1)
}

/**
 * The picker and the stats panel are authored as bare FUNCTION EXPRESSIONS,
 * for the same reason the catalog is a bare object: they are spliced in as
 * source text, so each must parse on its own. They are wrapped, not evaluated,
 * because they close over `require` and `ctx` at the call site.
 */
const spliceFunction = (file) => {
  const source = readFileSync(resolve(root, 'src', file), 'utf8')
    .replace(/^[\s\S]*?\*\/\s*/, '')
    .trim()
  if (!source.startsWith('function ')) {
    console.error(`${file} must be a bare function expression`)
    process.exit(1)
  }
  try {
    // eslint-disable-next-line no-new-func
    new Function(`return (${source})`)()
  } catch (error) {
    console.error(`${file} does not parse: ${error.message}`)
    process.exit(1)
  }
  return source
}

const pickerSource = spliceFunction('picker.js')
const statsSource = spliceFunction('stats.js')
const settingsSectionSource = spliceFunction('settings-section.js')

const literal = (value) => JSON.stringify(value, null, 0)

const out = template
  .replace('/*__SHEETS__*/null', () => literal(sheets))
  .replace('/*__CATALOG__*/null', () => catalogSource)
  .replace('/*__PICKER__*/null', () => pickerSource)
  .replace('/*__STATS__*/null', () => statsSource)
  .replace('/*__SETTINGS_SECTION__*/null', () => settingsSectionSource)
  .replace('/*__BUILT__*/""', () => literal(new Date().toISOString()))

mkdirSync(resolve(root, 'lib'), { recursive: true })
writeFileSync(resolve(root, 'lib/client.js'), out, 'utf8')

/**
 * Host half. The client bundle above is the only file the browser loads; the
 * host modules are plain ESM and are loaded by the app's own module loader, so
 * they are copied verbatim rather than bundled. `src/host/` is the readable
 * source; `lib/host/` is what ships.
 */
const hostDir = resolve(root, 'src/host')
const hostOut = resolve(root, 'lib/host')
let hostCount = 0
try {
  mkdirSync(hostOut, { recursive: true })
  for (const entry of readdirSync(hostDir)) {
    if (!entry.endsWith('.js')) continue
    copyFileSync(resolve(hostDir, entry), resolve(hostOut, entry))
    hostCount += 1
  }
} catch (error) {
  console.error(`host half not copied: ${error.message}`)
  process.exit(1)
}

/**
 * Static assets the host routes serve: the description table, the pricing
 * catalog, the lockup assets and the fonts. They are vendored so the package
 * is self-contained — a route that reads from another package would break the
 * moment that package is uninstalled.
 */
const vendorDir = resolve(root, 'vendor')
const libDir = resolve(root, 'lib')
let assetCount = 0
const copyTree = (from, to) => {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = resolve(from, entry.name)
    const target = resolve(to, entry.name)
    if (entry.isDirectory()) copyTree(source, target)
    else {
      copyFileSync(source, target)
      assetCount += 1
    }
  }
}
try {
  for (const file of ['model-descriptions.json', 'peakrate-catalog.json']) {
    copyFileSync(resolve(vendorDir, file), resolve(libDir, file))
    assetCount += 1
  }
  copyTree(resolve(vendorDir, 'assets'), resolve(libDir, 'assets'))
  copyTree(resolve(vendorDir, 'fonts'), resolve(libDir, 'fonts'))
} catch (error) {
  console.error(`static assets not copied: ${error.message}`)
  process.exit(1)
}

const bytes = Buffer.byteLength(out)
console.log(`built lib/client.js — ${sheets.length} sheet(s), ${(bytes / 1024).toFixed(1)} KB`)
console.log(`copied ${hostCount} host module(s), ${assetCount} asset(s)`)
for (const s of sheets) console.log(`  ${s.id.padEnd(38)} ${(Buffer.byteLength(s.css) / 1024).toFixed(1)} KB`)
