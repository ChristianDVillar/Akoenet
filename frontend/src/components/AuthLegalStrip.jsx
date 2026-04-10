import { DAKINIS_SYSTEMS_URL, resolveAuthFooterLocale } from '../lib/landingContent'

/**
 * Short © + terms/privacy line for auth pages (locale from browser language).
 */
export default function AuthLegalStrip() {
  const loc = resolveAuthFooterLocale()
  const copyrightRest =
    loc === 'es'
      ? '(marca comercial de Christian Villar). Todos los derechos reservados.'
      : '(trading name of Christian Villar). All rights reserved.'

  return (
    <div className="auth-legal-block">
      <a
        className="brand-site-link"
        href={DAKINIS_SYSTEMS_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img className="auth-legal-logo" src="/Logo Grande.jpeg" alt="Dakinis Systems" loading="lazy" />
      </a>
      <p className="auth-legal-strip muted small">
        © 2026{' '}
        <a href={DAKINIS_SYSTEMS_URL} target="_blank" rel="noopener noreferrer">
          Dakinis Systems
        </a>{' '}
        {copyrightRest}
      </p>
    </div>
  )
}
