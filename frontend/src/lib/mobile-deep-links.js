import { inviteLandingPath } from './invites'

function getNormalizedPath(url) {
  const hash = String(url.hash || '')
  if (hash.startsWith('#/')) {
    const inHash = hash.slice(1)
    const qIdx = inHash.indexOf('?')
    const path = qIdx >= 0 ? inHash.slice(0, qIdx) : inHash
    const query = qIdx >= 0 ? inHash.slice(qIdx) : ''
    return { path, query }
  }
  return { path: url.pathname || '/', query: url.search || '' }
}

/**
 * Translates a native app URL into an internal SPA route.
 * Supports custom scheme (akoenet://...) and https universal links.
 */
export function resolveMobileAppUrlToRoute(rawUrl) {
  if (!rawUrl) return null
  let parsed = null
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }
  const protocol = String(parsed.protocol || '').toLowerCase()
  const host = String(parsed.host || '').toLowerCase()
  const { path, query } = getNormalizedPath(parsed)
  const params = new URLSearchParams(query || '')

  const isCustomScheme = protocol === 'akoenet:'
  const isOauthHost = isCustomScheme && (host === 'oauth' || host === 'auth')
  const isInviteHost = isCustomScheme && host === 'invite'
  const isRegisterHost = isCustomScheme && host === 'register'

  if (isInviteHost) {
    const token = path.replace(/^\/+/, '').split('/')[0]
    if (!token) return null
    return inviteLandingPath(token)
  }

  if (isRegisterHost) {
    const clean = path.replace(/^\/+/, '')
    if (clean === 'complete') {
      const token = params.get('token')
      return token ? `/register/complete?token=${encodeURIComponent(token)}` : '/register/complete'
    }
  }

  if (isOauthHost) {
    const provider = path.replace(/^\/+/, '').split('/')[0]
    if (provider === 'twitch') {
      const token = params.get('token') || params.get('twitch_token')
      const refresh = params.get('refresh_token')
      const error = params.get('error') || params.get('twitch_error')
      const out = new URLSearchParams()
      if (token) out.set('token', token)
      if (refresh) out.set('refresh_token', refresh)
      if (error) out.set('error', error)
      const q = out.toString()
      return q ? `/auth/twitch/callback?${q}` : '/auth/twitch/callback'
    }
  }

  // Generic URL support: invite path/query, register complete, oauth callback.
  if (path.startsWith('/invite/')) {
    const token = path.split('/')[2]
    return token ? inviteLandingPath(token) : null
  }
  if (params.get('invite')) {
    return inviteLandingPath(params.get('invite'))
  }
  if (path === '/register/complete') {
    const token = params.get('token')
    return token ? `/register/complete?token=${encodeURIComponent(token)}` : '/register/complete'
  }
  if (path === '/auth/twitch/callback') {
    return `/auth/twitch/callback${query || ''}`
  }

  return null
}
