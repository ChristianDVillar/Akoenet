/**
 * Build desktop (Tauri) y copia instaladores / firmas / latest.json a public/releases/
 * para servirlos como estáticos (p. ej. Render: VITE_DESKTOP_INSTALLER_URL=/releases/...).
 *
 * Uso (desde la carpeta frontend):
 *   npm run release:desktop
 *   node scripts/release-desktop-to-public.mjs --skip-build
 *   node scripts/release-desktop-to-public.mjs --clean
 *
 * Variables opcionales:
 *   RELEASE_OUT  — ruta destino (default: frontend/public/releases)
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const destDefault = path.join(root, 'public', 'releases')

const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const clean = args.includes('--clean')

function findNsisBundleDir() {
  const underSrcTauri = path.join(root, 'src-tauri', 'target')
  const candidates = [
    path.join(underSrcTauri, 'release', 'bundle', 'nsis'),
    path.join(underSrcTauri, 'x86_64-pc-windows-msvc', 'release', 'bundle', 'nsis'),
    path.join(underSrcTauri, 'i686-pc-windows-msvc', 'release', 'bundle', 'nsis'),
  ]
  return candidates.find((p) => existsSync(p) && statSync(p).isDirectory()) ?? null
}

function copyBundleToReleases(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true })
  const names = readdirSync(srcDir)
  const copied = []
  for (const name of names) {
    const from = path.join(srcDir, name)
    if (!statSync(from).isFile()) continue
    const to = path.join(destDir, name)
    copyFileSync(from, to)
    copied.push(name)
  }
  return copied
}

function cleanOldArtifacts(destDir) {
  if (!existsSync(destDir)) return
  for (const name of readdirSync(destDir)) {
    if (name === '.gitkeep') continue
    const p = path.join(destDir, name)
    if (!statSync(p).isFile()) continue
    if (/^AkoeNet_.*\.exe$/i.test(name) || /\.sig$/i.test(name) || name === 'latest.json') {
      rmSync(p)
    }
  }
}

const dest = process.env.RELEASE_OUT?.trim() ? path.resolve(process.env.RELEASE_OUT) : destDefault

if (clean) {
  console.info(`[release] --clean: eliminando artefactos anteriores en ${dest}`)
  cleanOldArtifacts(dest)
}

if (!skipBuild) {
  console.info('[release] Ejecutando npm run tauri:build (incluye vite build via beforeBuildCommand)…')
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'tauri:build'], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  })
  if (r.status !== 0) {
    console.error('[release] tauri:build falló.')
    process.exit(r.status ?? 1)
  }
}

const nsis = findNsisBundleDir()
if (!nsis) {
  console.error(
    '[release] No se encontró el directorio bundle/nsis. Rutas probadas bajo src-tauri/target/:\n' +
      '  …/release/bundle/nsis\n' +
      '  …/x86_64-pc-windows-msvc/release/bundle/nsis\n' +
      'Ejecuta en Windows con toolchain Tauri o usa --skip-build si ya compilaste.'
  )
  process.exit(1)
}

console.info(`[release] Origen: ${nsis}`)
console.info(`[release] Destino: ${dest}`)

const copied = copyBundleToReleases(nsis, dest)
if (copied.length === 0) {
  console.error('[release] El directorio nsis no contenía ficheros.')
  process.exit(1)
}

console.info('[release] Copiado:')
for (const f of copied.sort()) console.info(`  ${f}`)
console.info('[release] Listo.')
