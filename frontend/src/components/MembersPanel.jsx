import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
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

export default function MembersPanel({
  members,
  connectedUserIds = [],
  currentUser = null,
  onClose = null,
}) {
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
        setFriendNotice({ type: 'err', text: 'You cannot message this user.' })
      } else {
        setFriendNotice({ type: 'err', text: 'Could not open direct messages.' })
      }
    } finally {
      setDmOpenBusyId(null)
    }
  }

  async function handleAddFriend(peerId) {
    setFriendNotice(null)
    setFriendRequestBusyId(peerId)
    try {
      await api.post('/social/friends/request', { user_id: peerId })
      await refreshFriendships()
      setFriendNotice({ type: 'ok', text: 'Friend request sent.' })
    } catch (err) {
      const code = err.response?.data?.error
      if (code === 'already_exists') {
        await refreshFriendships()
        setFriendNotice({ type: 'muted', text: 'Already connected or pending.' })
      } else if (code === 'blocked') {
        setFriendNotice({ type: 'err', text: 'You cannot add this user.' })
      } else {
        setFriendNotice({ type: 'err', text: 'Could not send friend request.' })
      }
    } finally {
      setFriendRequestBusyId(null)
    }
  }

  return (
    <aside className="members-column">
      <header className="members-header">
        <span className="members-header-title" id={onClose ? 'members-drawer-title' : undefined}>
          Members
        </span>
        {onClose && (
          <button
            type="button"
            className="btn ghost small members-header-close"
            onClick={onClose}
            aria-label="Close members list"
          >
            ✕
          </button>
        )}
      </header>
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
                        <span>{member.roles?.join(', ') || 'member'}</span>
                        <span className="member-status-text">{isOnline ? 'Connected' : 'Offline'}</span>
                      </div>
                    </button>
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
                          {dmOpenBusyId === Number(member.id) ? 'Opening…' : 'Message'}
                        </button>
                        {friendLabel === 'friends' && (
                          <span className="member-friend-status">Friends</span>
                        )}
                        {friendLabel === 'pending' && (
                          <span className="member-friend-status">Request pending</span>
                        )}
                        {!friendLabel && (
                          <button
                            type="button"
                            className="btn primary small member-add-friend-btn"
                            disabled={friendRequestBusyId === Number(member.id)}
                            onClick={() => handleAddFriend(Number(member.id))}
                          >
                            {friendRequestBusyId === Number(member.id) ? 'Sending…' : 'Add friend'}
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
              <strong>No members found</strong>
              <span>Try changing filters.</span>
            </div>
          </li>
        )}
      </ul>
    </aside>
  )
}
