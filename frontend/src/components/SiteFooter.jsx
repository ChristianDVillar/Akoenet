import { Link } from 'react-router-dom'
import { useLandingLocale } from '../hooks/useLandingLocale'
import { footerContent } from '../lib/landingContent'

const author = import.meta.env.VITE_APP_AUTHOR || 'Christian'

export default function SiteFooter({ className = '' }) {
  const { locale } = useLandingLocale()
  const f = footerContent[locale]
  const v = __APP_VERSION__
  const year = new Date().getFullYear()
  const rootClass = ['site-footer', className].filter(Boolean).join(' ')

  return (
    <footer className={rootClass}>
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <span className="site-footer-name">AkoeNet</span>
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
          <Link to="/status">{f.status}</Link>
        </nav>
        <p className="site-footer-copyright muted small">
          © {year} <strong>{author}</strong>. {f.copyrightReserved} {f.copyrightSubject}{' '}
          <Link to="/legal/terminos">{f.terms}</Link> {f.copyrightBetweenLinks}{' '}
          <Link to="/legal/privacidad">{f.privacy}</Link>.
        </p>
        <p className="site-footer-disclaimer">{f.independentNotice}</p>
        <p className="site-footer-disclaimer site-footer-trademark">{f.twitchDisclaimer}</p>
      </div>
    </footer>
  )
}
