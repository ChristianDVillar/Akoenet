import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../services/api'
import { getSocket } from '../services/socket'
import { useAuth } from '../context/AuthContext'
import ServerSidebar from '../components/ServerSidebar'
import ChannelList from '../components/ChannelList'
import Chat from '../components/Chat'
import MembersPanel from '../components/MembersPanel'
import ChannelPermissionsPanel from '../components/ChannelPermissionsPanel'
import VoiceSettingsModal from '../components/VoiceSettingsModal'
import UserSettingsModal from '../components/UserSettingsModal'
import ServerEmojiManager from '../components/ServerEmojiManager'
import ServerSettingsModal from '../components/ServerSettingsModal'

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

export default function ServerView() {
  const { serverId } = useParams()
  const id = parseInt(serverId, 10)
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [servers, setServers] = useState([])
  const [channels, setChannels] = useState([])
  const [categories, setCategories] = useState([])
  const [members, setMembers] = useState([])
  const [activeChannelId, setActiveChannelId] = useState(null)
  const [serverName, setServerName] = useState('')
  const [toast, setToast] = useState(null)
  const [channelPermissions, setChannelPermissions] = useState([])
  const [userPermissions, setUserPermissions] = useState([])
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState([])
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false)
  const [userSettingsOpen, setUserSettingsOpen] = useState(false)
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false)
  const [emojis, setEmojis] = useState([])
  const [voicePresence, setVoicePresence] = useState({})
  /** Voice channel id kept while user reads text channels (stay connected). Cleared on leave / server change. */
  const [voicePersistChannelId, setVoicePersistChannelId] = useState(null)
  /** Stops HTTP voice-presence polling after 404 (old API / wrong base URL) to avoid console spam */
  const voicePresencePollStopped404 = useRef(false)

  const rtcVoiceChannelId = useMemo(() => {
    const active = channels.find((c) => c.id === activeChannelId)
    if (active?.type === 'voice') return activeChannelId
    return voicePersistChannelId
  }, [channels, activeChannelId, voicePersistChannelId])

  const rtcVoiceChannelMeta = useMemo(() => {
    if (rtcVoiceChannelId == null) return null
    return channels.find((c) => c.id === rtcVoiceChannelId) || null
  }, [channels, rtcVoiceChannelId])

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
    if (Number.isNaN(id)) {
      navigate('/')
      return
    }
    ;(async () => {
      try {
        const { data } = await api.get('/servers')
        setServers(data)
        const current = data.find((s) => s.id === id)
        if (!current) {
          navigate('/')
          return
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
      } catch {
        navigate('/')
      }
    })()
  }, [id, navigate])

  async function loadEmojis() {
    if (!id) return
    try {
      const { data } = await api.get(`/servers/${id}/emojis`)
      setEmojis(data)
    } catch {
      setEmojis([])
    }
  }

  useLayoutEffect(() => {
    const s = getSocket()
    if (!s || Number.isNaN(id)) return undefined
    setVoicePresence({})

    const onSnap = ({ serverId, presence }) => {
      if (serverId !== id) return
      setVoicePresence(normalizeVoicePresencePayload(presence))
    }
    const onPresence = ({ channelId, participants }) => {
      if (channelId == null) return
      const key = String(channelId)
      setVoicePresence((prev) => ({ ...prev, [key]: participants || [] }))
    }

    const joinSrv = () => {
      s.emit('join_server', id)
    }

    s.on('voice:presence_snapshot', onSnap)
    s.on('voice:presence', onPresence)
    s.on('connect', joinSrv)
    if (s.connected) joinSrv()

    return () => {
      s.off('voice:presence_snapshot', onSnap)
      s.off('voice:presence', onPresence)
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

  return (
    <div className="app-shell">
      <ServerSidebar
        servers={servers}
        activeServerId={id}
        onSelectServer={(sid) => navigate(`/server/${sid}`)}
        homeAction={() => navigate('/')}
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
        onOpenVoiceSettings={() => setVoiceSettingsOpen(true)}
        onOpenUserSettings={() => setUserSettingsOpen(true)}
        onOpenServerSettings={() => setServerSettingsOpen(true)}
        onOpenAdminDashboard={() => navigate('/admin')}
        schedulerStreamerUsername={import.meta.env.VITE_SCHEDULER_STREAMER_USERNAME}
        voicePresence={voicePresence}
      />
      <Chat
        channelId={activeChannelId}
        channelName={activeChannel?.name}
        channelType={activeChannel?.type}
        user={user}
        emojis={emojis}
        voiceUserLimit={rtcVoiceChannelMeta?.voice_user_limit}
        voiceConnectedCount={rtcVoiceConnectedCount}
        onVoiceSessionChange={handleVoiceSessionChange}
        rtcVoiceChannelId={rtcVoiceChannelId}
        rtcVoiceChannelName={rtcVoiceChannelMeta?.name}
      />
      <div className="right-column">
        <MembersPanel members={members} />
        <ChannelPermissionsPanel
          channelName={activeChannel?.name}
          channelType={activeChannel?.type}
          permissions={channelPermissions}
          onTogglePermission={togglePermission}
          members={members}
          userPermissions={userPermissions}
          selectedMemberId={selectedMemberId}
          setSelectedMemberId={setSelectedMemberId}
          onToggleUserPermission={toggleUserPermission}
          categories={categories}
          activeChannel={activeChannel}
          onUpdateChannel={updateChannel}
        />
        <ServerEmojiManager serverId={id} emojis={emojis} onReload={loadEmojis} />
      </div>

      {toast && (
        <div className="toast" role="status">
          <strong>AkoeNet</strong>
          <span>
            {toast.username}: {toast.snippet}
          </span>
        </div>
      )}
      <VoiceSettingsModal open={voiceSettingsOpen} onClose={() => setVoiceSettingsOpen(false)} user={user} />
      <UserSettingsModal open={userSettingsOpen} onClose={() => setUserSettingsOpen(false)} />
      <ServerSettingsModal
        open={serverSettingsOpen}
        onClose={() => setServerSettingsOpen(false)}
        serverId={id}
        serverName={serverName}
      />
    </div>
  )
}
