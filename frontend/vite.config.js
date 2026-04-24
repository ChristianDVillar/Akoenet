import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf-8'))

/**
 * HashRouter uses only the document path `/` (plus hash), so static hosts always serve index.html.
 * Render sets RENDER=true during build; override with VITE_USE_HASH_ROUTER=false if you use a CDN rewrite /* → index.html.
 */
function resolveUseHashRouter(mode) {
  const env = loadEnv(mode, process.cwd(), '')
  if (env.VITE_USE_HASH_ROUTER === 'false') return false
  if (env.VITE_USE_HASH_ROUTER === 'true') return true
  return process.env.RENDER === 'true' || env.RENDER === 'true'
}

export default defineConfig(({ mode }) => {
  const useHashRouter = resolveUseHashRouter(mode)
  return {
  plugins: [react()],
  resolve: {
    dedupe: ['@capacitor/core', '@capacitor/app', '@capacitor/preferences'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@capacitor/')) return 'capacitor'
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __SPA_HASH_ROUTER__: useHashRouter,
  },
  server: {
    port: 5173,
    strictPort: true,
    host: 'localhost',
    proxy: {
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
    fs: {
      allow: [__dirname, path.join(__dirname, '..')],
    },
  },
  }
})
