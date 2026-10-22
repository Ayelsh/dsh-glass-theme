#!/usr/bin/env node
/**
 * Probe what the browser can actually reach: the Cordis service container, the
 * model slot, and the live composer controls.
 *
 * The reference implementation drives `ctx.get('modelDirectories')` and the
 * `conversation.input.model` slot from inside a plugin. Before rebuilding that
 * architecture here I need to know which of those are live in this profile —
 * `dsh-codex-subscription` may have replaced the whole model picker.
 *
 *   node tools/probe-md.mjs [--url http://127.0.0.1:57736/]
 */
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const urlIdx = argv.indexOf('--url')
const URL_BASE = urlIdx >= 0 ? argv[urlIdx + 1] : 'http://127.0.0.1:57736/'

const cookieLine = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE], {
  encoding: 'utf8',
}).trim()
const eq = cookieLine.indexOf('=')
const cookie = { name: cookieLine.slice(0, eq), value: cookieLine.slice(eq + 1) }

const browser = await launch({ headless: true, width: 1400, height: 900 })
const page = await browser.newPage()
await page.cookie({ ...cookie, domain: '127.0.0.1', path: '/' })
await page.goto(URL_BASE, { settleMs: 9000 })

const result = await page.evaluate(`(() => {
  const out = { globals: [], slots: [], composer: {} }
  for (const key of Object.keys(window)) {
    if (/dsh|module|loader|cordis/i.test(key)) out.globals.push(key)
  }
  out.loaderKeys = window.__ModuleLoader__ ? Object.keys(window.__ModuleLoader__) : null
  const slot = document.querySelector('[data-slot="conversation.input.model"]')
  out.modelSlot = slot
    ? { children: slot.children.length, first: slot.firstElementChild ? slot.firstElementChild.className : null, html: slot.innerHTML.slice(0, 300) }
    : null
  out.slots = [...document.querySelectorAll('[data-slot]')].map((e) => e.getAttribute('data-slot')).slice(0, 40)
  const trigger = document.querySelector('[class*=codexModelSelectTrigger]')
  out.composer.modelTrigger = trigger ? { cls: trigger.className, text: trigger.textContent } : null
  out.composer.dock = (() => {
    const d = document.querySelector('[data-slot="conversation.composer.dock"]')
    return d ? { children: d.children.length, text: d.textContent.slice(0, 160) } : null
  })()
  return JSON.stringify(out, null, 2)
})()`)

console.log(result)
await browser.close()
