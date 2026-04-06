import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthLegalStrip from './AuthLegalStrip'

/**
 * Blocks the app until the user accepts the current LEGAL_TERMS_VERSION (backend).
 * Legal doc routes remain readable; this is shown on main app surfaces (home, private routes).
 */
export default function LegalTermsGate() {
  const { acceptTerms } = useAuth()
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    if (!accepted) return
    setError('')
    setBusy(true)
    try {
      await acceptTerms()
    } catch (err) {
      const msg =
        err.response?.data?.details?.[0]?.message ||
        err.response?.data?.error ||
        'Could not save your acceptance. Try again.'
      setError(typeof msg === 'string' ? msg : 'Could not save your acceptance.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand-block">
          <span className="brand-akoenet">AkoeNet</span>
          <span className="brand-sub">Community</span>
        </div>
        <h1>Updated terms</h1>
        <p className="muted">
          You need to accept the current Terms of Service and Privacy Policy to keep using AkoeNet. You can read them
          before confirming.
        </p>
        <ul className="muted small" style={{ textAlign: 'left', marginBottom: '1rem' }}>
          <li>
            <Link to="/legal/terminos" target="_blank" rel="noopener noreferrer">
              Terms of Service
            </Link>
          </li>
          <li>
            <Link to="/legal/privacidad" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </Link>
          </li>
        </ul>
        <form onSubmit={onSubmit} className="form-stack">
          {error && <div className="error-banner">{error}</div>}
          <label className="invite-toggle">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              disabled={busy}
            />
            <span>
              I have read and accept the current Terms of Service and Privacy Policy.
            </span>
          </label>
          <button type="submit" className="btn primary" disabled={busy || !accepted}>
            {busy ? 'Saving…' : 'Continue'}
          </button>
        </form>
        <AuthLegalStrip />
      </div>
    </div>
  )
}
