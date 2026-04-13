import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { postAuthDestination } from '../lib/postAuthDestination'

/** @typedef {'connecting' | 'oauth' | 'notoken' | 'fail'} TwitchCbPhase */

export default function TwitchCallback() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { loginWithToken } = useAuth()
  const [phase, setPhase] = useState(/** @type {TwitchCbPhase} */ ('connecting'))
  const [oauthCode, setOauthCode] = useState('')

  useEffect(() => {
    const token = params.get('token')
    const error = params.get('error')

    if (error) {
      setOauthCode(error)
      setPhase('oauth')
      return
    }
    if (!token) {
      setPhase('notoken')
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const me = await loginWithToken(token)
        if (cancelled) return
        navigate(postAuthDestination(me), { replace: true })
      } catch {
        if (!cancelled) setPhase('fail')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [params, loginWithToken, navigate])

  const statusLine =
    phase === 'oauth'
      ? t('twitchCallback.errPrefix', { code: oauthCode })
      : phase === 'notoken'
        ? t('twitchCallback.noToken')
        : phase === 'fail'
          ? t('twitchCallback.failed')
          : t('twitchCallback.connecting')

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{t('twitchCallback.title')}</h1>
        <p className="muted">{statusLine}</p>
      </div>
    </div>
  )
}
