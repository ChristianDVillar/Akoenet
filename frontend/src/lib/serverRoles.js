/** @param {Record<string, unknown> | null | undefined} member */
export function normalizedRoles(member) {
  const slugs = Array.isArray(member?.role_slugs) ? member.role_slugs : []
  if (slugs.length) {
    return slugs.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
  }
  const roles = Array.isArray(member?.roles) ? member.roles : []
  const cleaned = roles
    .map((r) => String(r || '').trim().toLowerCase())
    .filter(Boolean)
  return cleaned.length ? cleaned : ['member']
}

export const ROLE_ORDER = ['admin', 'moderator', 'streamer', 'member']
export const ROLE_OPTION_ORDER = ['admin', 'moderator', 'member', 'streamer']

export function sortServerRoleNames(names) {
  const lower = (names || []).map((n) => String(n || '').trim().toLowerCase()).filter(Boolean)
  const set = new Set(lower)
  const out = []
  for (const k of ROLE_OPTION_ORDER) {
    if (set.has(k)) out.push(k)
  }
  const rest = [...set].filter((k) => !ROLE_OPTION_ORDER.includes(k)).sort((a, b) => a.localeCompare(b))
  return [...out, ...rest]
}

/** @param {Record<string, unknown> | null | undefined} member */
export function resolveDisplayRole(member) {
  const roles = normalizedRoles(member)
  for (const key of ROLE_ORDER) {
    if (roles.includes(key)) return key
  }
  return roles[0] || 'member'
}
