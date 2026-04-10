import { resolveAuthFooterLocale } from '../lib/landingContent'

/**
 * Short © + terms/privacy line for auth pages (locale from browser language).
 */
export default function AuthLegalStrip() {
  const loc = resolveAuthFooterLocale()
  const copyrightLine =
    loc === 'es'
      ? '© 2026 Dakinis Systems (marca comercial de Christian Villar). Todos los derechos reservados.'
      : '© 2026 Dakinis Systems (trading name of Christian Villar). All rights reserved.'

  return (
    <div className="auth-legal-block">
      <img className="auth-legal-logo" src="/Logo Grande.jpeg" alt="Dakinis Systems" loading="lazy" />
      <p className="auth-legal-strip muted small">{copyrightLine}</p>
    </div>
  )
}
