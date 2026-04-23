/**
 * Copia `public/Akoenet.png` a `assets/logo.png` y genera iconos/splash Android
 * con @capacitor/assets (fuente única del logo para la APK).
 *
 * Uso (desde frontend): npm run mobile:icons
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcLogo = path.join(root, 'public', 'Akoenet.png')
const assetDir = path.join(root, 'assets')
const stagedLogo = path.join(assetDir, 'logo.png')

if (!existsSync(srcLogo)) {
  console.error(`[mobile:icons] No existe la fuente del logo: ${srcLogo}`)
  process.exit(1)
}

mkdirSync(assetDir, { recursive: true })
copyFileSync(srcLogo, stagedLogo)
console.log('[mobile:icons] Copiado public/Akoenet.png → assets/logo.png')

const assetsCli = path.join(root, 'node_modules', '@capacitor', 'assets', 'bin', 'capacitor-assets')
const args = [
  assetsCli,
  'generate',
  '--android',
  '--assetPath',
  'assets',
  '--iconBackgroundColor',
  '#FFFFFF',
  '--iconBackgroundColorDark',
  '#111111',
  '--splashBackgroundColor',
  '#FFFFFF',
  '--splashBackgroundColorDark',
  '#111111',
]

const r = spawnSync(process.execPath, args, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env },
})

if (r.status !== 0) process.exit(r.status ?? 1)
