import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useDismissiblePopover } from '../hooks/useDismissiblePopover'
import { resolveImageUrl } from '../lib/resolveImageUrl'
import { inviteLandingPath, parseInviteTokenFromInput } from '../lib/invites'
import ServerSidebar from '../components/ServerSidebar'
import UserSettingsModal from '../components/UserSettingsModal'
import AppChrome from '../components/AppChrome'
import AppChromeToolbar from '../components/AppChromeToolbar'
import WelcomeOnboardingModal, { hasSeenOnboarding } from '../components/WelcomeOnboardingModal'
import DashboardAdmin from './DashboardAdmin'
import LanguageSwitcher from '../components/LanguageSwitcher'

const PENDING_INVITE_KEY = 'akoenet_pending_invite'

export default function Dashboard() {
  const { t } = useTranslation()
  const { user, logout, loading: authLoading, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [userAvatarFailed, setUserAvatarFailed] = useState(false)
  const [welcomeOpen, setWelcomeOpen] = useState(() => !hasSeenOnboarding())
  const closeUserMenu = useCallback(() => setUserMenuOpen(false), [])
  const userMenuRef = useDismissiblePopover(userMenuOpen, closeUserMenu)
  const avatarInitial = String(user?.username || 'U').trim().charAt(0).toUpperCase() || 'U'

  useEffect(() => {
    setUserAvatarFailed(false)
  }, [user?.avatar_url])

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
    const steamLinked = searchParams.get('steam_linked')
    const steamErr = searchParams.get('steam_error')
    const twitchLinked = searchParams.get('twitch_linked')
    const twitchErr = searchParams.get('twitch_error')
    if (!steamLinked && !steamErr && !twitchLinked && !twitchErr) return
    if (steamLinked) {
      setActionMessage(t('dashboard.steamLinked'))
      refreshUser().catch(() => {})
    }
    if (steamErr) {
      setActionMessage(t('dashboard.steamError', { code: steamErr }))
    }
    if (twitchLinked) {
      setActionMessage(t('dashboard.twitchLinked'))
      refreshUser().catch(() => {})
    }
    if (twitchErr) {
      setActionMessage(t('dashboard.twitchError', { code: twitchErr }))
    }
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams, refreshUser, t])

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

  async function joinByLink(e) {
    e.preventDefault()
    const token = parseInviteTokenFromInput(joinLink)
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
            <p className="akoenet-tag">{t('dashboard.home.tagline')}</p>
          </div>
          <div className="home-header-actions">
            <LanguageSwitcher />
            <AppChromeToolbar />
            <div className="user-bar" ref={userMenuRef}>
            <button
              type="button"
              className="btn ghost small user-menu-trigger"
              onClick={() => setUserMenuOpen((v) => !v)}
            >
              <span className="user-trigger-content">
                {user?.avatar_url && !userAvatarFailed ? (
                  <img
                    className="user-avatar-tiny"
                    src={resolveImageUrl(user.avatar_url)}
                    alt={t('dashboard.home.avatarAlt')}
                    onError={() => setUserAvatarFailed(true)}
                  />
                ) : (
                  <span className="user-avatar-tiny user-avatar-fallback" aria-hidden="true">
                    {avatarInitial}
                  </span>
                )}
                <span>{user?.username || t('dashboard.home.userFallback')}</span>
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
                  {t('dashboard.home.userMenuSettings')}
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
                    {t('dashboard.home.userMenuAdmin')}
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
                  {t('dashboard.home.userMenuLogout')}
                </button>
              </div>
            )}
          </div>
          </div>
        </header>

        {error && <div className="error-banner inline">{error}</div>}
        {actionMessage && <div className="info-banner" style={{ marginBottom: '0.85rem' }}>{actionMessage}</div>}

        <section className="card scheduler-spotlight" aria-labelledby="scheduler-spotlight-title">
          <h2 id="scheduler-spotlight-title">{t('dashboard.home.schedulerTitle')}</h2>
          <p className="muted small">{t('dashboard.home.schedulerBody')}</p>
        </section>

        <section className="home-grid">
          <div className="card">
            <h2>{t('dashboard.home.createTitle')}</h2>
            <p className="muted small">{t('dashboard.home.createHint')}</p>
            <form onSubmit={createServer} className="form-inline">
              <input
                id="dashboard-new-server-name"
                name="server_name"
                placeholder={t('dashboard.home.serverNamePh')}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button type="submit" className="btn primary" disabled={creatingServer || !newName.trim()}>
                {creatingServer ? t('dashboard.home.creatingServer') : t('dashboard.home.createBtn')}
              </button>
            </form>
          </div>
          <div className="card card-join-server">
            <h2>{t('dashboard.home.joinTitle')}</h2>
            <p className="muted small join-lead">
              {t('dashboard.home.joinLead')}
            </p>
            <form onSubmit={joinByLink} className="form-inline invite-inline">
              <input
                id="dashboard-join-invite-link"
                name="invite_link"
                placeholder={t('dashboard.home.joinPh')}
                value={joinLink}
                onChange={(e) => setJoinLink(e.target.value)}
                autoComplete="off"
              />
              <button type="submit" className="btn primary" disabled={joiningByLinkState || !joinLink.trim()}>
                {joiningByLinkState ? t('dashboard.home.joining') : t('dashboard.home.joinBtn')}
              </button>
            </form>
            <p className="muted small join-hint">
              {t('dashboard.home.joinHintFooter')}
            </p>
            <p className="join-or-divider muted small" role="presentation">
              {t('dashboard.home.orJoinDivider')}
            </p>
            <form onSubmit={joinServer} className="form-inline">
              <input
                id="dashboard-join-server-id"
                name="server_id"
                placeholder={t('dashboard.home.serverIdPh')}
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                inputMode="numeric"
              />
              <button type="submit" className="btn secondary" disabled={joiningById || !joinId.trim()}>
                {joiningById ? t('dashboard.home.joining') : t('dashboard.home.joinById')}
              </button>
            </form>
          </div>
        </section>

        <section className="server-list-section">
          <h2>{t('dashboard.home.yourServers')}</h2>
          {loading ? (
            <p className="muted">{t('dashboard.home.serversLoading')}</p>
          ) : servers.length === 0 ? (
            <p className="muted">
              {t('dashboard.home.serversEmpty')}
            </p>
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

        {user?.is_admin ? <DashboardAdmin embedded /> : null}

      </div>
      <UserSettingsModal open={userSettingsOpen} onClose={() => setUserSettingsOpen(false)} />
      <WelcomeOnboardingModal open={welcomeOpen} onClose={() => setWelcomeOpen(false)} />
    </div>
    </AppChrome>
  )
}
