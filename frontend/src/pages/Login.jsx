import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getApiBaseUrl } from '../lib/apiBase'

const SESSION_NOTICE_KEY = 'akoenet_session_notice'
const LEGACY_SESSION_NOTICE_KEYS = ['akonet_session_notice', 'Akonet_session_notice']
const TWITCH_OAUTH_ERR_KEY = 'akoenet_twitch_oauth_error'

export default function Login() {
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [twitchConfigured, setTwitchConfigured] = useState(null)
  const apiBase = getApiBaseUrl()

  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true })
    }
  }, [loading, user, navigate])

  useEffect(() => {
    let msg = localStorage.getItem(SESSION_NOTICE_KEY)
    if (!msg) {
      for (const k of LEGACY_SESSION_NOTICE_KEYS) {
        msg = localStorage.getItem(k)
        if (msg) break
      }
    }
    if (!msg) return
    setNotice(msg)
    localStorage.removeItem(SESSION_NOTICE_KEY)
    LEGACY_SESSION_NOTICE_KEYS.forEach((k) => localStorage.removeItem(k))
  }, [])

  useEffect(() => {
    const code = sessionStorage.getItem(TWITCH_OAUTH_ERR_KEY)
    if (!code) return
    sessionStorage.removeItem(TWITCH_OAUTH_ERR_KEY)
    setError(`Twitch sign-in failed (${code}). Try again or use email and password.`)
  }, [])

  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()
    const timeoutMs = 8000
    const timer = setTimeout(() => ac.abort(), timeoutMs)

    fetch(`${apiBase}/auth/twitch/status`, { signal: ac.signal })
      .then((res) => {
        clearTimeout(timer)
        if (!res.ok) throw new Error(`status ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setTwitchConfigured(Boolean(data?.configured))
      })
      .catch(() => {
        clearTimeout(timer)
        if (!cancelled) setTwitchConfigured(false)
      })

    return () => {
      cancelled = true
      clearTimeout(timer)
      ac.abort()
    }
  }, [apiBase])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
      navigate('/')
    } catch {
      setError('Invalid credentials')
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
        <h1>Sign in</h1>
        <p className="muted">Communities and real-time chat.</p>
        <form onSubmit={onSubmit} className="form-stack">
          {notice && <div className="info-banner">{notice}</div>}
          {error && <div className="error-banner">{error}</div>}
          <label>
            Email
            <input
              id="login-email"
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
              id="login-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button
            type="button"
            className="btn twitch"
            disabled={twitchConfigured !== true}
            title={
              twitchConfigured === false
                ? 'Twitch OAuth is not configured on the server (missing TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET).'
                : undefined
            }
            onClick={() => {
              window.location.href = `${apiBase}/auth/twitch/start`
            }}
          >
            {twitchConfigured === null
              ? 'Checking Twitch…'
              : twitchConfigured === false
                ? 'Twitch unavailable'
                : 'Sign in with Twitch'}
          </button>
          {twitchConfigured === false && (
            <p className="muted small" style={{ marginTop: '0.5rem' }}>
              Server admin must set <code>TWITCH_CLIENT_ID</code> and <code>TWITCH_CLIENT_SECRET</code>{' '}
              and add the callback URL in the Twitch Developer Console (
              <code>{apiBase}/auth/twitch/callback</code>).
            </p>
          )}
        </form>
        <p className="muted small">
          Do not have an account? <Link to="/register">Sign up</Link>
        </p>
      </div>
    </div>
  )
}
