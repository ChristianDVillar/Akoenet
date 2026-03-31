export const INVITE_TEMP_EXPIRY_HOURS = 24 * 7
export const INVITE_TEMP_MAX_USES_MULTI = 20

export function formatInviteExpiration(expiresAt) {
  if (!expiresAt) return 'Permanent'
  return new Date(expiresAt).toLocaleString()
}

export function formatInviteRemainingUses(invite) {
  if (invite.max_uses == null) return 'Unlimited'
  const left = Math.max(0, Number(invite.max_uses) - Number(invite.used_count || 0))
  return `${left} remaining`
}

/** One-line summary for list rows (active invites). */
export function formatInviteSummary(invite) {
  if (!invite) return ''
  const exp = invite.expires_at ? `Expires ${formatInviteExpiration(invite.expires_at)}` : 'Never expires'
  let uses
  if (invite.max_uses == null) {
    uses = 'Unlimited uses'
  } else {
    const left = Math.max(0, Number(invite.max_uses) - Number(invite.used_count || 0))
    uses = `${left} of ${invite.max_uses} uses left`
  }
  return `${exp} · ${uses}`
}

/** Human-readable policy right after creating an invite (matches API row shape). */
export function summarizeInvitePolicy(row) {
  if (!row) return ''
  if (!row.expires_at && row.max_uses == null) {
    return 'This link does not expire. Anyone with it can join until you revoke it.'
  }
  const exp = row.expires_at
    ? `Expires ${new Date(row.expires_at).toLocaleString()}.`
    : 'Does not expire.'
  const uses =
    row.max_uses == null
      ? ' Unlimited joins until you revoke it.'
      : row.max_uses === 1
        ? ' Only the first person to use it can join.'
        : ` Up to ${row.max_uses} people can join with this link.`
  return exp + uses
}

export function buildInviteCreatePayload(inviteType, singleUseTemporary) {
  return inviteType === 'temporary'
    ? {
        max_uses: singleUseTemporary ? 1 : INVITE_TEMP_MAX_USES_MULTI,
        expires_in_hours: INVITE_TEMP_EXPIRY_HOURS,
      }
    : { max_uses: null, expires_in_hours: null }
}

/**
 * Public origin for pasted invite links (prod URL). Falls back to `window.location.origin`.
 * Set `VITE_PUBLIC_ORIGIN` when the app is opened via localhost but shared links must target production.
 */
export function getInviteShareOrigin() {
  const fromEnv =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_PUBLIC_ORIGIN
      ? String(import.meta.env.VITE_PUBLIC_ORIGIN).trim()
      : ''
  const base = fromEnv || (typeof window !== 'undefined' ? window.location.origin : '')
  return String(base).replace(/\/$/, '')
}

/**
 * Parse invite token from pasted URL, raw token, or HashRouter-style `.../#/?invite=…`.
 */
export function parseInviteTokenFromInput(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  try {
    const u = value.startsWith('http')
      ? new URL(value)
      : new URL(value, 'https://invite.local')
    const fromQuery = u.searchParams.get(INVITE_QUERY_PARAM)
    if (fromQuery) return fromQuery.trim()
    if (u.hash) {
      const hash = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash
      const q = hash.indexOf('?')
      if (q !== -1) {
        const sp = new URLSearchParams(hash.slice(q + 1))
        const fromHash = sp.get(INVITE_QUERY_PARAM)
        if (fromHash) return fromHash.trim()
      }
      const pathPart = q === -1 ? hash : hash.slice(0, q)
      const segments = pathPart.split('/').filter(Boolean)
      const inviteIdx = segments.indexOf('invite')
      if (inviteIdx !== -1 && segments[inviteIdx + 1]) {
        return segments[inviteIdx + 1].split('?')[0].trim()
      }
    }
  } catch {
    /* fall through */
  }
  if (value.includes('/')) {
    const chunks = value.split('/').filter(Boolean)
    const last = chunks[chunks.length - 1] || ''
    const tok = last.split('?')[0] || ''
    if (tok) return tok
  }
  return value
}

/** Shared invite query key — do not use path-only /invite/:token for shared links (static CDN 404 without SPA rewrite). */
export const INVITE_QUERY_PARAM = 'invite'

/**
 * In-app navigation target for an invite (always `/?invite=…`, never `/invite/…`).
 */
export function inviteLandingPath(token) {
  const t = String(token ?? '').trim()
  if (!t) return '/'
  return `/?${INVITE_QUERY_PARAM}=${encodeURIComponent(t)}`
}

/**
 * Full URL to paste / share. Uses home + query so it works on static hosts (Render, etc.)
 * without `/* → /index.html`. Route `/invite/:token` remains for bookmarks after SPA load.
 */
export function inviteFullUrl(origin, token) {
  const base = String(origin || getInviteShareOrigin() || '').replace(/\/$/, '')
  const enc = encodeURIComponent(String(token ?? '').trim())
  const pathAndQuery = `/?${INVITE_QUERY_PARAM}=${enc}`
  const useHash = typeof __SPA_HASH_ROUTER__ !== 'undefined' && __SPA_HASH_ROUTER__
  return useHash ? `${base}/#${pathAndQuery}` : `${base}${pathAndQuery}`
}
