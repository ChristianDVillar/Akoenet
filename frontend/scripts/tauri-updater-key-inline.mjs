/**
 * Tauri CLI stores updater public and private keys in `tauri.conf.json` / env as
 * standard base64 whose decoded UTF-8 is the minisign *box* string (often multiline
 * when read from `.pub` / `.key` files). Single-line values are what `tauri signer generate` prints.
 *
 * @param {string} raw
 * @returns {string}
 */
import { Buffer } from 'node:buffer'

/** GitHub / copy-paste: whole secret wrapped in "..." or '...' breaks base64 decode. */
function stripOuterQuotes(str) {
  const t = String(str ?? '').trim()
  if (t.length >= 2) {
    const a = t[0]
    const b = t[t.length - 1]
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      return t.slice(1, -1)
    }
  }
  return String(str ?? '')
}

function padBase64(s) {
  const m = s.length % 4
  if (m === 0) return s
  return s + '='.repeat(4 - m)
}

/** Minisign cleartext starts with this line; `:` does not appear in a single line of standard base64. */
function looksLikeMinisignCleartextKeyFile(s) {
  return /^untrusted comment:/m.test(s)
}

/**
 * @param {string} oneLine
 * @returns {string}
 */
function maybeUrlSafeBase64ToStandard(oneLine) {
  const t = oneLine.replace(/\s+/g, '')
  if (!t || /[+/]/.test(t)) return oneLine
  if (!/^[A-Za-z0-9_-]+=*$/.test(t)) return oneLine
  return padBase64(t.replace(/-/g, '+').replace(/_/g, '/'))
}

export function normalizeTauriUpdaterKeyMaterialForEnv(raw) {
  const s = stripOuterQuotes(String(raw ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'))
  if (!s.trim()) return ''

  const multiline = s.includes('\n')
  const looksFile = multiline || looksLikeMinisignCleartextKeyFile(s)

  if (looksFile) {
    return Buffer.from(s, 'utf8').toString('base64')
  }
  return maybeUrlSafeBase64ToStandard(s.trim().replace(/\s+/g, ''))
}
