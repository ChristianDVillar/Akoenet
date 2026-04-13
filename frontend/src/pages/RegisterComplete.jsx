import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import { inviteLandingPath, INVITE_QUERY_PARAM } from '../lib/invites'
import { postAuthDestination } from '../lib/postAuthDestination'
import AuthLegalStrip from '../components/AuthLegalStrip'
import LanguageSwitcher from '../components/LanguageSwitcher'

const PENDING_INVITE_KEY = 'akoenet_pending_invite'

export default function RegisterComplete() {
  const { t } = useTranslation()
  const { registerComplete, user, loading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = String(searchParams.get('token') || '').trim()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [acceptLegal, setAcceptLegal] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingLoading, setPendingLoading] = useState(true)
  const [emailMasked, setEmailMasked] = useState('')
  const [inviteFromToken, setInviteFromToken] = useState(null)

  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true })
    }
  }, [loading, user, navigate])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
        setPendingLoading(false)
        setLoadError(t('registerComplete.invalidToken'))
        return
      }
      setLoadError('')
      try {
        const { data } = await api.get('/auth/register/pending', { params: { token } })
        if (cancelled) return
        setEmailMasked(data.email_masked || '')
        const inv = data.invite != null ? String(data.invite).trim() : ''
        setInviteFromToken(inv || null)
      } catch (err) {
        if (cancelled) return
        setLoadError(
          err.response?.data?.error === 'invalid_or_expired_token'
            ? t('registerComplete.tokenExpired')
            : t('registerComplete.tokenVerifyFailed')
        )
      } finally {
        if (!cancelled) setPendingLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token, t])

  async function onSubmit(e) {
    e.preventDefault()
    if (!acceptLegal) {
      setError(t('registerComplete.acceptRequired'))
      return
    }
    if (!birthDate) {
      setError(t('registerComplete.birthRequired'))
      return
    }
    setError('')
    setBusy(true)
    try {
      const { user: newUser } = await registerComplete(token, username, password, birthDate)
      const inv =
        inviteFromToken ||
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
          ? t('registerComplete.errEmailTaken')
          : code === 'invalid_or_expired_token'
            ? t('registerComplete.errToken')
            : code === 'blocked_content'
              ? err.response?.data?.message || t('registerComplete.errBlocked')
              : t('registerComplete.errGeneric')
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted">{t('registerComplete.loading')}</p>
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
          <Link to="/">{t('registerComplete.homeLink')}</Link>
        </p>
        <h1>{t('registerComplete.title')}</h1>
        <p className="muted">
          {emailMasked
            ? t('registerComplete.leadMasked', { email: emailMasked })
            : t('registerComplete.leadDefault')}
        </p>
        {pendingLoading && <p className="muted">{t('registerComplete.checkingLink')}</p>}
        {loadError && <div className="error-banner">{loadError}</div>}
        {loadError && (
          <p className="muted small">
            <Link to="/register">{t('registerComplete.backSignUp')}</Link>
          </p>
        )}
        {!pendingLoading && !loadError && (
          <form onSubmit={onSubmit} className="form-stack">
            {error && <div className="error-banner">{error}</div>}
            <label>
              {t('registerComplete.username')}
              <input
                id="register-complete-username"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={2}
                autoComplete="username"
              />
            </label>
            <label>
              {t('registerComplete.password')}
              <input
                id="register-complete-password"
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
              {t('registerComplete.birthDate')}
              <input
                id="register-complete-birth-date"
                name="birth_date"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                required
                max={(() => {
                  const d = new Date()
                  d.setFullYear(d.getFullYear() - 13)
                  return d.toISOString().slice(0, 10)
                })()}
                min={(() => {
                  const d = new Date()
                  d.setFullYear(d.getFullYear() - 120)
                  return d.toISOString().slice(0, 10)
                })()}
                autoComplete="bday"
              />
              <span className="muted small" style={{ display: 'block', marginTop: 4 }}>
                {t('registerComplete.birthHint')}
              </span>
            </label>
            <label className="invite-toggle">
              <input
                id="register-complete-accept-legal"
                name="accept_legal"
                type="checkbox"
                checked={acceptLegal}
                onChange={(e) => setAcceptLegal(e.target.checked)}
                required
              />
              <span>
                {t('registerComplete.acceptLegalPrefix')}{' '}
                <Link to="/legal/terminos">{t('common.termsShort')}</Link> {t('registerComplete.acceptLegalMid')}{' '}
                <Link to="/legal/privacidad">{t('common.privacyShort')}</Link>.
              </span>
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? t('registerComplete.creating') : t('registerComplete.createAccount')}
            </button>
          </form>
        )}
        <p className="muted small legal-register-note">
          {t('registerComplete.legalFooterPrefix')}{' '}
          <Link to="/legal/terminos">{t('common.termsShort')}</Link> {t('registerComplete.legalFooterMid')}{' '}
          <Link to="/legal/privacidad">{t('common.privacyShort')}</Link>.
        </p>
        <p className="muted small">
          {t('registerComplete.haveAccount')} <Link to="/login">{t('registerComplete.signIn')}</Link>
        </p>
        <AuthLegalStrip />
      </div>
    </div>
  )
}
