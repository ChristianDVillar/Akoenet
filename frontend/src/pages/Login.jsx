import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getApiBaseUrl } from '../lib/apiBase'
import api from '../services/api'
import { inviteLandingPath, INVITE_QUERY_PARAM } from '../lib/invites'
import { postAuthDestination } from '../lib/postAuthDestination'
import { isTauri } from '../lib/isTauri'
import { isCapacitorNative } from '../lib/mobile-runtime'
import AuthLegalStrip from '../components/AuthLegalStrip'
import LanguageSwitcher from '../components/LanguageSwitcher'

const SESSION_NOTICE_KEY = 'akoenet_session_notice'
const LEGACY_SESSION_NOTICE_KEYS = ['akonet_session_notice', 'Akonet_session_notice']
const TWITCH_OAUTH_ERR_KEY = 'akoenet_twitch_oauth_error'
const PENDING_INVITE_KEY = 'akoenet_pending_invite'

function readPendingInviteFromSession() {
  try {
    return sessionStorage.getItem(PENDING_INVITE_KEY)
  } catch {
    return null
  }
}

export default function Login() {
  const { login, completeLogin2fa, user, loading } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [twoFactorToken, setTwoFactorToken] = useState(null)
  const [code2fa, setCode2fa] = useState('')
  const [twitchConfigured, setTwitchConfigured] = useState(null)
  /** Exact OAuth redirect_uri the backend sends to Twitch (from /auth/twitch/status). */
  const [twitchOAuthRedirectUri, setTwitchOAuthRedirectUri] = useState(null)
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
    setError(t('login.twitchSignInFailed', { code }))
  }, [t])

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
        if (cancelled) return
        setTwitchConfigured(Boolean(data?.configured))
        const ru = data?.redirectUri != null ? String(data.redirectUri).trim() : ''
        if (ru) setTwitchOAuthRedirectUri(ru)
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
      let loggedInUser
      if (twoFactorToken) {
        loggedInUser = await completeLogin2fa(twoFactorToken, code2fa.trim())
        setTwoFactorToken(null)
        setCode2fa('')
      } else {
        const result = await login(email, password)
        if (result?.requires2fa) {
          setTwoFactorToken(result.twoFactorToken)
          setBusy(false)
          return
        }
        loggedInUser = result.user
      }
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
      navigate(postAuthDestination(loggedInUser))
    } catch (err) {
      if (twoFactorToken) {
        setError(t('login.invalidCode'))
      } else if (!err?.response) {
        setError(t('login.cannotReachApi', { url: getApiBaseUrl() }))
      } else if (err.response.status === 401) {
        setError(t('login.invalidCredentials'))
      } else {
        setError(String(err.response?.data?.error || err.response?.data?.message || t('login.signInFailed')))
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted">{t('common.loading')}</p>
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
          <Link to="/">← {t('login.home')}</Link>
        </p>
        <h1>{twoFactorToken ? t('login.twoFactorTitle') : t('login.title')}</h1>
        <p className="muted">
          {searchParams.get(INVITE_QUERY_PARAM) || readPendingInviteFromSession()
            ? t('login.leadInvite')
            : t('login.leadDefault')}
        </p>
        <form onSubmit={onSubmit} className="form-stack">
          {notice && <div className="info-banner">{notice}</div>}
          {error && <div className="error-banner">{error}</div>}
          {twoFactorToken ? (
            <>
              <p className="muted small">{t('login.twoFactorHint')}</p>
              <label>
                {t('login.twoFactorCode')}
                <input
                  name="totp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code2fa}
                  onChange={(e) => setCode2fa(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? t('login.signingIn') : t('login.verify')}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setTwoFactorToken(null)
                  setCode2fa('')
                  setError('')
                }}
              >
                {t('login.back')}
              </button>
            </>
          ) : (
            <>
          <label>
            {t('login.email')}
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
            {t('login.password')}
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
            {busy ? t('login.signingIn') : t('login.signIn')}
          </button>
          <button
            type="button"
            className="btn twitch"
            disabled={twitchConfigured !== true}
            title={twitchConfigured === false ? t('login.twitchDisabledTitle') : undefined}
            onClick={() => {
              const inv = searchParams.get(INVITE_QUERY_PARAM)
              if (inv) {
                try {
                  sessionStorage.setItem(PENDING_INVITE_KEY, inv)
                } catch {
                  /* ignore */
                }
              }
              const nativeFlow = isCapacitorNative()
              window.location.href = nativeFlow
                ? `${apiBase}/auth/twitch/start?native=1`
                : `${apiBase}/auth/twitch/start`
            }}
          >
            {twitchConfigured === null
              ? t('login.twitchChecking')
              : twitchConfigured === false
                ? t('login.twitchUnavailable')
                : t('login.twitchSignIn')}
          </button>
          {twitchConfigured === false && (
            <p className="muted small" style={{ marginTop: '0.5rem' }}>
              {t('login.twitchHelpBeforeUri')}{' '}
              <code>{twitchOAuthRedirectUri || `${apiBase}/auth/twitch/callback`}</code>
              {twitchOAuthRedirectUri?.includes('/api/user/') ? (
                <>
                  {' '}
                  ({t('login.twitchHelpMountNote')})
                </>
              ) : null}
              {isTauri() ? (
                <>
                  {' '}
                  {t('login.twitchHelpDesktopNote')}
                </>
              ) : null}
            </p>
          )}
            </>
          )}
        </form>
        {!twoFactorToken && (
        <p className="muted small">
          {t('login.noAccount')}{' '}
          <Link
            to={
              searchParams.get(INVITE_QUERY_PARAM)
                ? `/register?${INVITE_QUERY_PARAM}=${encodeURIComponent(searchParams.get(INVITE_QUERY_PARAM))}`
                : '/register'
            }
          >
            {t('login.signUp')}
          </Link>
        </p>
        )}
        <AuthLegalStrip />
      </div>
    </div>
  )
}
