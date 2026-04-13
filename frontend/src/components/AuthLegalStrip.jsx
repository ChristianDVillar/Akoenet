import { clientCopyrightLineParts } from '../lib/copyright'
import { useLandingLocale } from '../hooks/useLandingLocale'
import { DAKINIS_SYSTEMS_URL } from '../lib/landingContent'

/**
 * Short © line for auth pages (follows app language from LandingLocaleProvider / localStorage).
 */
export default function AuthLegalStrip() {
  const { locale } = useLandingLocale()
  const { year: copyrightYear, holder: copyrightHolder, suffix: copyrightSuffix } =
    clientCopyrightLineParts(locale)

  return (
    <div className="auth-legal-block">
      <a
        className="brand-site-link"
        href={DAKINIS_SYSTEMS_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img className="auth-legal-logo" src="/Logo Grande.jpeg" alt={copyrightHolder} loading="lazy" />
      </a>
      <p className="auth-legal-strip muted small">
        © {copyrightYear}{' '}
        <a href={DAKINIS_SYSTEMS_URL} target="_blank" rel="noopener noreferrer">
          {copyrightHolder}
        </a>{' '}
        {copyrightSuffix}
      </p>
    </div>
  )
}
