import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import { inviteLandingPath, INVITE_QUERY_PARAM } from '../lib/invites'
import { postAuthDestination } from '../lib/postAuthDestination'
import AuthLegalStrip from '../components/AuthLegalStrip'

const PENDING_INVITE_KEY = 'akoenet_pending_invite'

function readPendingInviteFromSession() {
  try {
    return sessionStorage.getItem(PENDING_INVITE_KEY)
  } catch {
    return null
  }
}

export default function Register() {
  const { register, user, loading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [acceptLegal, setAcceptLegal] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true })
    }
  }, [loading, user, navigate])

  async function onSubmit(e) {
    e.preventDefault()
    if (!acceptLegal) {
      setError('You must accept the terms and privacy policy to register.')
      return
    }
    if (!birthDate) {
      setError('Date of birth is required')
      return
    }
    setError('')
    setBusy(true)
    try {
      const { user: newUser } = await register(username, email, password, birthDate)
      const inv =
        searchParams.get(INVITE_QUERY_PARAM) ||
        (() => {
          try {
            return sessionStorage.getItem(PENDING_INVITE_KEY)
          } catch {
            return null
          }
        })()
      if (inv) {
        try {
          sessionStorage.removeItem(PENDING_INVITE_KEY)
        } catch {
          /* ignore */
        }
        try {
          const { data } = await api.post(`/servers/invite/${encodeURIComponent(inv)}/join`)
          if (data?.server_id != null) {
            navigate(`/server/${data.server_id}`, { replace: true })
            return
          }
        } catch {
          navigate(inviteLandingPath(inv), { replace: true })
          return
        }
      }
      navigate(postAuthDestination(newUser))
    } catch (err) {
      const code = err.response?.data?.error
      const details = err.response?.data?.details
      if (Array.isArray(details) && details.length) {
        setError(details.map((d) => d.message).join(' '))
        return
      }
      const msg =
        code === 'Email already registered'
          ? 'That email is already registered'
          : code === 'blocked_content'
            ? err.response?.data?.message || 'That username is not allowed.'
            : 'Could not register'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand-block">
          <span className="brand-akoenet">AkoeNet</span>
          <span className="brand-sub">Community</span>
        </div>
        <p className="muted small" style={{ marginBottom: '0.75rem' }}>
          <Link to="/">← Home</Link>
        </p>
        <h1>Create account</h1>
        <p className="muted">
          {searchParams.get(INVITE_QUERY_PARAM) || readPendingInviteFromSession()
            ? 'After you create your account, we will add you to the invited server automatically.'
            : 'One step and you are in.'}
        </p>
        <form onSubmit={onSubmit} className="form-stack">
          {error && <div className="error-banner">{error}</div>}
          <label>
            Username
            <input
              id="register-username"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={2}
              autoComplete="username"
            />
          </label>
          <label>
            Email
            <input
              id="register-email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              id="register-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>
          <label>
            Date of birth
            <input
              id="register-birth-date"
              name="birth_date"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              required
              max={(() => {
                const t = new Date()
                t.setFullYear(t.getFullYear() - 13)
                return t.toISOString().slice(0, 10)
              })()}
              min={(() => {
                const t = new Date()
                t.setFullYear(t.getFullYear() - 120)
                return t.toISOString().slice(0, 10)
              })()}
              autoComplete="bday"
            />
            <span className="muted small" style={{ display: 'block', marginTop: 4 }}>
              You must be at least 13 years old. We use this only for age verification.
            </span>
          </label>
          <label className="invite-toggle">
            <input
              id="register-accept-legal"
              name="accept_legal"
              type="checkbox"
              checked={acceptLegal}
              onChange={(e) => setAcceptLegal(e.target.checked)}
              required
            />
            <span>
              I accept the <Link to="/legal/terminos">terms</Link> and{' '}
              <Link to="/legal/privacidad">privacy policy</Link>.
            </span>
          </label>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Creating…' : 'Sign up'}
          </button>
        </form>
        <p className="muted small legal-register-note">
          By signing up you agree to the{' '}
          <Link to="/legal/terminos">terms</Link> and{' '}
          <Link to="/legal/privacidad">privacy policy</Link>.
        </p>
        <p className="muted small">
          Already have an account?{' '}
          <Link
            to={
              searchParams.get(INVITE_QUERY_PARAM)
                ? `/login?${INVITE_QUERY_PARAM}=${encodeURIComponent(searchParams.get(INVITE_QUERY_PARAM))}`
                : '/login'
            }
          >
            Sign in
          </Link>
        </p>
        <AuthLegalStrip />
      </div>
    </div>
  )
}
