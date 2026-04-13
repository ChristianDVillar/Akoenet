import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

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

export default function CookieConsentBanner() {
  const { t } = useTranslation()
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
    <div className="cookie-banner" role="dialog" aria-live="polite" aria-label={t('cookieConsent.aria')}>
      <div className="cookie-banner-main">
        <p className="cookie-banner-text">
          {t('cookieConsent.lead')}
          <Link to="/legal/cookies">{t('cookieConsent.cookiesLink')}</Link>
          {t('cookieConsent.between')}
          <Link to="/legal/privacidad">{t('cookieConsent.privacyLink')}</Link>
          {t('cookieConsent.trailing')}
        </p>
        {!showConfig ? (
          <div className="cookie-banner-actions">
            <button type="button" className="btn ghost small" onClick={rejectNonEssential}>
              {t('cookieConsent.reject')}
            </button>
            <button type="button" className="btn ghost small" onClick={() => setShowConfig(true)}>
              {t('cookieConsent.configure')}
            </button>
            <button type="button" className="btn primary small" onClick={acceptAll}>
              {t('cookieConsent.accept')}
            </button>
          </div>
        ) : (
          <div className="cookie-banner-config" role="region" aria-label={t('cookieConsent.configTitle')}>
            <p className="cookie-banner-config-intro muted small">{t('cookieConsent.configTitle')}</p>
            <label className="cookie-banner-row">
              <input type="checkbox" checked disabled />
              <span>
                <strong>{t('cookieConsent.necessary')}</strong> — {t('cookieConsent.necessaryDesc')}
              </span>
            </label>
            <label className="cookie-banner-row">
              <input
                type="checkbox"
                checked={analyticsOptIn}
                onChange={(e) => setAnalyticsOptIn(e.target.checked)}
              />
              <span>
                <strong>{t('cookieConsent.optional')}</strong> — {t('cookieConsent.optionalDesc')}
              </span>
            </label>
            <div className="cookie-banner-actions cookie-banner-actions--config">
              <button type="button" className="btn ghost small" onClick={() => setShowConfig(false)}>
                {t('cookieConsent.closeConfig')}
              </button>
              <button type="button" className="btn primary small" onClick={saveFromConfig}>
                {t('cookieConsent.savePrefs')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
