#!/usr/bin/env node
/**
 * Prints the structural facts needed to merge the reference client bundle into
 * ours: the module-loader wrapper text, the export object, and the location of
 * its injected CSS string.
 *
 * A 1:1 port means shipping the reference implementation, not reimplementing
 * it, so the merge has to be mechanical: strip its `__ModuleLoader__.load`
 * wrapper, keep the factory body, and call that body from our own factory.
 * This tool proves the wrapper's exact shape before anything is rewritten.
 */
import { readFileSync } from 'node:fs'

const file = process.argv[2]
const src = readFileSync(file, 'utf8')

const at = src.indexOf('__ModuleLoader__')
const cssKey = src.indexOf('--dsh-claude-')
const lastReturn = src.lastIndexOf('return module.exports')

console.log('bytes', src.length)
console.log('--- head 520 ---')
console.log(JSON.stringify(src.slice(0, 520)))
console.log('--- loader offset', at, '---')
console.log(JSON.stringify(src.slice(Math.max(0, at - 120), at + 220)))
console.log('--- tail 620 ---')
console.log(JSON.stringify(src.slice(-620)))
console.log('--- last return module.exports at', lastReturn, '---')
console.log(JSON.stringify(src.slice(Math.max(0, lastReturn - 260), lastReturn + 40)))
console.log('--- first css token at', cssKey, '---')
console.log(JSON.stringify(src.slice(Math.max(0, cssKey - 200), cssKey + 200)))
console.log('--- inject occurrences', (src.match(/inject:/g) || []).length, '---')
