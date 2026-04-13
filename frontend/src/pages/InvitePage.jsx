import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { INVITE_QUERY_PARAM, inviteLandingPath } from '../lib/invites'
import LanguageSwitcher from '../components/LanguageSwitcher'

const PENDING_INVITE_KEY = 'akoenet_pending_invite'

export default function InvitePage() {
  const { t } = useTranslation()
  const { token: pathToken } = useParams()
  const [searchParams] = useSearchParams()
  const token = String(pathToken || searchParams.get(INVITE_QUERY_PARAM) || '').trim()
  const navigate = useNavigate()

  useEffect(() => {
    const q = searchParams.get(INVITE_QUERY_PARAM)
    if (pathToken && !q) {
      navigate(inviteLandingPath(pathToken), { replace: true })
    }
  }, [pathToken, searchParams, navigate])
  const { user, loading } = useAuth()
  const [preview, setPreview] = useState(null)
  const [fetchError, setFetchError] = useState(null)
  const [joinBusy, setJoinBusy] = useState(false)
  const [joinError, setJoinError] = useState('')

  const loadPreview = useCallback(async () => {
    setFetchError(null)
    setPreview(null)
    const tok = String(token || '').trim()
    if (!tok) {
      setFetchError('invalid')
      return
    }
    try {
      const { data } = await api.get(`/servers/invite/${encodeURIComponent(tok)}/preview`)
      setPreview(data)
    } catch (e) {
      const status = e.response?.status
      setFetchError(status === 404 ? 'not_found' : 'failed')
    }
  }, [token])

  useEffect(() => {
    loadPreview()
  }, [loadPreview])

  useEffect(() => {
    const tok = String(token || '').trim()
    if (tok && !user) {
      try {
        sessionStorage.setItem(PENDING_INVITE_KEY, tok)
      } catch {
        /* ignore */
      }
    }
  }, [token, user])

  async function join() {
    const tok = String(token || '').trim()
    if (!tok || !user) return
    setJoinError('')
    setJoinBusy(true)
    try {
      const { data } = await api.post(`/servers/invite/${encodeURIComponent(tok)}/join`)
      const sid = data?.server_id
      if (sid != null) {
        try {
          sessionStorage.removeItem(PENDING_INVITE_KEY)
        } catch {
          /* ignore */
        }
        navigate(`/server/${sid}`, { replace: true })
        return
      }
      setJoinError(t('invite.errUnexpected'))
    } catch (err) {
      const status = err.response?.status
      const msg =
        status === 409
          ? t('invite.errAlreadyIn')
          : status === 404
            ? t('invite.errInvalid')
            : status === 410
              ? t('invite.errGone')
              : t('invite.errJoin')
      setJoinError(msg)
    } finally {
      setJoinBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted">{t('invite.loading')}</p>
      </div>
    )
  }

  if (fetchError === 'invalid') {
    return (
      <div className="auth-page">
        <div className="auth-card invite-landing-card">
          <div className="auth-card-top-row" style={{ justifyContent: 'flex-end' }}>
            <LanguageSwitcher />
          </div>
          <div className="brand-block" style={{ justifyContent: 'center' }}>
            <span className="brand-akoenet">AkoeNet</span>
          </div>
          <h1>{t('invite.missingTitle')}</h1>
          <p className="muted">{t('invite.missingBody')}</p>
          <Link to="/" className="btn primary" style={{ display: 'inline-block', marginTop: '0.75rem' }}>
            {t('common.goHome')}
          </Link>
        </div>
      </div>
    )
  }

  if (fetchError === 'not_found' || fetchError === 'failed') {
    return (
      <div className="auth-page">
        <div className="auth-card invite-landing-card">
          <div className="auth-card-top-row" style={{ justifyContent: 'flex-end' }}>
            <LanguageSwitcher />
          </div>
          <div className="brand-block">
            <span className="brand-akoenet">AkoeNet</span>
          </div>
          <h1>{t('invite.unavailableTitle')}</h1>
          <p className="muted">
            {fetchError === 'not_found' ? t('invite.notFoundBody') : t('invite.failedBody')}
          </p>
          <Link to="/" className="btn primary" style={{ display: 'inline-block', marginTop: '0.75rem' }}>
            {t('common.goHome')}
          </Link>
        </div>
      </div>
    )
  }

  if (!preview && !fetchError) {
    return (
      <div className="auth-page">
        <div className="auth-card invite-landing-card">
          <div className="auth-card-top-row" style={{ justifyContent: 'flex-end' }}>
            <LanguageSwitcher />
          </div>
          <p className="muted">{t('invite.loadingInvite')}</p>
        </div>
      </div>
    )
  }

  const name = preview?.server_name || t('invite.serverFallback')

  return (
    <div className="auth-page">
      <div className="auth-card invite-landing-card">
        <div className="auth-card-top-row">
          <div className="brand-block" style={{ marginBottom: 0 }}>
            <span className="brand-akoenet">AkoeNet</span>
            <span className="brand-sub">{t('common.community')}</span>
          </div>
          <LanguageSwitcher />
        </div>
        <p className="invite-landing-kicker">{t('invite.kicker')}</p>
        <h1 className="invite-landing-title">{name}</h1>
        <p className="muted invite-landing-sub">{t('invite.sub')}</p>

        {user ? (
          <>
            {joinError && (
              <div className="error-banner" style={{ marginTop: '0.75rem' }}>
                {joinError}
              </div>
            )}
            <button type="button" className="btn primary invite-landing-cta" disabled={joinBusy} onClick={join}>
              {joinBusy ? t('invite.joinBusy') : t('invite.joinCta', { name })}
            </button>
            <p className="muted small" style={{ marginTop: '1rem' }}>
              {t('invite.signedInAs', { username: user.username })}
            </p>
          </>
        ) : (
          <>
            <p className="muted small" style={{ marginTop: '0.5rem' }}>
              {t('invite.guestHint')}
            </p>
            <div className="invite-landing-actions">
              <Link
                to={`/register?${INVITE_QUERY_PARAM}=${encodeURIComponent(String(token || ''))}`}
                className="btn primary"
              >
                {t('invite.createJoin')}
              </Link>
              <Link
                to={`/login?${INVITE_QUERY_PARAM}=${encodeURIComponent(String(token || ''))}`}
                className="btn ghost"
              >
                {t('invite.haveAccount')}
              </Link>
            </div>
          </>
        )}

        <p className="muted small" style={{ marginTop: '1.5rem' }}>
          <Link to="/">{t('invite.homeLink')}</Link>
        </p>
      </div>
    </div>
  )
}
