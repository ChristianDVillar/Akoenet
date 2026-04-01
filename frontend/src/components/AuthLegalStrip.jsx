import { Link } from 'react-router-dom'
import { authFooter, resolveAuthFooterLocale } from '../lib/landingContent'

const author = import.meta.env.VITE_APP_AUTHOR || 'Christian'

/**
 * Short © + terms/privacy line for auth pages (locale from browser language).
 */
export default function AuthLegalStrip() {
  const loc = resolveAuthFooterLocale()
  const t = authFooter[loc]
  const year = new Date().getFullYear()

  return (
    <p className="auth-legal-strip muted small">
      © {year} <strong>{author}</strong>. {t.copyrightReserved} {t.copyrightSubject}{' '}
      <Link to="/legal/terminos">{t.terms}</Link> {t.copyrightBetweenLinks}{' '}
      <Link to="/legal/privacidad">{t.privacy}</Link>.
    </p>
  )
}
