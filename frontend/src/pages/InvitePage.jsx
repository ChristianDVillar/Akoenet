import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

const PENDING_INVITE_KEY = 'akoenet_pending_invite'

export default function InvitePage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [preview, setPreview] = useState(null)
  const [fetchError, setFetchError] = useState(null)
  const [joinBusy, setJoinBusy] = useState(false)
  const [joinError, setJoinError] = useState('')

  const loadPreview = useCallback(async () => {
    setFetchError(null)
    setPreview(null)
    const t = String(token || '').trim()
    if (!t) {
      setFetchError('invalid')
      return
    }
    try {
      const { data } = await api.get(`/servers/invite/${encodeURIComponent(t)}/preview`)
      setPreview(data)
    } catch (e) {
      const status = e.response?.status
      setFetchError(status === 404 ? 'not_found' : 'failed')
    }
  }, [token])

  useEffect(() => {
    loadPreview()
  }, [loadPreview])

  useEffect(() => {
    const t = String(token || '').trim()
    if (t && !user) {
      try {
        sessionStorage.setItem(PENDING_INVITE_KEY, t)
      } catch {
        /* ignore */
      }
    }
  }, [token, user])

  async function join() {
    const t = String(token || '').trim()
    if (!t || !user) return
    setJoinError('')
    setJoinBusy(true)
    try {
      const { data } = await api.post(`/servers/invite/${encodeURIComponent(t)}/join`)
      const sid = data?.server_id
      if (sid != null) {
        try {
          sessionStorage.removeItem(PENDING_INVITE_KEY)
        } catch {
          /* ignore */
        }
        navigate(`/server/${sid}`, { replace: true })
        return
      }
      setJoinError('Unexpected response')
    } catch (err) {
      const status = err.response?.status
      const msg =
        status === 409
          ? 'You are already in this server.'
          : status === 404
            ? 'This invite is no longer valid.'
            : status === 410
              ? 'This invite has expired or reached its use limit.'
              : 'Could not join. Try again.'
      setJoinError(msg)
    } finally {
      setJoinBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  if (fetchError === 'not_found' || fetchError === 'failed') {
    return (
      <div className="auth-page">
        <div className="auth-card invite-landing-card">
          <div className="brand-block">
            <span className="brand-akoenet">AkoeNet</span>
          </div>
          <h1>Invite not available</h1>
          <p className="muted">
            {fetchError === 'not_found'
              ? 'This link may be wrong, expired, or no longer valid.'
              : 'We could not load this invite. Check your connection and try again.'}
          </p>
          <Link to="/" className="btn primary" style={{ display: 'inline-block', marginTop: '0.75rem' }}>
            Go to AkoeNet
          </Link>
        </div>
      </div>
    )
  }

  if (!preview && !fetchError) {
    return (
      <div className="auth-page">
        <div className="auth-card invite-landing-card">
          <p className="muted">Loading invite…</p>
        </div>
      </div>
    )
  }

  const name = preview?.server_name || 'a server'

  return (
    <div className="auth-page">
      <div className="auth-card invite-landing-card">
        <div className="brand-block">
          <span className="brand-akoenet">AkoeNet</span>
          <span className="brand-sub">Community</span>
        </div>
        <p className="invite-landing-kicker">You’re invited</p>
        <h1 className="invite-landing-title">{name}</h1>
        <p className="muted invite-landing-sub">
          Join this community on AkoeNet — chat, voice, and more in one place.
        </p>

        {user ? (
          <>
            {joinError && (
              <div className="error-banner" style={{ marginTop: '0.75rem' }}>
                {joinError}
              </div>
            )}
            <button type="button" className="btn primary invite-landing-cta" disabled={joinBusy} onClick={join}>
              {joinBusy ? 'Joining…' : `Join ${name}`}
            </button>
            <p className="muted small" style={{ marginTop: '1rem' }}>
              Signed in as <strong>{user.username}</strong>
            </p>
          </>
        ) : (
          <>
            <p className="muted small" style={{ marginTop: '0.5rem' }}>
              Sign in or create an account to join.
            </p>
            <div className="invite-landing-actions">
              <Link
                to={`/login?invite=${encodeURIComponent(String(token || ''))}`}
                className="btn primary"
              >
                Sign in
              </Link>
              <Link
                to={`/register?invite=${encodeURIComponent(String(token || ''))}`}
                className="btn ghost"
              >
                Create account
              </Link>
            </div>
          </>
        )}

        <p className="muted small" style={{ marginTop: '1.5rem' }}>
          <Link to="/">← Home</Link>
        </p>
      </div>
    </div>
  )
}
