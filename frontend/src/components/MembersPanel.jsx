import { useMemo, useState } from 'react'
import { resolveImageUrl } from '../lib/resolveImageUrl'

function normalizedRoles(member) {
  const roles = Array.isArray(member?.roles) ? member.roles : []
  const cleaned = roles
    .map((r) => String(r || '').trim().toLowerCase())
    .filter(Boolean)
  return cleaned.length ? cleaned : ['member']
}

function isMemberOnline(member, connectedSet, currentUser) {
  if (currentUser && Number(member?.id) === Number(currentUser?.id)) {
    const ownStatus = String(currentUser?.presence_status || '').toLowerCase()
    if (ownStatus === 'invisible' || ownStatus === 'offline') return false
    if (ownStatus === 'online' || ownStatus === 'idle' || ownStatus === 'dnd') return true
  }
  const status = String(member?.presence_status || '').toLowerCase()
  const appearsOffline = status === 'invisible' || status === 'offline'
  if (appearsOffline) return false
  const connected = connectedSet.has(Number(member?.id))
  if (connected) return true
  return status === 'online' || status === 'idle' || status === 'dnd'
}

const ROLE_ORDER = ['admin', 'moderator', 'streamer', 'member']

function resolveDisplayRole(member) {
  const roles = normalizedRoles(member)
  for (const key of ROLE_ORDER) {
    if (roles.includes(key)) return key
  }
  return roles[0] || 'member'
}

export default function MembersPanel({ members, connectedUserIds = [], currentUser = null }) {
  const [avatarFailed, setAvatarFailed] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const connectedSet = useMemo(
    () => new Set((connectedUserIds || []).map((id) => Number(id))),
    [connectedUserIds]
  )

  const roleOptions = useMemo(() => {
    const set = new Set(['member'])
    for (const m of members || []) {
      const roles = Array.isArray(m?.roles) ? m.roles : []
      for (const r of roles) {
        if (r) set.add(String(r).toLowerCase())
      }
    }
    return ['all', ...[...set].sort((a, b) => a.localeCompare(b))]
  }, [members])

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (members || []).filter((m) => {
      const username = String(m?.username || '').toLowerCase()
      const roles = normalizedRoles(m)
      const isOnline = isMemberOnline(m, connectedSet, currentUser)
      if (q && !username.includes(q)) return false
      if (roleFilter !== 'all' && !roles.includes(roleFilter)) return false
      if (statusFilter === 'connected' && !isOnline) return false
      if (statusFilter === 'offline' && isOnline) return false
      return true
    })
  }, [members, query, roleFilter, statusFilter, connectedSet, currentUser])

  const groupedMembers = useMemo(() => {
    const sections = new Map()
    const titleFor = (key) => key.charAt(0).toUpperCase() + key.slice(1)
    for (const member of filteredMembers) {
      const key = resolveDisplayRole(member)
      if (!sections.has(key)) {
        sections.set(key, { key, title: titleFor(key), items: [] })
      }
      sections.get(key).items.push(member)
    }
    const arr = [...sections.values()]
    arr.forEach((section) => {
      section.items.sort((a, b) =>
        String(a?.username || '').localeCompare(String(b?.username || ''), undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      )
    })
    arr.sort((a, b) => {
      const ai = ROLE_ORDER.indexOf(a.key)
      const bi = ROLE_ORDER.indexOf(b.key)
      if (ai !== -1 || bi !== -1) {
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      }
      return a.title.localeCompare(b.title)
    })
    return arr
  }, [filteredMembers])

  return (
    <aside className="members-column">
      <header className="members-header">Members</header>
      <div className="members-filters">
        <input
          id="members-filter-query"
          name="members_filter_query"
          placeholder="Search member..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="members-filter-row">
          <select
            id="members-filter-role"
            name="members_filter_role"
            className="select-inline"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {r === 'all' ? 'All roles' : r}
              </option>
            ))}
          </select>
          <select
            id="members-filter-status"
            name="members_filter_status"
            className="select-inline"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="connected">Connected</option>
            <option value="offline">Offline</option>
          </select>
        </div>
      </div>
      <ul className="members-list">
        {groupedMembers.map((section) => (
          <li key={`section-${section.key}`} className="members-section">
            <div className="members-section-title">
              {section.title} — {section.items.length}
            </div>
            <ul className="members-section-list">
              {section.items.map((member) => {
                const showImg = member.avatar_url && !avatarFailed.has(member.id)
                const isOnline = isMemberOnline(member, connectedSet, currentUser)
                return (
                  <li key={member.id} className="member-item">
                    <div className="member-avatar">
                      {showImg ? (
                        <img
                          src={resolveImageUrl(member.avatar_url)}
                          alt=""
                          onError={() => {
                            setAvatarFailed((prev) => new Set(prev).add(member.id))
                          }}
                        />
                      ) : (
                        member.username?.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="member-meta">
                      <strong>
                        {member.username}
                        <span className={`member-status-dot ${isOnline ? 'online' : 'offline'}`} />
                      </strong>
                      <span>{member.roles?.join(', ') || 'member'}</span>
                      <span className="member-status-text">{isOnline ? 'Connected' : 'Offline'}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
        {filteredMembers.length === 0 && (
          <li className="member-item">
            <div className="member-meta">
              <strong>No members found</strong>
              <span>Try changing filters.</span>
            </div>
          </li>
        )}
      </ul>
    </aside>
  )
}
