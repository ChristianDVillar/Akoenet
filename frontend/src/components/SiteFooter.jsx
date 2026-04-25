import { Link } from 'react-router-dom'
import { useLandingLocale } from '../hooks/useLandingLocale'
import { clientCopyrightLineParts } from '../lib/copyright'
import { DAKINIS_SYSTEMS_URL, footerContent } from '../lib/landingContent'

const legalContactEmail = String(import.meta.env.VITE_LEGAL_CONTACT_EMAIL || '').trim()

export default function SiteFooter({ className = '' }) {
  const { locale } = useLandingLocale()
  const f = footerContent[locale]
  const v = __APP_VERSION__
  const rootClass = ['site-footer', className].filter(Boolean).join(' ')
  const { year: copyrightYear, holder: copyrightHolder, suffix: copyrightSuffix } =
    clientCopyrightLineParts(locale)

  return (
    <footer className={rootClass}>
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <a
            className="brand-site-link"
            href={DAKINIS_SYSTEMS_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img className="site-footer-brand-logo" src="/Logo Grande.jpeg" alt={copyrightHolder} loading="lazy" />
          </a>
          <span className="site-footer-version" title={f.versionTitle}>
            v{v}
          </span>
        </div>
        <nav className="site-footer-nav" aria-label={f.legalNav}>
          <Link to="/legal/terminos">{f.terms}</Link>
          <span className="site-footer-dot" aria-hidden>
            ·
          </span>
          <Link to="/legal/privacidad">{f.privacy}</Link>
          <span className="site-footer-dot" aria-hidden>
            ·
          </span>
          <Link to="/legal/proteccion">{f.legal}</Link>
          <span className="site-footer-dot" aria-hidden>
            ·
          </span>
          <Link to="/legal/dmca">{f.dmca}</Link>
          <span className="site-footer-dot" aria-hidden>
            ·
          </span>
          <Link to="/legal/dpo">{f.dpo}</Link>
          <span className="site-footer-dot" aria-hidden>
            ·
          </span>
          <Link to="/legal/account-deletion">{f.accountDeletion}</Link>
          <span className="site-footer-dot" aria-hidden>
            ·
          </span>
          <Link to="/legal/cookies">{f.cookies}</Link>
          <span className="site-footer-dot" aria-hidden>
            ·
          </span>
          <Link to="/legal/moderacion">{f.moderation}</Link>
          <span className="site-footer-dot" aria-hidden>
            ·
          </span>
          <Link to="/status">{f.status}</Link>
        </nav>
        {legalContactEmail ? (
          <p className="site-footer-legal-contact muted small">
            <span className="site-footer-legal-contact-label">{f.legalContact}: </span>
            <a href={`mailto:${legalContactEmail}`}>{legalContactEmail}</a>
            <span className="site-footer-legal-contact-hint">
              {' '}
              ({locale === 'es' ? 'autoridades, contenido ilegal (DSA), consultas legales' : 'authorities, illegal content (DSA), legal notices'})
            </span>
          </p>
        ) : null}
        <p className="site-footer-copyright muted small">
          © {copyrightYear}{' '}
          <a href={DAKINIS_SYSTEMS_URL} target="_blank" rel="noopener noreferrer">
            {copyrightHolder}
          </a>{' '}
          {copyrightSuffix}
        </p>
        <p className="site-footer-disclaimer">{f.independentNotice}</p>
        <p className="site-footer-disclaimer site-footer-trademark">{f.twitchDisclaimer}</p>
      </div>
    </footer>
  )
}
