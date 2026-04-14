/**
 * Tauri invoca `cargo`; muchas terminales (p. ej. IDE) no tienen %USERPROFILE%\.cargo\bin en PATH
 * aunque rustup esté instalado. Anteponemos ese directorio antes de ejecutar el CLI de Tauri.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { normalizeTauriUpdaterKeyMaterialForEnv } from './tauri-updater-key-inline.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cargoBin = path.join(os.homedir(), '.cargo', 'bin')
const sep = path.delimiter
const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
const prev = process.env[pathKey] || process.env.PATH || ''
if (!prev.split(sep).some((p) => path.normalize(p) === path.normalize(cargoBin))) {
  process.env[pathKey] = `${cargoBin}${sep}${prev}`
}

const tauriJs = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
if (!existsSync(tauriJs)) {
  console.error('[tauri] Missing CLI. Run: npm install')
  process.exit(1)
}

const args = process.argv.slice(2)

/**
 * Tauri updater: pubkey en tauri.conf + createUpdaterArtifacts exigen la clave privada.
 * En Windows el CLI a veces no recibe bien solo `TAURI_SIGNING_PRIVATE_KEY_PATH`; cargamos también
 * `TAURI_SIGNING_PRIVATE_KEY` con el contenido del fichero.
 * Orden: `akonet.key` antes que `akonet-desktop.key` para que coincida con plugins.updater.pubkey actual.
 */
function ensureUpdaterPrivateKeyForBuild() {
  if (args[0] !== 'build') return

  const candidates = [
    path.join(os.homedir(), '.tauri', 'akonet.key'),
    path.join(root, '~', '.tauri', 'akonet.key'),
    path.join(os.homedir(), '.tauri', 'akonet-desktop.key'),
  ]

  const inlineSet = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY?.trim())
  const pathSet = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY_PATH?.trim())

  if (!inlineSet && !pathSet) {
    const found = candidates.find((p) => existsSync(p))
    if (!found) {
      const ciHint =
        process.env.GITHUB_ACTIONS === 'true'
          ? '\n  GitHub Actions: secreto TAURI_SIGNING_PRIVATE_KEY = contenido del `.key` (multilínea) **o** la línea base64 que imprime `tauri signer generate`. Opcional: TAURI_SIGNING_PRIVATE_KEY_PASSWORD.\n'
          : ''
      console.error(
        '[tauri] Falta la clave privada para firmar artefactos del updater (hay pubkey en tauri.conf.json).\n' +
          ciHint +
          '  Rutas que se buscan automáticamente:\n' +
          `${candidates.map((p) => `    - ${p}`).join('\n')}\n` +
          '  PowerShell (Windows: no uses ~ en -w; usa USERPROFILE):\n' +
          `    $env:TAURI_SIGNING_PRIVATE_KEY_PATH = '${path.join(os.homedir(), '.tauri', 'akonet.key')}'\n` +
          '  Generar par:\n' +
          '    $env:CI = "true"; npm run tauri signer generate -- -w "$env:USERPROFILE\\.tauri\\akonet.key" -f\n' +
          '    Copia el .pub a plugins.updater.pubkey en src-tauri/tauri.conf.json\n' +
          '  Más detalle: frontend/DESKTOP.md'
      )
      process.exit(1)
    }
    process.env.TAURI_SIGNING_PRIVATE_KEY_PATH = found
    console.info(`[tauri] Using signing key file: ${found}`)
    if (found.includes(`${path.sep}~${path.sep}`)) {
      console.info(
        '[tauri] Sugerencia: mueve la clave a %USERPROFILE%\\.tauri\\akonet.key y borra la carpeta frontend\\~\\ del repo.'
      )
    }
  }

  if (!process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
    const p = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH?.trim()
    if (!p || !existsSync(p)) {
      console.error('[tauri] TAURI_SIGNING_PRIVATE_KEY_PATH no existe o no apunta a un fichero:', p)
      process.exit(1)
    }
    try {
      const raw = readFileSync(p, 'utf8')
      process.env.TAURI_SIGNING_PRIVATE_KEY = normalizeTauriUpdaterKeyMaterialForEnv(raw)
      console.info('[tauri] Set TAURI_SIGNING_PRIVATE_KEY from file (Windows-friendly).')
    } catch (e) {
      console.error('[tauri] No se pudo leer la clave:', p, e?.message || e)
      process.exit(1)
    }
  }
}

ensureUpdaterPrivateKeyForBuild()

if (process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
  process.env.TAURI_SIGNING_PRIVATE_KEY = normalizeTauriUpdaterKeyMaterialForEnv(
    process.env.TAURI_SIGNING_PRIVATE_KEY
  )
}
// El CLI puede leer `TAURI_SIGNING_PRIVATE_KEY_PATH` directamente del disco sin el mismo
// tratamiento que `normalizeTauriUpdaterKeyMaterialForEnv` (GitHub: .key multilínea en fichero).
// Forzar solo la variable inline ya normalizada (base64 del material minisign), como espera
// `updater_signature::decode_key` → `secret_key`.
if (process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
  delete process.env.TAURI_SIGNING_PRIVATE_KEY_PATH
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.info('[tauri] TAURI_SIGNING_PRIVATE_KEY_PATH omitido; el CLI usa la clave normalizada en TAURI_SIGNING_PRIVATE_KEY.')
  }
}
// Tauri `sign_updaters` usa `std::env::var("TAURI_SIGNING_PRIVATE_KEY_PASSWORD").ok()`; si la variable
// no existe → `None` y en build local (sin `CI`) no se aplica el fallback `Some("")` del CLI. Minisign
// entonces no descifra bien claves cifradas con contraseña vacía. Un string vacío explícito fuerza
// `Some("")` (véase tests en `updater_signature.rs`). Si tu `.key` tiene contraseña real, define
// `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` en la sesión antes de `npm run tauri:build`.
{
  const raw = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
  }
}
const r = spawnSync(process.execPath, [tauriJs, ...args], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
})
process.exit(r.status ?? 1)
