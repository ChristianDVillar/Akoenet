import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthLegalStrip from './AuthLegalStrip'
import LanguageSwitcher from './LanguageSwitcher'

/**
 * Blocks the app until the user accepts the current LEGAL_TERMS_VERSION (backend).
 * Legal doc routes remain readable; this is shown on main app surfaces (home, private routes).
 */
export default function LegalTermsGate() {
  const { t } = useTranslation()
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
        t('legalGate.errSave')
      setError(typeof msg === 'string' ? msg : t('legalGate.errSave'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card-top-row">
          <div className="brand-block">
            <span className="brand-akoenet">AkoeNet</span>
            <span className="brand-sub">{t('common.community')}</span>
          </div>
          <LanguageSwitcher />
        </div>
        <h1>{t('legalGate.title')}</h1>
        <p className="muted">{t('legalGate.lead')}</p>
        <ul className="muted small" style={{ textAlign: 'left', marginBottom: '1rem' }}>
          <li>
            <Link to="/legal/terminos" target="_blank" rel="noopener noreferrer">
              {t('common.terms')}
            </Link>
          </li>
          <li>
            <Link to="/legal/privacidad" target="_blank" rel="noopener noreferrer">
              {t('common.privacy')}
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
            <span>{t('legalGate.acceptLabel')}</span>
          </label>
          <button type="submit" className="btn primary" disabled={busy || !accepted}>
            {busy ? t('legalGate.saving') : t('legalGate.continue')}
          </button>
        </form>
        <AuthLegalStrip />
      </div>
    </div>
  )
}
