import { getApiBaseUrl } from './apiBase'

const baseURL = getApiBaseUrl()

function isLocalDevStorageHost(hostname) {
  const h = String(hostname || '').toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
}

/** DB may still hold MinIO URLs from dev (e.g. http://localhost:9000/bucket/key.png). Map to current API /uploads/:key. */
function rewriteDevStorageUrlToApiUploads(s) {
  try {
    const parsed = new URL(s)
    if (!isLocalDevStorageHost(parsed.hostname)) return null
    const segments = parsed.pathname.split('/').filter(Boolean)
    const key = segments[segments.length - 1]
    if (!key || !/^[a-zA-Z0-9._-]+$/.test(key)) return null
    return `${baseURL}/uploads/${encodeURIComponent(key)}`
  } catch {
    return null
  }
}

export function resolveImageUrl(rawUrl) {
  if (!rawUrl) return ''
  const s = String(rawUrl).trim()
  if (!s.startsWith('http')) {
    const path = s.startsWith('/') ? s : `/${s}`
    return `${baseURL}${path}`
  }
  try {
    const devRewrite = rewriteDevStorageUrlToApiUploads(s)
    if (devRewrite) return devRewrite

    const parsed = new URL(s)
    const apiOrigin = new URL(baseURL).origin
    if (parsed.origin !== apiOrigin) {
      return s
    }
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    if (pathParts.length >= 2) {
      const key = pathParts.slice(1).join('/')
      return `${baseURL}/uploads/${encodeURIComponent(key)}`
    }
    return s
  } catch {
    return s
  }
}
