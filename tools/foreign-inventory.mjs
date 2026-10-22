/**
 * Inventory the class names emitted by INSTALLED THIRD-PARTY plugins.
 *
 * The skin now decorates surfaces it does not own: the composer model picker is
 * rendered by dsh-codex-subscription, and the stat dialogs live beside plugin
 * pages that bring their own CSS. Their class names are plain (unhashed)
 * `.codexModelSelectOption` / `.dzp-backendRow`, so they exist in no shipped
 * inventory and tools/verify.mjs would report every one of them as a dead
 * selector.
 *
 * This script closes that gap HONESTLY: it does not allowlist arbitrary tokens,
 * it extracts the class names that are actually present in the installed
 * bundles, so a selector using a foreign class is verified against the plugin
 * that ships it. Rename a plugin class and the gate fails again.
 *
 *   node tools/foreign-inventory.mjs
 *   node tools/foreign-inventory.mjs --root <node_modules> --out <file>
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const at = args.indexOf(name)
  return at === -1 ? fallback : args[at + 1]
}

const MODULES =
  argOf('--root', null) ??
  'C:\\Users\\lenovo\\.dsh\\profiles\\desktop\\node_modules'
const OUT = resolve(root, argOf('--out', '../research/foreign-class-map.json'))

/** Packages that are the app itself or this skin — never "foreign". */
const SKIP = new Set(['dsh-glass-theme'])

if (!existsSync(MODULES)) {
  console.error(`no such module root: ${MODULES}`)
  process.exit(1)
}

/** Only bundle files carry CSS-in-JS; walking node_modules wholesale is slow. */
const bundleFiles = (pkgDir) => {
  const out = []
  const visit = (dir, depth) => {
    if (depth > 3) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(full, depth + 1)
        continue
      }
      if (!entry.name.endsWith('.js')) continue
      try {
        if (statSync(full).size > 4_000_000) continue
      } catch {
        continue
      }
      out.push(full)
    }
  }
  visit(pkgDir, 0)
  return out
}

/**
 * Class names are only meaningful when they appear in a SELECTOR, so take the
 * run of text immediately before a `{` and keep it only if it reads like a
 * selector list. That rejects property accesses in minified JS (`.BYTE`,
 * `.ALL_PROXY`) which a plain `.name` scan picks up by the thousand.
 */
const RULE_HEAD_RE = /([^{}]{1,600})\{/g
/** Anything a selector never contains; a declaration or an arrow body does. */
const NOT_SELECTOR = /[;=]|\b(function|return|const|let|var|=>)\b/
const CLASS_TOKEN_RE = /(^|[\s,>+~)])\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g

const classesIn = (text, into) => {
  for (const m of text.matchAll(RULE_HEAD_RE)) {
    const head = m[1]
    if (NOT_SELECTOR.test(head)) continue
    // A selector head must contain at least one class, id, element or attribute.
    if (!/[.#[:]/.test(head)) continue
    for (const c of head.matchAll(CLASS_TOKEN_RE)) {
      const token = c[2]
      if (token.length < 3) continue
      if (/^\d/.test(token) || token.endsWith('-')) continue
      into.add(token)
    }
  }
}

const map = {}
let pkgCount = 0

for (const name of readdirSync(MODULES)) {
  if (SKIP.has(name) || name.startsWith('.')) continue
  const pkgDir = join(MODULES, name)
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
  } catch {
    continue
  }
  // Only client-side packages can contribute DOM classes.
  if (!manifest.dsh?.client && !manifest.dsh?.bundle) continue

  const classes = new Set()
  for (const file of bundleFiles(pkgDir)) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    // Fast reject: a bundle with no `{` has no rules.
    if (!text.includes('{')) continue
    classesIn(text, classes)
  }
  if (classes.size === 0) continue
  map[name] = [...classes].sort()
  pkgCount++
  console.log(`  ${name.padEnd(30)} ${String(classes.size).padStart(5)} classes`)
}

writeFileSync(OUT, JSON.stringify(map, null, 0), 'utf8')
const total = Object.values(map).reduce((n, v) => n + v.length, 0)
console.log(`\n${pkgCount} foreign package(s), ${total} class names -> ${OUT}`)
