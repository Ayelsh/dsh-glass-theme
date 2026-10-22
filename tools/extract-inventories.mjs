#!/usr/bin/env node
/**
 * Rebuild the inventories that verify.mjs / leak.mjs / cm.mjs resolve against.
 *
 * A skin is nothing but selectors, and the shipped app's CSS-module class names
 * are generated (`_local_hash`), so every selector must be checked against the
 * classes the INSTALLED build actually emits. Those maps are derived from the
 * DeepSeek Harness install, which is why they are not committed: they contain
 * the app's own stylesheet text. Run this once after installing or upgrading
 * the app, and again whenever verify.mjs complains about a prefix.
 *
 *   node tools/extract-inventories.mjs --asar "C:/Program Files/DSH/resources/app.asar"
 *   node tools/extract-inventories.mjs                 # auto-detects a local install
 *
 * Writes ../research/{shipped/, shipped-css.txt, shipped-class-map.json,
 * shipped-class-map.txt, frontend-index.css, all-css.txt, shipped-attrs.txt}.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(here, '..')
const outDir = path.resolve(pkgRoot, '..', 'research')

const args = process.argv.slice(2)
const flag = (name) => {
	const i = args.indexOf(name)
	return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined
}

function findAsar() {
	const explicit = flag('--asar') ?? process.env.DSH_ASAR
	if (explicit) return explicit
	const candidates = [
		path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'dsh', 'resources', 'app.asar'),
		path.join(process.env.LOCALAPPDATA ?? '', 'dsh', 'resources', 'app.asar'),
		'C:/Program Files/DeepSeek Harness/resources/app.asar',
		'D:/kjProject/DSH-Harness/resources/app.asar',
	]
	return candidates.find((p) => p && fs.existsSync(p))
}

const asar = findAsar()
if (!asar || !fs.existsSync(asar)) {
	console.error('no app.asar found — pass --asar <path> or set DSH_ASAR')
	process.exit(1)
}

// ---- read the asar directory (pickle header, then packed payloads) ----------
const fd = fs.openSync(asar, 'r')
const head = Buffer.alloc(8)
fs.readSync(fd, head, 0, 8, 0)
const pickleSize = head.readUInt32LE(4)
const headerBuf = Buffer.alloc(pickleSize)
fs.readSync(fd, headerBuf, 0, pickleSize, 8)
const jsonSize = headerBuf.readUInt32LE(4)
const header = JSON.parse(headerBuf.toString('utf8', 8, 8 + jsonSize))
const baseOffset = 8 + pickleSize

const packed = []
;(function walk(node, prefix) {
	for (const [name, entry] of Object.entries(node.files || {})) {
		const p = `${prefix}/${name}`
		if (entry.files) walk(entry, p)
		else if (!entry.link && !entry.unpacked) packed.push({ path: p, size: entry.size, offset: Number(entry.offset) })
	}
})(header, '')

const read = (entry) => {
	const buf = Buffer.alloc(entry.size)
	fs.readSync(fd, buf, 0, entry.size, baseOffset + entry.offset)
	return buf.toString('utf8')
}

// ---- the shipped client bundles -------------------------------------------
const bundles = packed.filter((f) => /@deepseek-ai\/dsh-client-[^/]+\/lib\/client\.js$/.test(f.path))
if (bundles.length === 0) {
	console.error(`no @deepseek-ai/dsh-client-*/lib/client.js inside ${asar}`)
	process.exit(1)
}

const shippedDir = path.join(outDir, 'shipped')
fs.mkdirSync(shippedDir, { recursive: true })

const cssChunks = []
const classMap = {}
const attrs = new Set()

for (const entry of bundles) {
	const parts = entry.path.split('/')
	const pkg = parts[parts.length - 3]
	const src = read(entry)
	fs.writeFileSync(path.join(shippedDir, `${pkg}.js`), src)

	// 1) every `const css$N = "...."` stylesheet string
	for (const m of src.matchAll(/const\s+css(?:\$\d+)?\s*=\s*("(?:[^"\\]|\\.)*")/g)) {
		try {
			const text = JSON.parse(m[1])
			cssChunks.push(`/* ===== ${pkg} ===== */`, text)
		} catch {}
	}

	// 2) every css-module object literal: var X_module_css_default = { local: hash }
	for (const m of src.matchAll(/var\s+(\w+)_module_css_default\s*=\s*\{([\s\S]{0,20000}?)\};/g)) {
		const bucket = ((classMap[pkg] ||= {})[m[1]] ||= {})
		for (const p of m[2].matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)) bucket[p[1]] = p[2]
	}

	// 3) data-* hooks named in JS — these are attributes the bundle EMITS, which
	//    is what a `[data-…]` selector in the skin needs to resolve against.
	for (const m of src.matchAll(/data-[a-z][a-z0-9-]*/g)) attrs.add(m[0])
}

const shippedCss = cssChunks.join('\n')
for (const m of shippedCss.matchAll(/(data-[a-z][a-z0-9-]*)/g)) attrs.add(m[1])

// ---- the frontend shell's stylesheet (Vite `_local_hash_index` names) -------
const frontendCss = packed.filter((f) => /@deepseek-ai\/dsh-[^/]+\/dist\/assets\/[^/]+\.css$/.test(f.path))
const frontendChunks = frontendCss.map((entry) => read(entry))
const frontendText = frontendChunks.join('\n')
for (const m of frontendText.matchAll(/(data-[a-z][a-z0-9-]*)/g)) attrs.add(m[1])

fs.writeFileSync(path.join(outDir, 'shipped-css.txt'), shippedCss)
fs.writeFileSync(path.join(outDir, 'frontend-index.css'), frontendText)
fs.writeFileSync(path.join(outDir, 'all-css.txt'), `${shippedCss}\n${frontendText}`)
fs.writeFileSync(path.join(outDir, 'shipped-class-map.json'), JSON.stringify(classMap, null, 1))

const mapLines = []
for (const pkg of Object.keys(classMap).sort()) {
	mapLines.push(`## ${pkg}`)
	for (const mod of Object.keys(classMap[pkg]).sort()) {
		const pairs = Object.entries(classMap[pkg][mod]).sort()
		mapLines.push(`  ${mod}: ` + pairs.map(([k, v]) => `${k}=.${v}`).join(' '))
	}
}
fs.writeFileSync(path.join(outDir, 'shipped-class-map.txt'), mapLines.join('\n'))
fs.writeFileSync(path.join(outDir, 'shipped-attrs.txt'), [...attrs].sort().join('\n') + '\n')

fs.closeSync(fd)

const moduleCount = Object.values(classMap).reduce((n, mods) => n + Object.keys(mods).length, 0)
const classCount = Object.values(classMap).reduce(
	(n, mods) => n + Object.values(mods).reduce((k, bucket) => k + Object.keys(bucket).length, 0),
	0,
)
console.log(`asar      ${asar}`)
console.log(`bundles   ${bundles.length}`)
console.log(`classes   ${classCount} across ${moduleCount} css modules`)
console.log(`css       ${shippedCss.length} B shipped + ${frontendText.length} B frontend`)
console.log(`attrs     ${attrs.size}`)
console.log(`wrote     ${outDir}`)
console.log('')
console.log('next: node tools/foreign-inventory.mjs   (installed third-party plugin classes)')
console.log('then: node tools/verify.mjs')
