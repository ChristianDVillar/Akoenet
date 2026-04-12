/**
 * Build desktop (Tauri) y copia instaladores / firmas / latest.json a public/releases/
 * para servirlos como estáticos (p. ej. Render: VITE_DESKTOP_INSTALLER_URL=/releases/...).
 *
 * Uso (desde la carpeta frontend):
 *   npm run release:desktop
 *   node scripts/release-desktop-to-public.mjs --skip-build
 *   node scripts/release-desktop-to-public.mjs --clean   (solo borra destino y sale)
 *
 * Variables opcionales:
 *   RELEASE_OUT  — ruta destino (default: frontend/public/releases)
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const tauriWithCargoPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'tauri-with-cargo-path.mjs'
)

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const destDefault = path.join(root, 'public', 'releases')

/** Nombres fijos en public/releases/ para el landing (sin bump de versión en la URL). */
const LATEST_INSTALLER_FILENAME = 'AkoeNet-Setup-latest.exe'
const SHORT_INSTALLER_ALIAS = 'akonet-desktop.exe'

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

/**
 * Solo publica la versión más nueva: borra instaladores viejos en dest y copia
 * el .exe elegido, su .sig si existe y latest.json en nsis si existe.
 */
function copyLatestNsisToReleases(srcDir, destDir, primaryExe) {
  mkdirSync(destDir, { recursive: true })
  cleanOldArtifacts(destDir)
  const toCopy = [primaryExe]
  const sigName = `${primaryExe}.sig`
  if (existsSync(path.join(srcDir, sigName))) toCopy.push(sigName)
  if (existsSync(path.join(srcDir, 'latest.json'))) toCopy.push('latest.json')
  const copied = []
  for (const name of toCopy) {
    const from = path.join(srcDir, name)
    copyFileSync(from, path.join(destDir, name))
    copied.push(name)
  }
  return copied
}

/** Semver [major, minor, patch] desde nombres tipo AkoeNet_0.7.0_x64-setup.exe */
function semverFromAkoeNetSetupName(name) {
  const m = name.match(/_(\d+)\.(\d+)\.(\d+)_/i)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function semverCmp(a, b) {
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/** Instalador NSIS con mayor versión (p. ej. varios .exe acumulados en bundle/nsis). */
function pickPrimarySetupExe(names) {
  const exes = names.filter((n) => /\.exe$/i.test(n))
  const setups = exes.filter((n) => /setup/i.test(n))
  if (setups.length === 0) return exes[0] ?? null
  if (setups.length === 1) return setups[0]
  let best = setups[0]
  let bestV = semverFromAkoeNetSetupName(best)
  for (let i = 1; i < setups.length; i++) {
    const name = setups[i]
    const v = semverFromAkoeNetSetupName(name)
    if (semverCmp(v, bestV) > 0) {
      best = name
      bestV = v
    }
  }
  return best
}

function cleanOldArtifacts(destDir) {
  if (!existsSync(destDir)) return
  for (const name of readdirSync(destDir)) {
    if (name === '.gitkeep') continue
    const p = path.join(destDir, name)
    if (!statSync(p).isFile()) continue
    if (
      /^AkoeNet_.*\.exe$/i.test(name) ||
      /^AkoeNet-Setup-latest\.exe$/i.test(name) ||
      /^akonet-desktop\.exe$/i.test(name) ||
      /\.sig$/i.test(name) ||
      name === 'latest.json'
    ) {
      rmSync(p)
    }
  }
}

const dest = process.env.RELEASE_OUT?.trim() ? path.resolve(process.env.RELEASE_OUT) : destDefault

if (clean) {
  console.info(`[release] --clean: eliminando artefactos en ${dest} y saliendo.`)
  cleanOldArtifacts(dest)
  process.exit(0)
}

if (!skipBuild) {
  console.info(
    '[release] Ejecutando tauri:build (node scripts/tauri-with-cargo-path.mjs build; incluye vite via beforeBuildCommand)…'
  )
  // Invocar el mismo entry que `npm run tauri:build`, sin `npm.cmd`, para que en Windows el prompt
  // de contraseña de firma (updater) reciba consola TTY; si falla, define TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  // o usa: npm run tauri:build && node scripts/release-desktop-to-public.mjs --skip-build
  const r = spawnSync(process.execPath, [tauriWithCargoPath, 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })
  if (r.status !== 0) {
    console.error(
      '[release] tauri:build falló.\n' +
        '  Si firmas con contraseña: exporta TAURI_SIGNING_PRIVATE_KEY_PASSWORD en esta sesión, o ejecuta:\n' +
        '    npm run tauri:build\n' +
        '    node scripts/release-desktop-to-public.mjs --skip-build'
    )
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

const nsisNames = readdirSync(nsis).filter((n) => statSync(path.join(nsis, n)).isFile())
const primary = pickPrimarySetupExe(nsisNames)
if (!primary) {
  console.error('[release] No se encontró ningún .exe de instalador en el bundle nsis.')
  process.exit(1)
}

const copied = copyLatestNsisToReleases(nsis, dest, primary)

console.info(`[release] Versión publicada (semver más alto): ${primary}`)
console.info('[release] Copiado a public/releases:')
for (const f of copied.sort()) console.info(`  ${f}`)

const latestPath = path.join(dest, LATEST_INSTALLER_FILENAME)
copyFileSync(path.join(nsis, primary), latestPath)
console.info(`[release] Alias “última versión” para el landing: ${LATEST_INSTALLER_FILENAME}`)
const shortPath = path.join(dest, SHORT_INSTALLER_ALIAS)
copyFileSync(path.join(nsis, primary), shortPath)
console.info(`[release] Alias corto (p. ej. Render): ${SHORT_INSTALLER_ALIAS}`)
console.info('[release] Listo.')
