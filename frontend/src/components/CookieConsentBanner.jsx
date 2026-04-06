import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLandingLocale } from '../hooks/useLandingLocale'

const CONSENT_V1_KEY = 'akoenet_cookie_consent_v1'
const CONSENT_V2_KEY = 'akoenet_cookie_consent_v2'

function parseV2(raw) {
  if (!raw || typeof raw !== 'string') return null
  try {
    const j = JSON.parse(raw)
    if (j && j.v === 2 && typeof j.analytics === 'boolean') return j
  } catch {
    /* ignore */
  }
  return null
}

const COPY = {
  en: {
    text: 'We use strictly necessary local storage for login, session, and core preferences. Optional analytics cookies are not loaded unless you allow them. See our ',
    cookies: 'Cookie Policy',
    and: ' and ',
    privacy: 'Privacy Policy',
    reject: 'Reject non-essential',
    accept: 'Accept all',
    configure: 'Settings',
    aria: 'Cookie and storage consent',
    configTitle: 'Cookie categories',
    necessary: 'Strictly necessary',
    necessaryDesc: 'Required for sign-in, security, and basic UI. Cannot be turned off.',
    optional: 'Optional analytics',
    optionalDesc: 'We do not load third-party analytics in the default build. If enabled later, this choice will apply.',
    savePrefs: 'Save preferences',
    closeConfig: 'Close',
  },
  es: {
    text: 'Usamos almacenamiento local estrictamente necesario para inicio de sesion, seguridad y preferencias basicas. Las cookies de analitica opcionales no se cargan si no las aceptas. Consulta la ',
    cookies: 'Politica de cookies',
    and: ' y la ',
    privacy: 'Politica de privacidad',
    reject: 'Rechazar no esenciales',
    accept: 'Aceptar todas',
    configure: 'Configurar',
    aria: 'Consentimiento de cookies y almacenamiento',
    configTitle: 'Categorias de cookies',
    necessary: 'Estrictamente necesarias',
    necessaryDesc: 'Imprescindibles para entrar, seguridad e interfaz. No se pueden desactivar.',
    optional: 'Analitica opcional',
    optionalDesc: 'En el build por defecto no cargamos analitica de terceros. Si se activara, respetaremos esta eleccion.',
    savePrefs: 'Guardar preferencias',
    closeConfig: 'Cerrar',
  },
}

export default function CookieConsentBanner() {
  const { locale } = useLandingLocale()
  const t = COPY[locale === 'es' ? 'es' : 'en']
  const [visible, setVisible] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [analyticsOptIn, setAnalyticsOptIn] = useState(false)

  useEffect(() => {
    try {
      const v2 = parseV2(localStorage.getItem(CONSENT_V2_KEY))
      if (v2) {
        setVisible(false)
        return
      }
      const v1 = localStorage.getItem(CONSENT_V1_KEY)
      if (v1 === 'accepted') {
        const migrated = JSON.stringify({ v: 2, essential: true, analytics: true })
        localStorage.setItem(CONSENT_V2_KEY, migrated)
        setVisible(false)
        return
      }
      setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

  function persist(allowAnalytics) {
    try {
      localStorage.setItem(
        CONSENT_V2_KEY,
        JSON.stringify({ v: 2, essential: true, analytics: Boolean(allowAnalytics) })
      )
    } catch {
      /* ignore */
    }
    setShowConfig(false)
    setVisible(false)
  }

  function rejectNonEssential() {
    persist(false)
  }

  function acceptAll() {
    persist(true)
  }

  function saveFromConfig() {
    persist(analyticsOptIn)
  }

  if (!visible) return null

  return (
    <div className="cookie-banner" role="dialog" aria-live="polite" aria-label={t.aria}>
      <div className="cookie-banner-main">
        <p className="cookie-banner-text">
          {t.text}
          <Link to="/legal/cookies">{t.cookies}</Link>
          {t.and}
          <Link to="/legal/privacidad">{t.privacy}</Link>.
        </p>
        {!showConfig ? (
          <div className="cookie-banner-actions">
            <button type="button" className="btn ghost small" onClick={rejectNonEssential}>
              {t.reject}
            </button>
            <button type="button" className="btn ghost small" onClick={() => setShowConfig(true)}>
              {t.configure}
            </button>
            <button type="button" className="btn primary small" onClick={acceptAll}>
              {t.accept}
            </button>
          </div>
        ) : (
          <div className="cookie-banner-config" role="region" aria-label={t.configTitle}>
            <p className="cookie-banner-config-intro muted small">{t.configTitle}</p>
            <label className="cookie-banner-row">
              <input type="checkbox" checked disabled />
              <span>
                <strong>{t.necessary}</strong> — {t.necessaryDesc}
              </span>
            </label>
            <label className="cookie-banner-row">
              <input
                type="checkbox"
                checked={analyticsOptIn}
                onChange={(e) => setAnalyticsOptIn(e.target.checked)}
              />
              <span>
                <strong>{t.optional}</strong> — {t.optionalDesc}
              </span>
            </label>
            <div className="cookie-banner-actions cookie-banner-actions--config">
              <button type="button" className="btn ghost small" onClick={() => setShowConfig(false)}>
                {t.closeConfig}
              </button>
              <button type="button" className="btn primary small" onClick={saveFromConfig}>
                {t.savePrefs}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
