import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import ServerSidebar from '../components/ServerSidebar'
import DirectMessagesPanel from '../components/DirectMessagesPanel'
import AppChrome from '../components/AppChrome'
import AppChromeToolbar from '../components/AppChromeToolbar'

export default function Messages() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [servers, setServers] = useState([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.get('/servers')
        if (!cancelled) setServers(data)
      } catch {
        if (!cancelled) setServers([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <AppChrome>
    <div className="app-shell dashboard-shell">
      <ServerSidebar
        servers={servers}
        activeServerId={null}
        onSelectServer={(id) => navigate(`/server/${id}`)}
        homeAction={() => navigate('/')}
        messagesAction={() => navigate('/messages')}
        messagesActive
      />
      <div className="main-panel home-panel">
        <header className="home-header">
          <div>
            <h1>Messages</h1>
            <p className="akoenet-tag">Direct messages</p>
          </div>
          <div className="home-header-actions">
            <AppChromeToolbar />
          </div>
        </header>
        <DirectMessagesPanel user={user} />
      </div>
    </div>
    </AppChrome>
  )
}
