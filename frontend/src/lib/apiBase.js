/**
 * Base URL for REST, Socket.IO, and image URLs.
 * VITE_API_URL overrides in dev; in production builds, a localhost value usually means a leaked
 * frontend/.env from the dev machine and would break shipped apps (desktop installers, etc.).
 */
const PRODUCTION_API_DEFAULT = 'https://akoenet-backend.onrender.com'

function stripTrailingSlash(u) {
  return String(u || '').replace(/\/$/, '')
}

function isLocalhostApiUrl(urlStr) {
  try {
    const h = new URL(urlStr).hostname.toLowerCase()
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
  } catch {
    return false
  }
}

function isTauriShell() {
  return typeof globalThis !== 'undefined' && Object.prototype.hasOwnProperty.call(globalThis, '__TAURI_INTERNALS__')
}

function preferStrictLocalApi() {
  return String(import.meta.env.VITE_API_URL_STRICT || '').trim() === 'true'
}

export function getApiBaseUrl() {
  const fromEnvRaw = import.meta.env.VITE_API_URL
  const fromEnv = fromEnvRaw != null ? stripTrailingSlash(fromEnvRaw) : ''

  let url
  if (fromEnv) {
    if (
      import.meta.env.PROD &&
      isLocalhostApiUrl(fromEnv) &&
      !preferStrictLocalApi()
    ) {
      url = PRODUCTION_API_DEFAULT
    } else {
      url = fromEnv
    }
  } else if (import.meta.env.PROD) {
    url = PRODUCTION_API_DEFAULT
  } else {
    url = 'http://localhost:3000'
  }

  // Instalable Tauri: nunca usar API en loopback salvo `tauri dev` o VITE_API_URL_STRICT (bundles mal generados).
  if (
    !import.meta.env.DEV &&
    isTauriShell() &&
    isLocalhostApiUrl(url) &&
    !preferStrictLocalApi()
  ) {
    return PRODUCTION_API_DEFAULT
  }

  return url
}
