import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { getSocket } from '../services/socket'
import { useAuth } from '../context/AuthContext'
import ServerSidebar from '../components/ServerSidebar'
import ChannelList from '../components/ChannelList'
import Chat from '../components/Chat'
import MembersPanel from '../components/MembersPanel'
import UserSettingsModal from '../components/UserSettingsModal'
import ServerSettingsModal from '../components/ServerSettingsModal'
import ChannelSettingsModal from '../components/ChannelSettingsModal'
import AppChrome from '../components/AppChrome'
import { useDesktopGameActivity } from '../hooks/useDesktopGameActivity'

function normalizeVoicePresencePayload(presence) {
  if (!presence || typeof presence !== 'object') return {}
  const out = {}
  Object.keys(presence).forEach((k) => {
    const v = presence[k]
    out[String(k)] = Array.isArray(v) ? v : []
  })
  return out
}

function collapsedCategoryStorageKey(serverId) {
  return `akoenet_collapsed_${serverId}`
}

function collapsedCategoryLegacyKeys(serverId) {
  return [`Akonet_collapsed_${serverId}`, `akonet_collapsed_${serverId}`, `akoe:collapsed:${serverId}`]
}

const MEMBERS_INLINE_MEDIA = '(min-width: 1201px)'

function subscribeMembersInlineMedia(onChange) {
  const mq = window.matchMedia(MEMBERS_INLINE_MEDIA)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function getMembersInlineMediaSnapshot() {
  return window.matchMedia(MEMBERS_INLINE_MEDIA).matches
}

function useShowInlineMembersPanel() {
  return useSyncExternalStore(
    subscribeMembersInlineMedia,
    getMembersInlineMediaSnapshot,
    () => true
  )
}

export default function ServerView() {
  const { serverId } = useParams()
  const id = parseInt(serverId, 10)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, logout, updateCurrentUser } = useAuth()
  const [servers, setServers] = useState([])
  const [channels, setChannels] = useState([])
  const [categories, setCategories] = useState([])
  const [members, setMembers] = useState([])
  const [banStatus, setBanStatus] = useState(null)
  const [activeChannelId, setActiveChannelId] = useState(null)
  const [serverName, setServerName] = useState('')
  const [toast, setToast] = useState(null)
  const [channelPermissions, setChannelPermissions] = useState([])
  const [userPermissions, setUserPermissions] = useState([])
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState([])
  const [userSettingsOpen, setUserSettingsOpen] = useState(false)
  const [userSettingsSection, setUserSettingsSection] = useState('profile')
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false)
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false)
  const [membersDrawerOpen, setMembersDrawerOpen] = useState(false)
  const showInlineMembersPanel = useShowInlineMembersPanel()
  const membersAutoCloseTimerRef = useRef(null)

  const clearMembersAutoCloseTimer = useCallback(() => {
    if (membersAutoCloseTimerRef.current != null) {
      clearTimeout(membersAutoCloseTimerRef.current)
      membersAutoCloseTimerRef.current = null
    }
  }, [])

  const closeMembersPanel = useCallback(() => {
    clearMembersAutoCloseTimer()
    setMembersDrawerOpen(false)
  }, [clearMembersAutoCloseTimer])

  const openMembersPanel = useCallback(() => {
    clearMembersAutoCloseTimer()
    setMembersDrawerOpen(true)
  }, [clearMembersAutoCloseTimer])
  const [emojis, setEmojis] = useState([])
  const [voicePresence, setVoicePresence] = useState({})
  const [connectedUserIds, setConnectedUserIds] = useState([])
  const [activityRealtime, setActivityRealtime] = useState({})
  const [gameRanking, setGameRanking] = useState([])

  const activityFromMembers = useMemo(() => {
    const o = {}
    for (const m of members) {
      o[m.id] = m.activity ?? null
    }
    return o
  }, [members])

  const activityByUserId = useMemo(
    () => ({ ...activityFromMembers, ...activityRealtime }),
    [activityFromMembers, activityRealtime]
  )
  /** Voice channel id kept while user reads text channels (stay connected). Cleared on leave / server change. */
  const [voicePersistChannelId, setVoicePersistChannelId] = useState(null)
  /** Stops HTTP voice-presence polling after 404 (old API / wrong base URL) to avoid console spam */
  const voicePresencePollStopped404 = useRef(false)
  /** Avoid re-applying `?channel=` from the URL on every searchParams change after first apply. */
  const appliedChannelFromQuery = useRef(false)

  const rtcVoiceChannelId = useMemo(() => {
    const active = channels.find((c) => c.id === activeChannelId)
    if (active?.type === 'voice') return activeChannelId
    return voicePersistChannelId
  }, [channels, activeChannelId, voicePersistChannelId])

  const rtcVoiceChannelMeta = useMemo(() => {
    if (rtcVoiceChannelId == null) return null
    return channels.find((c) => c.id === rtcVoiceChannelId) || null
  }, [channels, rtcVoiceChannelId])

  useDesktopGameActivity(user)

  const rtcVoiceConnectedCount = useMemo(() => {
    if (rtcVoiceChannelId == null) return undefined
    const raw = voicePresence[String(rtcVoiceChannelId)] ?? voicePresence[rtcVoiceChannelId]
    return Array.isArray(raw) ? raw.length : undefined
  }, [voicePresence, rtcVoiceChannelId])

  const handleVoiceSessionChange = useCallback(({ joined, channelId: cid }) => {
    setVoicePersistChannelId(joined && cid != null ? Number(cid) : null)
  }, [])

  useEffect(() => {
    setVoicePersistChannelId(null)
  }, [id])

  useEffect(() => {
    appliedChannelFromQuery.current = false
  }, [id])

  useEffect(() => {
    if (appliedChannelFromQuery.current || !channels.length) return
    const raw = searchParams.get('channel')
    if (!raw) return
    const cid = parseInt(raw, 10)
    if (Number.isNaN(cid)) return
    if (!channels.some((c) => c.id === cid)) return
    setActiveChannelId(cid)
    appliedChannelFromQuery.current = true
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('channel')
        return next
      },
      { replace: true }
    )
  }, [channels, searchParams, setSearchParams])

  useEffect(() => {
    if (Number.isNaN(id)) {
      navigate('/')
      return
    }
    ;(async () => {
      try {
        setBanStatus(null)
        const { data } = await api.get('/servers')
        setServers(data)
        const current = data.find((s) => s.id === id)
        if (!current) {
          try {
            await api.get(`/servers/${id}/ban-status`)
            navigate('/')
            return
          } catch (e) {
            if (e?.response?.status === 403 && e?.response?.data?.banned) {
              setBanStatus(e.response.data)
              return
            }
            navigate('/')
            return
          }
        }
        setServerName(current.name)
      } catch {
        navigate('/')
      }
    })()
  }, [id, navigate])

  useEffect(() => {
    if (Number.isNaN(id)) return
    setActiveChannelId(null)
    setBanStatus(null)
    ;(async () => {
      try {
        const [{ data: channelData }, { data: categoriesData }, { data: membersData }] =
          await Promise.all([
            api.get(`/channels/server/${id}`),
            api.get(`/channels/server/${id}/categories`),
            api.get(`/servers/${id}/members`),
          ])
        setChannels(channelData)
        setCategories(categoriesData)
        setMembers(membersData)
        setActiveChannelId(channelData[0]?.id ?? null)
        const { data: emojiData } = await api.get(`/servers/${id}/emojis`)
        setEmojis(emojiData)
      } catch (e) {
        if (e?.response?.status === 403) {
          try {
            await api.get(`/servers/${id}/ban-status`)
            navigate('/')
            return
          } catch (banErr) {
            if (banErr?.response?.status === 403 && banErr?.response?.data?.banned) {
              setBanStatus(banErr.response.data)
              return
            }
          }
        }
        navigate('/')
      }
    })()
  }, [id, navigate])

  useEffect(() => {
    setActivityRealtime({})
  }, [id, members])

  useLayoutEffect(() => {
    const s = getSocket()
    if (!s || Number.isNaN(id)) return undefined
    setVoicePresence({})
    setConnectedUserIds([])
    setGameRanking([])

    const onSnap = ({ serverId, presence }) => {
      if (serverId !== id) return
      setVoicePresence(normalizeVoicePresencePayload(presence))
    }
    const onServerPresenceSnapshot = ({ serverId, connectedUserIds: ids }) => {
      if (serverId !== id) return
      setConnectedUserIds(Array.isArray(ids) ? ids : [])
    }
    const onServerPresenceUpdate = ({ serverId, connectedUserIds: ids }) => {
      if (serverId !== id) return
      setConnectedUserIds(Array.isArray(ids) ? ids : [])
    }
    const onPresence = ({ channelId, participants }) => {
      if (channelId == null) return
      const key = String(channelId)
      setVoicePresence((prev) => ({ ...prev, [key]: participants || [] }))
    }

    const onGameSnap = ({ serverId, entries, ranking }) => {
      if (serverId !== id) return
      const o = {}
      for (const e of entries || []) {
        o[e.userId] = e.activity ?? null
      }
      setActivityRealtime(o)
      if (Array.isArray(ranking)) setGameRanking(ranking)
    }
    const onGame = ({ serverId, userId, activity }) => {
      if (serverId !== id) return
      setActivityRealtime((p) => ({ ...p, [userId]: activity ?? null }))
    }
    const onRanking = ({ serverId, top }) => {
      if (serverId !== id) return
      setGameRanking(Array.isArray(top) ? top : [])
    }

    const joinSrv = () => {
      s.emit('join_server', id)
    }

    s.on('voice:presence_snapshot', onSnap)
    s.on('server:presence_snapshot', onServerPresenceSnapshot)
    s.on('server:presence_update', onServerPresenceUpdate)
    s.on('voice:presence', onPresence)
    s.on('server:game_activity_snapshot', onGameSnap)
    s.on('server:game_activity', onGame)
    s.on('server:game_ranking', onRanking)
    s.on('connect', joinSrv)
    if (s.connected) joinSrv()

    return () => {
      s.off('voice:presence_snapshot', onSnap)
      s.off('server:presence_snapshot', onServerPresenceSnapshot)
      s.off('server:presence_update', onServerPresenceUpdate)
      s.off('voice:presence', onPresence)
      s.off('server:game_activity_snapshot', onGameSnap)
      s.off('server:game_activity', onGame)
      s.off('server:game_ranking', onRanking)
      s.off('connect', joinSrv)
      s.emit('leave_server', id)
    }
  }, [id])

  useEffect(() => {
    if (Number.isNaN(id)) return undefined
    voicePresencePollStopped404.current = false
    let cancelled = false
    let intervalId = null
    async function fetchVoicePresence() {
      if (voicePresencePollStopped404.current) return
      try {
        const { data } = await api.get(`/servers/${id}/voice-presence`)
        if (cancelled) return
        setVoicePresence(normalizeVoicePresencePayload(data))
      } catch (e) {
        if (!cancelled && e?.response?.status === 404) {
          voicePresencePollStopped404.current = true
          if (intervalId != null) window.clearInterval(intervalId)
        }
        /* other errors ignored — socket may still update */
      }
    }
    ;(async () => {
      await fetchVoicePresence()
      if (cancelled || voicePresencePollStopped404.current) return
      intervalId = window.setInterval(fetchVoicePresence, 5000)
    })()
    return () => {
      cancelled = true
      if (intervalId != null) window.clearInterval(intervalId)
    }
  }, [id])

  useEffect(() => {
    const s = getSocket()
    if (!s) return
    let hide
    const onNote = (payload) => {
      if (payload.channelId === activeChannelId) return
      setToast({ ...payload, at: Date.now() })
      window.clearTimeout(hide)
      hide = window.setTimeout(() => setToast(null), 4500)
    }
    s.on('echonet_notification', onNote)
    return () => {
      s.off('echonet_notification', onNote)
      window.clearTimeout(hide)
    }
  }, [activeChannelId])

  async function createChannel({ name, type, categoryId, isPrivate }) {
    if (!name?.trim() || Number.isNaN(id)) return
    await api.post('/channels', {
      name: name.trim(),
      server_id: id,
      type,
      category_id: categoryId != null ? Number(categoryId) : null,
      is_private: Boolean(isPrivate),
    })
    const { data } = await api.get(`/channels/server/${id}`)
    setChannels(data)
  }

  async function updateChannel(channelId, payload) {
    if (!channelId) return
    await api.put(`/channels/${channelId}`, payload)
    const { data } = await api.get(`/channels/server/${id}`)
    setChannels(data)
  }

  async function createCategory({ name }) {
    if (!name?.trim() || Number.isNaN(id)) return
    await api.post('/channels/categories', {
      server_id: id,
      name: name.trim(),
    })
    const { data } = await api.get(`/channels/server/${id}/categories`)
    setCategories(data)
  }

  async function deleteCategory(categoryId) {
    if (!window.confirm('Delete this category? Its channels will become uncategorized.')) return
    try {
      await api.delete(`/channels/categories/${categoryId}`)
    } catch (err) {
      if (err.response?.status !== 404) {
        setToast({
          username: 'System',
          snippet: 'Could not delete category',
          at: Date.now(),
        })
        return
      }
    }

    const [{ data: categoriesData }, { data: channelsData }] = await Promise.all([
      api.get(`/channels/server/${id}/categories`),
      api.get(`/channels/server/${id}`),
    ])
    setCategories(categoriesData)
    setChannels(channelsData)
    setCollapsedCategories((prev) => {
      const next = prev.filter((cid) => cid !== categoryId)
      localStorage.setItem(collapsedCategoryStorageKey(id), JSON.stringify(next))
      return next
    })
  }

  async function deleteChannel(channelId) {
    if (!window.confirm('Delete this channel?')) return
    await api.delete(`/channels/${channelId}`)
    const { data } = await api.get(`/channels/server/${id}`)
    setChannels(data)
    if (activeChannelId === channelId) {
      setActiveChannelId(data[0]?.id ?? null)
    }
  }

  async function moveChannel(channelId, targetChannelId, targetCategoryId) {
    if (!id) return
    await api.post('/channels/reorder', {
      server_id: id,
      channel_id: channelId,
      target_channel_id: targetChannelId,
      target_category_id: targetCategoryId,
    })
    const { data } = await api.get(`/channels/server/${id}`)
    setChannels(data)
  }

  async function moveCategory(categoryId, targetCategoryId) {
    if (!id) return
    await api.post('/channels/categories/reorder', {
      server_id: id,
      category_id: categoryId,
      target_category_id: targetCategoryId,
    })
    const { data } = await api.get(`/channels/server/${id}/categories`)
    setCategories(data)
  }

  useEffect(() => {
    if (!activeChannelId) {
      setChannelPermissions([])
      setUserPermissions([])
      return
    }
    ;(async () => {
      const [{ data: roleData }, { data: userData }] = await Promise.all([
        api.get(`/channels/${activeChannelId}/permissions`),
        api.get(`/channels/${activeChannelId}/user-permissions`),
      ])
      setChannelPermissions(roleData)
      setUserPermissions(userData)
    })().catch(() => {
      setChannelPermissions([])
      setUserPermissions([])
    })
  }, [activeChannelId])

  async function togglePermission(roleId, next) {
    if (!activeChannelId) return
    const payload = {
      role_id: roleId,
      can_view: Boolean(next.can_view),
      can_send: Boolean(next.can_send),
      can_connect: Boolean(next.can_connect),
    }
    await api.put(`/channels/${activeChannelId}/permissions`, payload)
    setChannelPermissions((prev) =>
      prev.map((r) => (r.id === roleId ? { ...r, ...payload } : r))
    )
  }

  async function toggleUserPermission(userId, next) {
    if (!activeChannelId) return
    const payload = {
      can_view: Boolean(next.can_view),
      can_send: Boolean(next.can_send),
      can_connect: Boolean(next.can_connect),
    }
    await api.put(`/channels/${activeChannelId}/user-permissions/${userId}`, payload)
    const user = members.find((m) => m.id === userId)
    setUserPermissions((prev) => {
      const exists = prev.some((p) => p.user_id === userId)
      if (exists) {
        return prev.map((p) => (p.user_id === userId ? { ...p, ...payload } : p))
      }
      return [...prev, { user_id: userId, username: user?.username || `user_${userId}`, ...payload }]
    })
  }

  async function setAppearOnline(nextOnline) {
    const previousPresence =
      String(user?.presence_status || '').toLowerCase() === 'invisible' ? 'invisible' : 'online'
    try {
      const nextPresence = nextOnline ? 'online' : 'invisible'
      updateCurrentUser?.({ presence_status: nextPresence })
      await api.patch('/auth/me', {
        presence_status: nextPresence,
      })
      setMembers((prev) =>
        prev.map((m) =>
          Number(m.id) === Number(user?.id)
            ? { ...m, presence_status: nextPresence }
            : m
        )
      )
      try {
        const { data: membersData } = await api.get(`/servers/${id}/members`)
        setMembers(membersData)
      } catch {
        /* keep local optimistic value if fetch fails */
      }
    } catch {
      updateCurrentUser?.({ presence_status: previousPresence })
      setToast({
        username: 'System',
        snippet: 'Could not update your online status',
        at: Date.now(),
      })
    }
  }

  useEffect(() => {
    if (!id) return
    const key = collapsedCategoryStorageKey(id)
    try {
      let raw = localStorage.getItem(key)
      if (!raw) {
        for (const lk of collapsedCategoryLegacyKeys(id)) {
          raw = localStorage.getItem(lk)
          if (raw) break
        }
      }
      const parsed = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) setCollapsedCategories(parsed)
    } catch {
      setCollapsedCategories([])
    }
  }, [id])

  useEffect(() => {
    if (showInlineMembersPanel) closeMembersPanel()
  }, [showInlineMembersPanel, closeMembersPanel])

  useEffect(() => {
    return () => clearMembersAutoCloseTimer()
  }, [clearMembersAutoCloseTimer])

  useEffect(() => {
    if (!membersDrawerOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeMembersPanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [membersDrawerOpen, closeMembersPanel])

  useEffect(() => {
    if (!membersDrawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [membersDrawerOpen])

  function toggleCategoryCollapse(categoryId) {
    setCollapsedCategories((prev) => {
      const next = prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
      localStorage.setItem(collapsedCategoryStorageKey(id), JSON.stringify(next))
      return next
    })
  }

  if (Number.isNaN(id)) return null

  const activeChannel = channels.find((c) => c.id === activeChannelId)

  if (banStatus?.banned) {
    return (
      <AppChrome>
        <section className="card" style={{ maxWidth: 680, margin: '2rem auto' }}>
          <h2>Banned from this server</h2>
          <p className="muted">
            You cannot access this server while the ban is active.
          </p>
          {banStatus.reason ? (
            <p>
              <strong>Reason:</strong> {banStatus.reason}
            </p>
          ) : null}
          {banStatus.expires_at ? (
            <p>
              <strong>Expires:</strong> {new Date(banStatus.expires_at).toLocaleString()}
            </p>
          ) : (
            <p>
              <strong>Duration:</strong> Permanent
            </p>
          )}
          <div style={{ marginTop: '1rem' }}>
            <button type="button" className="btn secondary" onClick={() => navigate('/')}>
              Back to home
            </button>
          </div>
        </section>
      </AppChrome>
    )
  }

  return (
    <AppChrome>
      <>
        <div className="app-shell">
          <ServerSidebar
            servers={servers}
            activeServerId={id}
            onSelectServer={(sid) => navigate(`/server/${sid}`)}
            homeAction={() => navigate('/')}
            messagesAction={() => navigate('/messages')}
          />
          <ChannelList
            serverName={serverName}
            categories={categories}
            channels={channels}
            activeChannelId={activeChannelId}
            onSelectChannel={setActiveChannelId}
            onCreateChannel={createChannel}
            onCreateCategory={createCategory}
            onDeleteCategory={deleteCategory}
            onDeleteChannel={deleteChannel}
            onMoveChannel={moveChannel}
            onMoveCategory={moveCategory}
            collapsedCategories={collapsedCategories}
            onToggleCategory={toggleCategoryCollapse}
            user={user}
            onLogout={logout}
            onOpenUserSettings={() => {
              setUserSettingsSection('profile')
              setUserSettingsOpen(true)
            }}
            onOpenServerSettings={() => setServerSettingsOpen(true)}
            onOpenAdminDashboard={() => navigate('/admin')}
            onSetAppearOnline={setAppearOnline}
            schedulerStreamerUsername={import.meta.env.VITE_SCHEDULER_STREAMER_USERNAME}
            voicePresence={voicePresence}
          />
          <Chat
            channelId={activeChannelId}
            channelName={activeChannel?.name}
            channelType={activeChannel?.type}
            user={user}
            members={members}
            emojis={emojis}
            voiceUserLimit={rtcVoiceChannelMeta?.voice_user_limit}
            voiceConnectedCount={rtcVoiceConnectedCount}
            onVoiceSessionChange={handleVoiceSessionChange}
            rtcVoiceChannelId={rtcVoiceChannelId}
            rtcVoiceChannelName={rtcVoiceChannelMeta?.name}
            onOpenChannelSettings={() => setChannelSettingsOpen(true)}
            onOpenMembersPanel={showInlineMembersPanel ? undefined : openMembersPanel}
            membersCount={members.length}
          />
          {showInlineMembersPanel && (
            <div className="right-column">
              <MembersPanel
                members={members}
                connectedUserIds={connectedUserIds}
                currentUser={user}
                activityByUserId={activityByUserId}
                gameRanking={gameRanking}
              />
            </div>
          )}
        </div>

        {!showInlineMembersPanel &&
          membersDrawerOpen &&
          createPortal(
            <div
              className="members-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="members-drawer-title"
            >
              <div
                className="members-drawer-backdrop"
                role="presentation"
                onClick={closeMembersPanel}
              />
              <div className="members-drawer-panel">
                <p className="members-drawer-hint muted small">
                  Toca fuera, ✕ o Esc para cerrar.
                </p>
                <MembersPanel
                  members={members}
                  connectedUserIds={connectedUserIds}
                  currentUser={user}
                  activityByUserId={activityByUserId}
                  gameRanking={gameRanking}
                  onClose={closeMembersPanel}
                />
              </div>
            </div>,
            document.body
          )}

        {toast && (
          <div className="toast" role="status">
            <strong>AkoeNet</strong>
            <span>
              {toast.username}: {toast.snippet}
            </span>
          </div>
        )}
        <UserSettingsModal
          open={userSettingsOpen}
          onClose={() => setUserSettingsOpen(false)}
          initialSection={userSettingsSection}
        />
        <ServerSettingsModal
          open={serverSettingsOpen}
          onClose={() => setServerSettingsOpen(false)}
          serverId={id}
          serverName={serverName}
        />
        <ChannelSettingsModal
          open={channelSettingsOpen}
          onClose={() => setChannelSettingsOpen(false)}
          activeChannel={activeChannel}
          permissions={channelPermissions}
          onTogglePermission={togglePermission}
          members={members}
          userPermissions={userPermissions}
          selectedMemberId={selectedMemberId}
          setSelectedMemberId={setSelectedMemberId}
          onToggleUserPermission={toggleUserPermission}
          categories={categories}
          onUpdateChannel={updateChannel}
        />
      </>
    </AppChrome>
  )
}
