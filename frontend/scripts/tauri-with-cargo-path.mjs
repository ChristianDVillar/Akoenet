/**
 * Tauri invoca `cargo`; muchas terminales (p. ej. IDE) no tienen %USERPROFILE%\.cargo\bin en PATH
 * aunque rustup esté instalado. Anteponemos ese directorio antes de ejecutar el CLI de Tauri.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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
          ? '\n  GitHub Actions: añade el secreto del repo TAURI_SIGNING_PRIVATE_KEY (contenido del .key minisign, tal cual) en Settings → Secrets and variables → Actions. Opcional: TAURI_SIGNING_PRIVATE_KEY_PASSWORD.\n'
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
      const raw = readFileSync(p, 'utf8').replace(/\r\n/g, '\n').trimEnd()
      process.env.TAURI_SIGNING_PRIVATE_KEY = raw
      console.info('[tauri] Set TAURI_SIGNING_PRIVATE_KEY from file (Windows-friendly).')
    } catch (e) {
      console.error('[tauri] No se pudo leer la clave:', p, e?.message || e)
      process.exit(1)
    }
  }
}

ensureUpdaterPrivateKeyForBuild()
const r = spawnSync(process.execPath, [tauriJs, ...args], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
})
process.exit(r.status ?? 1)
