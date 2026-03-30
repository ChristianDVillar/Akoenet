import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useDismissiblePopover } from '../hooks/useDismissiblePopover'
import { resolveImageUrl } from '../lib/resolveImageUrl'
import { inviteLandingPath } from '../lib/invites'
import ServerSidebar from '../components/ServerSidebar'
import UserSettingsModal from '../components/UserSettingsModal'
import AppChrome from '../components/AppChrome'
import WelcomeOnboardingModal, { hasSeenOnboarding } from '../components/WelcomeOnboardingModal'

const PENDING_INVITE_KEY = 'akoenet_pending_invite'

export default function Dashboard() {
  const { user, logout, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [servers, setServers] = useState([])
  const [newName, setNewName] = useState('')
  const [joinId, setJoinId] = useState('')
  const [joinLink, setJoinLink] = useState('')
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [userSettingsOpen, setUserSettingsOpen] = useState(false)
  const [creatingServer, setCreatingServer] = useState(false)
  const [joiningById, setJoiningById] = useState(false)
  const [joiningByLinkState, setJoiningByLinkState] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [welcomeOpen, setWelcomeOpen] = useState(() => !hasSeenOnboarding())
  const closeUserMenu = useCallback(() => setUserMenuOpen(false), [])
  const userMenuRef = useDismissiblePopover(userMenuOpen, closeUserMenu)

  async function load() {
    setLoading(true)
    try {
      const { data } = await api.get('/servers')
      setServers(data)
    } catch {
      setError('Could not load servers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!user || authLoading) return
    let t
    try {
      t = sessionStorage.getItem(PENDING_INVITE_KEY)
    } catch {
      return
    }
    if (!t) return
    try {
      sessionStorage.removeItem(PENDING_INVITE_KEY)
    } catch {
      /* ignore */
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.post(`/servers/invite/${encodeURIComponent(t)}/join`)
        if (!cancelled && data?.server_id != null) {
          navigate(`/server/${data.server_id}`, { replace: true })
        }
      } catch {
        if (!cancelled) navigate(inviteLandingPath(t), { replace: true })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, authLoading, navigate])

  async function createServer(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setError('')
    setActionMessage('')
    setCreatingServer(true)
    try {
      await api.post('/servers', { name: newName.trim() })
      setNewName('')
      await load()
      setActionMessage('Server created successfully.')
    } catch {
      setError('Could not create server')
    } finally {
      setCreatingServer(false)
    }
  }

  async function joinServer(e) {
    e.preventDefault()
    const id = parseInt(joinId, 10)
    if (Number.isNaN(id)) {
      setError('Invalid server ID')
      return
    }
    setError('')
    setActionMessage('')
    setJoiningById(true)
    try {
      await api.post(`/servers/${id}/join`)
      setJoinId('')
      await load()
      setActionMessage('You joined the server successfully.')
    } catch (err) {
      const msg =
        err.response?.status === 409
          ? 'You are already a member'
          : err.response?.status === 404
            ? 'Server not found'
            : err.response?.status === 403
              ? 'You cannot join that server'
            : 'Could not join server'
      setError(msg)
    } finally {
      setJoiningById(false)
    }
  }

  function extractInviteToken(raw) {
    const value = raw.trim()
    if (!value) return ''
    try {
      const u = value.startsWith('http')
        ? new URL(value)
        : new URL(value, 'https://invite.local')
      const fromQuery = u.searchParams.get('invite')
      if (fromQuery) return fromQuery.trim()
    } catch {
      /* fall through */
    }
    if (value.includes('/')) {
      const chunks = value.split('/').filter(Boolean)
      const last = chunks[chunks.length - 1] || ''
      return last.split('?')[0] || ''
    }
    return value
  }

  async function joinByLink(e) {
    e.preventDefault()
    const token = extractInviteToken(joinLink)
    if (!token) {
      setError('Invalid invite link')
      return
    }
    setError('')
    setActionMessage('')
    setJoiningByLinkState(true)
    try {
      await api.post(`/servers/invite/${token}/join`)
      setJoinLink('')
      await load()
      setActionMessage('Invite accepted. You joined the server.')
    } catch (err) {
      const msg =
        err.response?.status === 409
          ? 'You are already a member'
          : err.response?.status === 404
            ? 'Invite not found'
            : err.response?.status === 410
              ? 'Invite expired or out of uses'
              : 'Could not join with invite'
      setError(msg)
    } finally {
      setJoiningByLinkState(false)
    }
  }

  return (
    <AppChrome>
    <div className="app-shell dashboard-shell">
      <ServerSidebar
        servers={servers}
        activeServerId={null}
        onSelectServer={(id) => navigate(`/server/${id}`)}
        homeAction={() => navigate('/')}
        messagesAction={() => navigate('/messages')}
      />
      <div className="main-panel home-panel">
        <header className="home-header">
          <div>
            <h1>AkoeNet</h1>
            <p className="akoenet-tag">AkoeNet · your communities</p>
          </div>
          <div className="user-bar" ref={userMenuRef}>
            <button
              type="button"
              className="btn ghost small user-menu-trigger"
              onClick={() => setUserMenuOpen((v) => !v)}
            >
              <span className="user-trigger-content">
                <img
                  className="user-avatar-tiny"
                  src={user?.avatar_url ? resolveImageUrl(user.avatar_url) : '/vite.svg'}
                  alt="User avatar"
                  onError={(e) => {
                    e.currentTarget.src = '/vite.svg'
                  }}
                />
                <span>{user?.username || 'User'}</span>
              </span>
            </button>
            {userMenuOpen && (
              <div className="user-menu-popover user-menu-popover-right">
                <button
                  type="button"
                  className="btn link"
                  onClick={() => {
                    closeUserMenu()
                    setUserSettingsOpen(true)
                  }}
                >
                  Settings
                </button>
                {user?.is_admin && (
                  <button
                    type="button"
                    className="btn link"
                    onClick={() => {
                      closeUserMenu()
                      navigate('/admin')
                    }}
                  >
                    Admin dashboard
                  </button>
                )}
                <button
                  type="button"
                  className="btn link"
                  onClick={() => {
                    closeUserMenu()
                    logout()
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        {error && <div className="error-banner inline">{error}</div>}
        {actionMessage && <div className="info-banner" style={{ marginBottom: '0.85rem' }}>{actionMessage}</div>}

        <section className="card scheduler-spotlight" aria-labelledby="scheduler-spotlight-title">
          <h2 id="scheduler-spotlight-title">Organize and automate your streaming</h2>
          <p className="muted small">
            AkoeNet includes a <strong>Streamer Scheduler</strong> integration: in any server text channel, run{' '}
            <code className="inline-code">!schedule</code> or <code className="inline-code">!next</code>. Set your public
            Scheduler slug in <strong>User Settings</strong> (Streamer Scheduler username). New servers get a{' '}
            <strong>📅 upcoming streams</strong> channel plus a welcome message with examples.
          </p>
        </section>

        <section className="home-grid">
          <div className="card">
            <h2>Create server</h2>
            <p className="muted small">Pick a clear name. You can rename and organize channels later.</p>
            <form onSubmit={createServer} className="form-inline">
              <input
                id="dashboard-new-server-name"
                name="server_name"
                placeholder="Server name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button type="submit" className="btn primary" disabled={creatingServer || !newName.trim()}>
                {creatingServer ? 'Creating…' : 'Create'}
              </button>
            </form>
          </div>
          <div className="card">
            <h2>Join server</h2>
            <p className="muted small">Use this if someone shared a numeric server ID with you.</p>
            <form onSubmit={joinServer} className="form-inline">
              <input
                id="dashboard-join-server-id"
                name="server_id"
                placeholder="Numeric server ID"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
              />
              <button type="submit" className="btn secondary" disabled={joiningById || !joinId.trim()}>
                {joiningById ? 'Joining…' : 'Join'}
              </button>
            </form>
            <p className="muted small">
              You can join by ID or invite link. To create or manage invite links, open a server and use Server settings (gear).
            </p>
            <form onSubmit={joinByLink} className="form-inline invite-inline">
              <input
                id="dashboard-join-invite-link"
                name="invite_link"
                placeholder="Paste invite link/token"
                value={joinLink}
                onChange={(e) => setJoinLink(e.target.value)}
              />
              <button type="submit" className="btn secondary" disabled={joiningByLinkState || !joinLink.trim()}>
                {joiningByLinkState ? 'Joining…' : 'Join by link'}
              </button>
            </form>
          </div>
        </section>

        <section className="server-list-section">
          <h2>Your servers</h2>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : servers.length === 0 ? (
            <p className="muted">You do not have servers yet. Create one above.</p>
          ) : (
            <ul className="server-tiles">
              {servers.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="server-tile"
                    onClick={() => navigate(`/server/${s.id}`)}
                  >
                    <span className="server-initial">
                      {s.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="server-name">{s.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
      <UserSettingsModal open={userSettingsOpen} onClose={() => setUserSettingsOpen(false)} />
      <WelcomeOnboardingModal open={welcomeOpen} onClose={() => setWelcomeOpen(false)} />
    </div>
    </AppChrome>
  )
}
