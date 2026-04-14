import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { resolveImageUrl } from '../lib/resolveImageUrl'

function normalizedRoles(member) {
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
const ROLE_OPTION_ORDER = ['admin', 'moderator', 'member', 'streamer']

function sortServerRoleNames(names) {
  const lower = (names || []).map((n) => String(n || '').trim().toLowerCase()).filter(Boolean)
  const set = new Set(lower)
  const out = []
  for (const k of ROLE_OPTION_ORDER) {
    if (set.has(k)) out.push(k)
  }
  const rest = [...set].filter((k) => !ROLE_OPTION_ORDER.includes(k)).sort((a, b) => a.localeCompare(b))
  return [...out, ...rest]
}

function resolveDisplayRole(member) {
  const roles = normalizedRoles(member)
  for (const key of ROLE_ORDER) {
    if (roles.includes(key)) return key
  }
  return roles[0] || 'member'
}

export default function MembersPanel({
  members,
  connectedUserIds = [],
  currentUser = null,
  onClose = null,
  activityByUserId = {},
  gameRanking = [],
  serverId = null,
  canManageMemberRoles = false,
  serverOwnerId = null,
  onMemberRolesUpdated = null,
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [avatarFailed, setAvatarFailed] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedMemberId, setSelectedMemberId] = useState(null)
  const [friendships, setFriendships] = useState([])
  const [friendRequestBusyId, setFriendRequestBusyId] = useState(null)
  const [dmOpenBusyId, setDmOpenBusyId] = useState(null)
  const [friendNotice, setFriendNotice] = useState(null)
  const [roleDefinitions, setRoleDefinitions] = useState([])
  const [roleBusyId, setRoleBusyId] = useState(null)
  const [roleNotice, setRoleNotice] = useState(null)
  const [roleNameBusyId, setRoleNameBusyId] = useState(null)
  const [roleNameNotice, setRoleNameNotice] = useState(null)

  const serverRoleNames = useMemo(
    () => sortServerRoleNames(roleDefinitions.map((r) => r.slug).filter(Boolean)),
    [roleDefinitions]
  )

  const roleLabels = useMemo(() => {
    const m = {}
    for (const r of roleDefinitions) {
      if (r.slug) m[r.slug] = r.name
    }
    return m
  }, [roleDefinitions])
  const connectedSet = useMemo(
    () => new Set((connectedUserIds || []).map((id) => Number(id))),
    [connectedUserIds]
  )

  const refreshFriendships = useCallback(async () => {
    try {
      const { data } = await api.get('/social/friends')
      setFriendships(Array.isArray(data) ? data : [])
    } catch {
      setFriendships([])
    }
  }, [])

  useEffect(() => {
    refreshFriendships()
  }, [refreshFriendships])

  useEffect(() => {
    if (!serverId || !canManageMemberRoles) {
      setRoleDefinitions([])
      return undefined
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.get(`/servers/${serverId}/roles`)
        const defs = (Array.isArray(data) ? data : []).map((r) => ({
          id: r.id,
          name: r.name,
          slug: String(r.slug || r.name || '')
            .trim()
            .toLowerCase(),
        }))
        if (!cancelled) setRoleDefinitions(defs)
      } catch {
        if (!cancelled) setRoleDefinitions([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [serverId, canManageMemberRoles])

  async function saveRoleDisplayName(def, rawName) {
    if (!serverId || !canManageMemberRoles) return
    const name = String(rawName || '').trim()
    if (!name || name === def.name) return
    setRoleNameNotice(null)
    setRoleNameBusyId(def.id)
    try {
      await api.patch(`/servers/${serverId}/roles/${def.id}`, { name })
      const { data } = await api.get(`/servers/${serverId}/roles`)
      setRoleDefinitions(
        (Array.isArray(data) ? data : []).map((r) => ({
          id: r.id,
          name: r.name,
          slug: String(r.slug || r.name || '')
            .trim()
            .toLowerCase(),
        }))
      )
      await onMemberRolesUpdated?.()
      setRoleNameNotice({ type: 'ok', text: t('members.roleNameSaved') })
    } catch (err) {
      const code = err.response?.data?.error
      if (code === 'role_name_taken') {
        setRoleNameNotice({ type: 'err', text: t('members.roleNameTaken') })
      } else {
        setRoleNameNotice({ type: 'err', text: t('members.roleNameErr') })
      }
    } finally {
      setRoleNameBusyId(null)
    }
  }

  const friendshipByPeerId = useMemo(() => {
    const m = new Map()
    for (const f of friendships) {
      m.set(Number(f.peer_id), f)
    }
    return m
  }, [friendships])

  const roleOptions = useMemo(() => {
    const set = new Set(['member'])
    for (const m of members || []) {
      const rs = normalizedRoles(m)
      for (const r of rs) {
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
    const titleFor = (key) =>
      roleLabels[key] || t(`members.roles.${key}`, { defaultValue: key.charAt(0).toUpperCase() + key.slice(1) })
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
  }, [filteredMembers, t, roleLabels])

  async function openDirectMessage(peerId) {
    setFriendNotice(null)
    setDmOpenBusyId(peerId)
    try {
      const { data } = await api.post('/dm/conversations', { target_user_id: peerId })
      navigate(`/messages?conversation=${encodeURIComponent(String(data.id))}`)
      onClose?.()
    } catch (err) {
      const code = err.response?.data?.error
      if (code === 'blocked' || err.response?.status === 403) {
        setFriendNotice({ type: 'err', text: t('members.errDmBlocked') })
      } else {
        setFriendNotice({ type: 'err', text: t('members.errDmOpen') })
      }
    } finally {
      setDmOpenBusyId(null)
    }
  }

  async function handleMemberRoleChange(member, nextRole) {
    if (!serverId || !canManageMemberRoles) return
    const current = resolveDisplayRole(member)
    if (String(nextRole).toLowerCase() === current) return
    setFriendNotice(null)
    setRoleNotice(null)
    setRoleBusyId(Number(member.id))
    try {
      await api.patch(`/servers/${serverId}/members/${member.id}/roles`, {
        role: String(nextRole).toLowerCase(),
      })
      await onMemberRolesUpdated?.()
      setFriendNotice({ type: 'ok', text: t('members.roleUpdated') })
    } catch (err) {
      const code = err.response?.data?.error
      if (code === 'last_admin') {
        setRoleNotice({ type: 'err', text: t('members.roleErrLastAdmin') })
      } else if (code === 'cannot_change_owner_role') {
        setRoleNotice({ type: 'err', text: t('members.roleErrOwner') })
      } else {
        setRoleNotice({ type: 'err', text: t('members.roleErrGeneric') })
      }
    } finally {
      setRoleBusyId(null)
    }
  }

  async function handleAddFriend(peerId) {
    setFriendNotice(null)
    setFriendRequestBusyId(peerId)
    try {
      await api.post('/social/friends/request', { user_id: peerId })
      await refreshFriendships()
      setFriendNotice({ type: 'ok', text: t('members.friendSent') })
    } catch (err) {
      const code = err.response?.data?.error
      if (code === 'already_exists') {
        await refreshFriendships()
        setFriendNotice({ type: 'muted', text: t('members.friendAlready') })
      } else if (code === 'blocked') {
        setFriendNotice({ type: 'err', text: t('members.errFriendBlocked') })
      } else {
        setFriendNotice({ type: 'err', text: t('members.errFriendSend') })
      }
    } finally {
      setFriendRequestBusyId(null)
    }
  }

  return (
    <aside className="members-column">
      <header className="members-header">
        <span className="members-header-title" id={onClose ? 'members-drawer-title' : undefined}>
          {t('members.title')}
        </span>
        {onClose && (
          <button
            type="button"
            className="btn ghost small members-header-close"
            onClick={onClose}
            aria-label={t('members.closeAria')}
          >
            ✕
          </button>
        )}
      </header>
      {canManageMemberRoles && serverId && roleDefinitions.length > 0 && (
        <details className="members-role-names-panel">
          <summary>{t('members.roleNamesEdit')}</summary>
          <p className="muted small members-role-names-hint">{t('members.roleNamesHint')}</p>
          {roleNameNotice && (
            <p
              className={`members-friend-notice ${
                roleNameNotice.type === 'err' ? 'members-friend-notice--err' : ''
              }`}
              role="status"
            >
              {roleNameNotice.text}
            </p>
          )}
          <ul className="members-role-name-edit-list">
            {roleDefinitions.map((def) => (
              <li key={def.id}>
                <label className="members-role-name-edit-row">
                  <span className="members-role-slug">{def.slug}</span>
                  <input
                    type="text"
                    defaultValue={def.name}
                    key={`${def.id}-${def.name}`}
                    disabled={roleNameBusyId === def.id}
                    onBlur={(e) => saveRoleDisplayName(def, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                  />
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}
      {roleNotice && (
        <p
          className={`members-friend-notice ${roleNotice.type === 'err' ? 'members-friend-notice--err' : ''}`}
          role="status"
        >
          {roleNotice.text}
        </p>
      )}
      {Array.isArray(gameRanking) && gameRanking.length > 0 && (
        <div className="members-trending" aria-label={t('members.trendingAria')}>
          <div className="members-trending-title">{t('members.trendingTitle')}</div>
          <ol className="members-trending-list">
            {gameRanking.slice(0, 5).map((row, idx) => (
              <li key={`${row.game}-${idx}`}>
                <span className="members-trending-rank">#{idx + 1}</span>
                <span className="members-trending-game">{row.game}</span>
                <span className="members-trending-count">{t('members.playingCount', { count: row.players })}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="members-filters">
        <input
          id="members-filter-query"
          name="members_filter_query"
          placeholder={t('members.searchPh')}
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
                {r === 'all'
                  ? t('members.allRoles')
                  : roleLabels[r] || t(`members.roles.${r}`, { defaultValue: r })}
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
            <option value="all">{t('members.all')}</option>
            <option value="connected">{t('members.connected')}</option>
            <option value="offline">{t('members.offline')}</option>
          </select>
        </div>
      </div>
      {friendNotice && (
        <p
          className={`members-friend-notice ${friendNotice.type === 'err' ? 'members-friend-notice--err' : ''}`}
          role="status"
        >
          {friendNotice.text}
        </p>
      )}
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
                const act = activityByUserId[member.id] ?? member.activity ?? null
                const isSelf = currentUser && Number(member.id) === Number(currentUser.id)
                const selected = selectedMemberId != null && Number(selectedMemberId) === Number(member.id)
                const link = friendshipByPeerId.get(Number(member.id))
                let friendLabel = null
                if (!isSelf && link) {
                  if (link.status === 'accepted') friendLabel = 'friends'
                  else if (link.status === 'pending') friendLabel = 'pending'
                }
                return (
                  <li
                    key={member.id}
                    className={`member-item ${selected ? 'member-item--selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="member-item-main"
                      onClick={() => {
                        setFriendNotice(null)
                        setSelectedMemberId((prev) =>
                          prev != null && Number(prev) === Number(member.id) ? null : member.id
                        )
                      }}
                    >
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
                        <span>{member.roles?.join(', ') || t('members.roleMember')}</span>
                        {act?.game ? (
                          <span className="member-game-activity">
                            {t('members.playing')} {act.game}
                            {act.platform ? ` · ${act.platform}` : ''}
                          </span>
                        ) : null}
                        <span className="member-status-text">
                          {isOnline ? t('members.statusConnected') : t('members.statusOffline')}
                        </span>
                      </div>
                    </button>
                    {selected && canManageMemberRoles && serverId && (
                      <div
                        className="member-item-actions member-item-role-row"
                        onClick={(e) => e.stopPropagation()}
                        role="presentation"
                      >
                        {serverOwnerId != null && Number(member.id) === Number(serverOwnerId) ? (
                          <p className="muted small member-owner-role-hint">{t('members.ownerRoleLocked')}</p>
                        ) : (
                          <label className="member-role-select-label">
                            <span className="member-role-select-text">{t('members.roleLabel')}</span>
                            {(() => {
                              const dr = resolveDisplayRole(member)
                              const optionNames = sortServerRoleNames(
                                [...new Set([...serverRoleNames, dr])].filter(Boolean)
                              )
                              return (
                            <select
                              className="select-inline member-role-select"
                              aria-label={t('members.roleLabel')}
                              value={dr}
                              disabled={roleBusyId === Number(member.id) || optionNames.length === 0}
                              onChange={(e) => handleMemberRoleChange(member, e.target.value)}
                            >
                              {optionNames.map((rn) => (
                                <option key={rn} value={rn}>
                                  {roleLabels[rn] ||
                                    t(`members.roles.${rn}`, {
                                      defaultValue: rn.charAt(0).toUpperCase() + rn.slice(1),
                                    })}
                                </option>
                              ))}
                            </select>
                              )
                            })()}
                          </label>
                        )}
                      </div>
                    )}
                    {selected && !isSelf && (
                      <div
                        className="member-item-actions member-item-actions--stack"
                        onClick={(e) => e.stopPropagation()}
                        role="presentation"
                      >
                        <button
                          type="button"
                          className="btn secondary small member-dm-btn"
                          disabled={dmOpenBusyId === Number(member.id)}
                          onClick={() => openDirectMessage(Number(member.id))}
                        >
                          {dmOpenBusyId === Number(member.id) ? t('members.opening') : t('members.message')}
                        </button>
                        {friendLabel === 'friends' && (
                          <span className="member-friend-status">{t('members.friends')}</span>
                        )}
                        {friendLabel === 'pending' && (
                          <span className="member-friend-status">{t('members.requestPending')}</span>
                        )}
                        {!friendLabel && (
                          <button
                            type="button"
                            className="btn primary small member-add-friend-btn"
                            disabled={friendRequestBusyId === Number(member.id)}
                            onClick={() => handleAddFriend(Number(member.id))}
                          >
                            {friendRequestBusyId === Number(member.id) ? t('members.sending') : t('members.addFriend')}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
        {filteredMembers.length === 0 && (
          <li className="member-item">
            <div className="member-meta">
              <strong>{t('members.emptyTitle')}</strong>
              <span>{t('members.emptyHint')}</span>
            </div>
          </li>
        )}
      </ul>
    </aside>
  )
}
