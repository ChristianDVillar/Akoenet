/**
 * Comprueba que TAG (p. ej. v0.7.3 desde GitHub Actions) coincide con
 * package.json, src-tauri/tauri.conf.json y src-tauri/Cargo.toml.
 * Uso: TAG=v0.7.3 node scripts/verify-tauri-release-version.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const tagRaw = process.env.TAG || ''
const tag = tagRaw.replace(/^v/i, '')
if (!tag) {
  console.error('Missing env TAG (e.g. v0.7.3)')
  process.exit(1)
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')).version
const cargoToml = fs.readFileSync(path.join(root, 'src-tauri', 'Cargo.toml'), 'utf8')
const cargoMatch = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)
const cargo = cargoMatch ? cargoMatch[1] : null

if (pkg !== tag) throw new Error(`package.json ${pkg} != tag ${tag}`)
if (conf !== tag) throw new Error(`tauri.conf.json ${conf} != tag ${tag}`)
if (cargo && cargo !== tag) throw new Error(`Cargo.toml ${cargo} != tag ${tag}`)

console.log('OK: versión', tag, '=', tagRaw)
