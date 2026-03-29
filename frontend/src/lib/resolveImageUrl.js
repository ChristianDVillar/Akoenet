import { getApiBaseUrl } from './apiBase'

const baseURL = getApiBaseUrl()

export function resolveImageUrl(rawUrl) {
  if (!rawUrl) return ''
  const s = String(rawUrl).trim()
  if (!s.startsWith('http')) {
    const path = s.startsWith('/') ? s : `/${s}`
    return `${baseURL}${path}`
  }
  try {
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
