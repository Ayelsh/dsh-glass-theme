/**
 * Mints a browser-session cookie for the local dsh web server so the GUI can be
 * loaded and screenshotted headlessly.
 *
 * This does not bypass authentication so much as perform the same exchange the
 * browser performs when the user opens the URL `dsh web` prints — the token is
 * simply taken from the credential store on this machine instead of from a
 * printed URL. It is only useful on the machine that owns the secret.
 *
 *   node tools/auth-cookie.mjs [authority]
 *
 * Prints the `Cookie:` header value, and with --json prints the header plus the
 * cookie's expiry.
 */
import { readFileSync } from 'node:fs'
import { createHash, createHmac } from 'node:crypto'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

/**
 * The authority the cookie is bound to. The GUI moves ports whenever the app
 * restarts, so this is taken from LG_URL when the caller has one; the cookie is
 * authority-bound and will not authenticate any other port.
 */
const defaultAuthority = (() => {
  try {
    return new URL(process.env.LG_URL ?? 'http://127.0.0.1:50070/').host
  } catch {
    return '127.0.0.1:50070'
  }
})()
/** Accepts `--url <url>`, a bare `host:port`, or nothing (falls back to LG_URL). */
const authority = (() => {
  const i = process.argv.indexOf('--url')
  if (i >= 0 && process.argv[i + 1] !== undefined) {
    try {
      return new URL(process.argv[i + 1]).host
    } catch {
      return process.argv[i + 1]
    }
  }
  const bare = process.argv[2]
  return bare !== undefined && !bare.startsWith('--') ? bare : defaultAuthority
})()
const home = process.env.DSH_HOME ?? resolve(homedir(), '.dsh')
const yaml = readFileSync(resolve(home, '.credentials.yaml'), 'utf8')

/** The credentials file is YAML, but the one field needed is a flat key. */
const line = yaml.split(/\r?\n/).find((l) => l.trim().startsWith('secret:'))
if (line === undefined) {
  console.error('no browser-session secret found in', resolve(home, '.credentials.yaml'))
  process.exit(1)
}
const secret = Buffer.from(line.split('secret:')[1].trim(), 'base64url')
if (secret.byteLength !== 32) {
  console.error('secret is not 32 bytes:', secret.byteLength)
  process.exit(1)
}

const b64u = (buf) => Buffer.from(buf).toString('base64url')
const name = 'dsh-auth-' + createHash('sha256').update(authority).digest('base64url')

const now = Date.now()
const payload = { version: 1, authority, issuedAt: now, expiresAt: now + 60 * 60 * 1000 }
const body = b64u(Buffer.from(JSON.stringify(payload), 'utf8'))
const sig = b64u(createHmac('sha256', secret).update(body).digest())
const value = `v1.${body}.${sig}`

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ name, value, authority, expiresAt: payload.expiresAt }))
} else {
  console.log(`${name}=${value}`)
}
