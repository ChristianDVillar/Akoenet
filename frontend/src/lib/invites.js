export function formatInviteExpiration(expiresAt) {
  if (!expiresAt) return 'Permanent'
  return new Date(expiresAt).toLocaleString()
}

export function formatInviteRemainingUses(invite) {
  if (invite.max_uses == null) return 'Unlimited'
  const left = Math.max(0, Number(invite.max_uses) - Number(invite.used_count || 0))
  return `${left} remaining`
}

export function buildInviteCreatePayload(inviteType, inviteSingleUse) {
  return inviteType === 'temporary'
    ? { max_uses: inviteSingleUse ? 1 : 20, expires_in_hours: 24 * 7 }
    : { max_uses: null, expires_in_hours: null }
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
  const base = String(origin || '').replace(/\/$/, '')
  return `${base}/?${INVITE_QUERY_PARAM}=${encodeURIComponent(token)}`
}
