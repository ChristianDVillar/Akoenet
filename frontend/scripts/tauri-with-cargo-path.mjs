/**
 * Tauri invoca `cargo`; muchas terminales (p. ej. IDE) no tienen %USERPROFILE%\.cargo\bin en PATH
 * aunque rustup esté instalado. Anteponemos ese directorio antes de ejecutar el CLI de Tauri.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { existsSync } from 'node:fs'
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
const r = spawnSync(process.execPath, [tauriJs, ...args], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
})
process.exit(r.status ?? 1)
