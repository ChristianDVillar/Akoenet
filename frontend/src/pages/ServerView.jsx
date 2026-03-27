import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../services/api'
import { getSocket } from '../services/socket'
import { useAuth } from '../context/AuthContext'
import ServerSidebar from '../components/ServerSidebar'
import ChannelList from '../components/ChannelList'
import Chat from '../components/Chat'
import MembersPanel from '../components/MembersPanel'
import ChannelPermissionsPanel from '../components/ChannelPermissionsPanel'

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
  const [newChannel, setNewChannel] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newChannelType, setNewChannelType] = useState('text')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [channelPermissions, setChannelPermissions] = useState([])
  const [userPermissions, setUserPermissions] = useState([])
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState([])

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
      } catch {
        navigate('/')
      }
    })()
  }, [id, navigate])

  useEffect(() => {
    const s = getSocket()
    if (!s || Number.isNaN(id)) return
    s.emit('join_server', id)
    return () => {
      s.emit('leave_server', id)
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

  async function addChannel(e) {
    e.preventDefault()
    if (!newChannel.trim() || Number.isNaN(id)) return
    await api.post('/channels', {
      name: newChannel.trim(),
      server_id: id,
      type: newChannelType,
      category_id: selectedCategory ? Number(selectedCategory) : null,
    })
    setNewChannel('')
    setSelectedCategory('')
    const { data } = await api.get(`/channels/server/${id}`)
    setChannels(data)
  }

  async function addCategory(e) {
    e.preventDefault()
    if (!newCategory.trim() || Number.isNaN(id)) return
    await api.post('/channels/categories', {
      server_id: id,
      name: newCategory.trim(),
    })
    setNewCategory('')
    const { data } = await api.get(`/channels/server/${id}/categories`)
    setCategories(data)
  }

  async function deleteCategory(categoryId) {
    if (!window.confirm('Quieres eliminar esta categoria? Sus canales quedaran sin categoria.')) return
    try {
      await api.delete(`/channels/categories/${categoryId}`)
    } catch (err) {
      if (err.response?.status !== 404) {
        setToast({
          username: 'Sistema',
          snippet: 'No se pudo eliminar la categoria',
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
      localStorage.setItem(`akoe:collapsed:${id}`, JSON.stringify(next))
      return next
    })
  }

  async function deleteChannel(channelId) {
    if (!window.confirm('Quieres eliminar este canal?')) return
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
    const key = `akoe:collapsed:${id}`
    try {
      const raw = localStorage.getItem(key)
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
      localStorage.setItem(`akoe:collapsed:${id}`, JSON.stringify(next))
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
        newCategory={newCategory}
        setNewCategory={setNewCategory}
        onAddCategory={addCategory}
        onDeleteCategory={deleteCategory}
        newChannel={newChannel}
        setNewChannel={setNewChannel}
        newChannelType={newChannelType}
        setNewChannelType={setNewChannelType}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        onAddChannel={addChannel}
        onDeleteChannel={deleteChannel}
        onMoveChannel={moveChannel}
        onMoveCategory={moveCategory}
        collapsedCategories={collapsedCategories}
        onToggleCategory={toggleCategoryCollapse}
        user={user}
        onLogout={logout}
      />
      <Chat
        channelId={activeChannelId}
        channelName={activeChannel?.name}
        channelType={activeChannel?.type}
        serverId={id}
        user={user}
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
        />
      </div>

      {toast && (
        <div className="toast" role="status">
          <strong>AkoNet</strong>
          <span>
            {toast.username}: {toast.snippet}
          </span>
        </div>
      )}
    </div>
  )
}
