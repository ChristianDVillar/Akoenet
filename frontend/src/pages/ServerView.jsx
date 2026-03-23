import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../services/api'
import { getSocket } from '../services/socket'
import { useAuth } from '../context/AuthContext'
import ServerSidebar from '../components/ServerSidebar'
import ChannelList from '../components/ChannelList'
import Chat from '../components/Chat'

export default function ServerView() {
  const { serverId } = useParams()
  const id = parseInt(serverId, 10)
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [servers, setServers] = useState([])
  const [channels, setChannels] = useState([])
  const [activeChannelId, setActiveChannelId] = useState(null)
  const [serverName, setServerName] = useState('')
  const [toast, setToast] = useState(null)
  const [newChannel, setNewChannel] = useState('')

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
        const { data } = await api.get(`/channels/server/${id}`)
        setChannels(data)
        setActiveChannelId(data[0]?.id ?? null)
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
    await api.post('/channels', { name: newChannel.trim(), server_id: id })
    setNewChannel('')
    const { data } = await api.get(`/channels/server/${id}`)
    setChannels(data)
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
        channels={channels}
        activeChannelId={activeChannelId}
        onSelectChannel={setActiveChannelId}
        newChannel={newChannel}
        setNewChannel={setNewChannel}
        onAddChannel={addChannel}
        user={user}
        onLogout={logout}
      />
      <Chat
        channelId={activeChannelId}
        channelName={activeChannel?.name}
        serverId={id}
      />

      {toast && (
        <div className="toast" role="status">
          <strong>EchoNet</strong>
          <span>
            {toast.username}: {toast.snippet}
          </span>
        </div>
      )}
    </div>
  )
}
