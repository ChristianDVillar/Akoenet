/**
 * Imprime una sola línea para pegar en `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`,
 * a partir del fichero `.pub` minisign emparejado con tu `.key` (mismo prefijo de nombre).
 *
 * Uso (desde frontend/):
 *   node scripts/print-updater-pubkey-for-tauri-conf.mjs "%USERPROFILE%\.tauri\akonet.key.pub"
 */
import { readFileSync } from 'node:fs'
import { normalizeTauriUpdaterKeyMaterialForEnv } from './tauri-updater-key-inline.mjs'

const p = process.argv[2]
if (!p?.trim()) {
  console.error(
    'Usage: node scripts/print-updater-pubkey-for-tauri-conf.mjs <path-to-key.pub>\n' +
      'Example: node scripts/print-updater-pubkey-for-tauri-conf.mjs %USERPROFILE%\\.tauri\\akonet.key.pub'
  )
  process.exit(1)
}

const raw = readFileSync(p, 'utf8')
console.log(normalizeTauriUpdaterKeyMaterialForEnv(raw))
