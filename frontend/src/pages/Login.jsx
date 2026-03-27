import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const SESSION_NOTICE_KEY = 'akonet_session_notice'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000'

  useEffect(() => {
    const msg = localStorage.getItem(SESSION_NOTICE_KEY)
    if (!msg) return
    setNotice(msg)
    localStorage.removeItem(SESSION_NOTICE_KEY)
  }, [])

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

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand-block">
          <span className="brand-akonet">AkoNet</span>
          <span className="brand-sub">Community</span>
        </div>
        <h1>Sign in</h1>
        <p className="muted">Communities and real-time chat.</p>
        <form onSubmit={onSubmit} className="form-stack">
          {notice && <div className="info-banner">{notice}</div>}
          {error && <div className="error-banner">{error}</div>}
          <label>
            Email
            <input
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
            onClick={() => {
              window.location.href = `${apiBase}/auth/twitch/start`
            }}
          >
            Sign in with Twitch
          </button>
        </form>
        <p className="muted small">
          Do not have an account? <Link to="/register">Sign up</Link>
        </p>
      </div>
    </div>
  )
}
