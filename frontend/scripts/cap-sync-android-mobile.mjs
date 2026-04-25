import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function run(cmd, args, extraEnv = {}) {
  const res = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

run('npx', ['vite', 'build'], { VITE_MOBILE_BUILD: '1' })

const releasesDir = path.join(root, 'dist', 'releases')
try {
  rmSync(releasesDir, { recursive: true, force: true })
} catch {
  // ignore
}

run('npx', ['cap', 'sync', 'android'])
