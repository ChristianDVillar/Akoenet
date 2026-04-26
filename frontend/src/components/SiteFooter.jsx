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
  const primaryLinks = [
    { to: '/legal/terminos', label: f.terms },
    { to: '/legal/privacidad', label: f.privacy },
    { to: '/legal/account-deletion', label: f.accountDeletion },
    { to: '/legal/child-safety', label: f.childSafety },
    { to: '/status', label: f.status },
  ]
  const secondaryLinks = [
    { to: '/legal/proteccion', label: f.legal },
    { to: '/legal/dmca', label: f.dmca },
    { to: '/legal/dpo', label: f.dpo },
    { to: '/legal/cookies', label: f.cookies },
    { to: '/legal/moderacion', label: f.moderation },
  ]

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
        <div className="site-footer-links" role="navigation" aria-label={f.legalNav}>
          <div className="site-footer-link-group">
            <p className="site-footer-link-group-title muted small">{f.legalGroupPrimary}</p>
            <nav className="site-footer-nav" aria-label={f.legalGroupPrimary}>
            {primaryLinks.map((link, idx) => (
              <span key={link.to} className="site-footer-link-item">
                {idx > 0 ? (
                  <span className="site-footer-dot" aria-hidden>
                    ·
                  </span>
                ) : null}
                <Link to={link.to}>{link.label}</Link>
              </span>
            ))}
            </nav>
          </div>
          <div className="site-footer-link-group">
            <p className="site-footer-link-group-title muted small">{f.legalGroupSecondary}</p>
            <nav className="site-footer-nav site-footer-nav--secondary" aria-label={f.legalGroupSecondary}>
            {secondaryLinks.map((link, idx) => (
              <span key={link.to} className="site-footer-link-item">
                {idx > 0 ? (
                  <span className="site-footer-dot" aria-hidden>
                    ·
                  </span>
                ) : null}
                <Link to={link.to}>{link.label}</Link>
              </span>
            ))}
            </nav>
          </div>
        </div>
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
