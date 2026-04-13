/**
 * Tauri CLI stores updater public and private keys in `tauri.conf.json` / env as
 * standard base64 whose decoded UTF-8 is the minisign *box* string (often multiline
 * when read from `.pub` / `.key` files). Single-line values are what `tauri signer generate` prints.
 *
 * @param {string} raw
 * @returns {string}
 */
import { Buffer } from 'node:buffer'

export function normalizeTauriUpdaterKeyMaterialForEnv(raw) {
  const s = String(raw ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!s.trim()) return ''
  const multiline = s.includes('\n')
  const looksLikeMinisignKeyFile = s.includes('untrusted comment:')
  if (multiline || looksLikeMinisignKeyFile) {
    return Buffer.from(s, 'utf8').toString('base64')
  }
  return s.trim().replace(/\s+/g, '')
}
