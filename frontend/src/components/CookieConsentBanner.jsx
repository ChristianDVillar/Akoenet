import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLandingLocale } from '../hooks/useLandingLocale'

const CONSENT_KEY = 'akoenet_cookie_consent_v1'

const COPY = {
  en: {
    text: 'We use local storage and technical cookies for session and preferences. See ',
    privacy: 'Privacy',
    accept: 'Accept',
    aria: 'Cookie consent',
  },
  es: {
    text: 'Usamos almacenamiento local/cookies técnicas para sesión y preferencias. Consulta ',
    privacy: 'Privacidad',
    accept: 'Aceptar',
    aria: 'Consentimiento de cookies',
  },
}

export default function CookieConsentBanner() {
  const { locale } = useLandingLocale()
  const t = COPY[locale === 'es' ? 'es' : 'en']
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONSENT_KEY)
      if (!saved) setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

  function accept() {
    try {
      localStorage.setItem(CONSENT_KEY, 'accepted')
    } catch {
      /* ignore */
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="cookie-banner" role="dialog" aria-live="polite" aria-label={t.aria}>
      <p>
        {t.text}
        <Link to="/legal/privacidad">{t.privacy}</Link>.
      </p>
      <button type="button" className="btn primary small" onClick={accept}>
        {t.accept}
      </button>
    </div>
  )
}
