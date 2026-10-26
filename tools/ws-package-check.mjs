/**
 * Verify the published workspace bundle keeps every WorkRow open-case handler
 * explicit. This is deliberately package-level: it reads package/lib/client.js
 * from a .tgz and does not depend on the source tree or a running GUI.
 *
 *   node tools/ws-package-check.mjs [path/to/package.tgz]
 */
import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const archiveArg = process.argv[2]
const archivePath = archiveArg === undefined ? resolve(root, 'dsh-glass-theme-0.2.3.tgz') : resolve(process.cwd(), archiveArg)

const fail = (message) => {
	console.error(`FAIL ${message}`)
	process.exitCode = 1
}

if (!existsSync(archivePath)) {
	fail(`package archive not found: ${archivePath}`)
	process.exit()
}

let tar
try {
	tar = gunzipSync(readFileSync(archivePath))
} catch (error) {
	fail(`package archive is not a valid .tgz: ${archivePath} (${error?.message ?? error})`)
	process.exit()
}

const text = (buffer) => buffer.toString('utf8').replace(/\0+$/, '')
const octal = (buffer) => {
	const value = text(buffer).trim()
	if (value === '') return 0
	if (!/^[0-7]+$/.test(value)) throw new Error(`invalid tar size field: ${JSON.stringify(value)}`)
	return Number.parseInt(value, 8)
}

let clientSource = null
let sawEnd = false
try {
	if (tar.length % 512 !== 0) throw new Error(`tar payload is ${tar.length} bytes, not a 512-byte multiple`)
	for (let offset = 0; offset + 512 <= tar.length; ) {
		const header = tar.subarray(offset, offset + 512)
		if (header.every((byte) => byte === 0)) {
			sawEnd = true
			break
		}
		const name = text(header.subarray(0, 100))
		const prefix = text(header.subarray(345, 500))
		const entryName = prefix === '' ? name : `${prefix}/${name}`
		const size = octal(header.subarray(124, 136))
		const type = header[156]
		const dataStart = offset + 512
		const dataEnd = dataStart + size
		if (dataEnd > tar.length) throw new Error(`entry ${entryName || '(unnamed)'} exceeds archive bounds`)
		if ((type === 0 || type === 48) && entryName === 'package/lib/client.js') {
			clientSource = tar.subarray(dataStart, dataEnd).toString('utf8')
		}
		offset = dataStart + Math.ceil(size / 512) * 512
	}
	if (!sawEnd) throw new Error('tar end-of-archive marker is missing')
} catch (error) {
	fail(`package archive has invalid tar content: ${error?.message ?? error}`)
	process.exit()
}

if (clientSource === null) {
	fail('package archive is missing package/lib/client.js')
	process.exit()
}

/* The 0.3.3 guard watched `onOpenCase` because a bundler could collapse the
 * prop into shorthand. 0.3.4 replaced per-row action props with one inspector,
 * so the invariant moved: the shipped bundle must actually contain the
 * workbench (a stale tarball is the failure this check exists to catch). */
const required = [
	['lgwsp-workspace-shell', 'the workbench shell'],
	['lgwsp-space-rail', 'the project rail'],
	['data-sync-bugs', 'the refresh hook'],
	['lgwsp-inspector', 'the in-page detail'],
	/* 0.3.6: the detail body renders sanitized rich HTML (images, tables,
	 * markdown) instead of the old text-only reader, and the inspector
	 * backfills the full record with `tapd <kind> show <id>`. */
	['const descriptionToRichHtml', 'the rich description renderer'],
	['sanitizeRichHtml', 'the HTML sanitizer'],
	["'show'", 'the tapd detail backfill command'],
]
const missing = required.filter(([needle]) => !clientSource.includes(needle))
let failures = 0
for (const [needle, label] of missing) {
	console.error(`FAIL package/lib/client.js is missing ${label} (${needle})`)
	failures += 1
}
/* Shorthand props stay a hazard: they break when the bundle is re-minified. */
const shorthandCount = (clientSource.match(/^[ 	]+onOpenCase,[ 	]*$/gm) ?? []).length
if (shorthandCount !== 0) {
	console.error(`FAIL onOpenCase shorthand count: expected 0, got ${shorthandCount}`)
	failures += 1
}
if (failures > 0) {
	process.exitCode = 1
} else {
	console.log(`ok — package/lib/client.js carries the workbench (${required.length} markers, 0 shorthand props)`)
}
