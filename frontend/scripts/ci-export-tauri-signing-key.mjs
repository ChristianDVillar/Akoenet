/**
 * GitHub Actions: escribe `TAURI_SIGNING_PRIVATE_KEY` en `GITHUB_ENV` ya normalizada
 * (misma lógica que `tauri-updater-key-inline.mjs`), para que `tauri build` → `sign_updaters`
 * reciba exactamente el base64 que espera el CLI. Sin depender de PATH a un .key en bruto.
 *
 * Requiere: `KEY` o `TAURI_SIGNING_PRIVATE_KEY` en el entorno, y `GITHUB_ENV`.
 */
import { appendFileSync } from 'node:fs'
import { normalizeTauriUpdaterKeyMaterialForEnv } from './tauri-updater-key-inline.mjs'

const raw = process.env.KEY ?? process.env.TAURI_SIGNING_PRIVATE_KEY
if (!raw?.trim()) {
  console.error('[ci-export-tauri-signing-key] Falta KEY o TAURI_SIGNING_PRIVATE_KEY.')
  process.exit(1)
}
const gh = process.env.GITHUB_ENV
if (!gh?.trim()) {
  console.error('[ci-export-tauri-signing-key] GITHUB_ENV no está definido (ejecutar solo en Actions).')
  process.exit(1)
}
const norm = normalizeTauriUpdaterKeyMaterialForEnv(raw)
if (!norm) {
  console.error('[ci-export-tauri-signing-key] La clave normalizada quedó vacía.')
  process.exit(1)
}
const delim = '_TAURI_SIGNING_KEY_EOF_'
appendFileSync(gh, `TAURI_SIGNING_PRIVATE_KEY<<${delim}\n${norm}\n${delim}\n`)
console.info('[ci-export-tauri-signing-key] TAURI_SIGNING_PRIVATE_KEY escrito en GITHUB_ENV (normalizado).')
