import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { register, user, loading } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true })
    }
  }, [loading, user, navigate])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await register(username, email, password)
      navigate('/')
    } catch (err) {
      const msg =
        err.response?.data?.error === 'Email already registered'
          ? 'That email is already registered'
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
        <p className="muted">One step and you are in.</p>
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
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Creating…' : 'Sign up'}
          </button>
        </form>
        <p className="muted small legal-register-note">
          Al registrarte aceptas los{' '}
          <Link to="/legal/terminos">términos</Link> y la{' '}
          <Link to="/legal/privacidad">política de privacidad</Link>.
        </p>
        <p className="muted small">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
