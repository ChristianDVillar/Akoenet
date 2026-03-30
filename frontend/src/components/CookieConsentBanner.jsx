import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const CONSENT_KEY = 'akoenet_cookie_consent_v1'

export default function CookieConsentBanner() {
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
    <div className="cookie-banner" role="dialog" aria-live="polite" aria-label="Cookie consent">
      <p>
        Usamos almacenamiento local/cookies técnicas para sesión y preferencias. Consulta{' '}
        <Link to="/legal/privacidad">Privacidad</Link>.
      </p>
      <button type="button" className="btn primary small" onClick={accept}>
        Aceptar
      </button>
    </div>
  )
}
