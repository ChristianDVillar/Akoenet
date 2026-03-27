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

export function inviteFullUrl(origin, token) {
  return `${origin}/invite/${token}`
}
