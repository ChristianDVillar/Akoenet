const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export function resolveImageUrl(rawUrl) {
  if (!rawUrl) return ''
  if (!rawUrl.startsWith('http')) {
    return `${baseURL}${rawUrl}`
  }
  try {
    const parsed = new URL(rawUrl)
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    if (pathParts.length >= 2) {
      const key = pathParts.slice(1).join('/')
      return `${baseURL}/uploads/${encodeURIComponent(key)}`
    }
    return rawUrl
  } catch {
    return rawUrl
  }
}
