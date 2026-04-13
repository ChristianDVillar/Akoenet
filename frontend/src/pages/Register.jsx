import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { INVITE_QUERY_PARAM } from '../lib/invites'
import AuthLegalStrip from '../components/AuthLegalStrip'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Register() {
  const { t } = useTranslation()
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
          ? t('register.errorEmail')
          : t('register.errorStart')
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted">{t('register.loading')}</p>
      </div>
    )
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
        <p className="muted small" style={{ marginBottom: '0.75rem' }}>
          <Link to="/">{t('register.homeLink')}</Link>
        </p>
        <h1>{t('register.title')}</h1>
        {!sent ? (
          <>
            <p className="muted">
              {inviteFromQuery ? t('register.leadInvite') : t('register.leadDefault')}
            </p>
            <form onSubmit={onSubmit} className="form-stack">
              {error && <div className="error-banner">{error}</div>}
              <label>
                {t('register.email')}
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
                {busy ? t('register.sending') : t('register.sendLink')}
              </button>
            </form>
          </>
        ) : (
          <div className="form-stack">
            <p className="muted">{t('register.sentHint')}</p>
            {devLink && (
              <p className="muted small">
                {t('register.devLabel')}{' '}
                <a href={devLink}>{t('register.devOpenLink')}</a>
              </p>
            )}
            <p className="muted small">
              <Link to="/login">{t('register.backSignIn')}</Link>
            </p>
          </div>
        )}
        <p className="muted small legal-register-note">
          {t('register.legalLinePrefix')}{' '}
          <Link to="/legal/terminos">{t('common.termsShort')}</Link> {t('register.legalLineMid')}{' '}
          <Link to="/legal/privacidad">{t('common.privacyShort')}</Link>.
        </p>
        <p className="muted small">
          {t('register.haveAccount')}{' '}
          <Link
            to={
              inviteFromQuery
                ? `/login?${INVITE_QUERY_PARAM}=${encodeURIComponent(inviteFromQuery)}`
                : '/login'
            }
          >
            {t('register.signIn')}
          </Link>
        </p>
        <AuthLegalStrip />
      </div>
    </div>
  )
}
