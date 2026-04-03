import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { INVITE_QUERY_PARAM } from '../lib/invites'
import AuthLegalStrip from '../components/AuthLegalStrip'

export default function Register() {
  const { registerStart, user, loading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [devLink, setDevLink] = useState(null)

  const inviteFromQuery = searchParams.get(INVITE_QUERY_PARAM)

  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true })
    }
  }, [loading, user, navigate])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    setDevLink(null)
    try {
      const { data } = await registerStart(email, inviteFromQuery || undefined)
      if (data?.dev_verify_url) {
        setDevLink(data.dev_verify_url)
      }
      setSent(true)
    } catch (err) {
      const code = err.response?.data?.error
      const msg =
        code === 'email_not_configured' || code === 'email_send_failed'
          ? 'We could not send the email right now. Try again later or contact support.'
          : 'Could not start registration. Try again.'
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
        {!sent ? (
          <>
            <p className="muted">
              {inviteFromQuery
                ? 'Enter your email. We will send a link to finish creating your account and join the invited server.'
                : 'Enter your email. We will send a link to verify it and finish creating your account.'}
            </p>
            <form onSubmit={onSubmit} className="form-stack">
              {error && <div className="error-banner">{error}</div>}
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
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? 'Sending…' : 'Send verification link'}
              </button>
            </form>
          </>
        ) : (
          <div className="form-stack">
            <p className="muted">
              If an account does not already exist for that address, we sent a message with a link. Open it on this
              device to choose your username and password.
            </p>
            {devLink && (
              <p className="muted small">
                Dev:{' '}
                <a href={devLink}>open registration link</a>
              </p>
            )}
            <p className="muted small">
              <Link to="/login">Back to sign in</Link>
            </p>
          </div>
        )}
        <p className="muted small legal-register-note">
          By continuing you agree to the <Link to="/legal/terminos">terms</Link> and{' '}
          <Link to="/legal/privacidad">privacy policy</Link>.
        </p>
        <p className="muted small">
          Already have an account?{' '}
          <Link
            to={
              inviteFromQuery
                ? `/login?${INVITE_QUERY_PARAM}=${encodeURIComponent(inviteFromQuery)}`
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
