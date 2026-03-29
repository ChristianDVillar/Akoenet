import { Link } from 'react-router-dom'
import SiteFooter from '../components/SiteFooter'
import { useLandingLocale } from '../hooks/useLandingLocale'
import { landingContent } from '../lib/landingContent'

const FEATURE_ICONS = ['💬', '🎙️', '🛡️', '✉️']

export default function Landing() {
  const { locale, setLocale } = useLandingLocale()
  const t = landingContent[locale]

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <span className="landing-logo">AkoeNet</span>
          <nav className="landing-nav-links" aria-label={locale === 'es' ? 'Principal' : 'Primary'}>
            <div
              className="landing-lang-toggle"
              role="group"
              aria-label={t.nav.langLabel}
            >
              <button
                type="button"
                className={`landing-lang-btn${locale === 'en' ? ' is-active' : ''}`}
                onClick={() => setLocale('en')}
                aria-pressed={locale === 'en'}
              >
                EN
              </button>
              <button
                type="button"
                className={`landing-lang-btn${locale === 'es' ? ' is-active' : ''}`}
                onClick={() => setLocale('es')}
                aria-pressed={locale === 'es'}
              >
                ES
              </button>
            </div>
            <a href="#features">{t.nav.features}</a>
            <a href="#faq">{t.nav.faq}</a>
            <Link to="/legal/terminos">{t.nav.legal}</Link>
            <Link to="/login" className="btn ghost small landing-nav-cta">
              {t.nav.signIn}
            </Link>
            <Link to="/register" className="btn primary small">
              {t.nav.signUp}
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-inner">
            <p className="landing-eyebrow">{t.hero.eyebrow}</p>
            <h1 className="landing-title">{t.hero.title}</h1>
            <p className="landing-lead">{t.hero.lead}</p>
            <div className="landing-hero-actions">
              <Link to="/register" className="btn primary landing-hero-primary">
                {t.hero.ctaPrimary}
              </Link>
              <Link to="/login" className="btn secondary">
                {t.hero.ctaSecondary}
              </Link>
            </div>
          </div>
        </section>

        <section id="features" className="landing-section landing-features">
          <div className="landing-section-inner">
            <h2 className="landing-section-title">{t.featuresTitle}</h2>
            <ul className="landing-feature-grid">
              {t.featureCards.map((card, i) => (
                <li key={card.title} className="landing-feature-card">
                  <span className="landing-feature-icon" aria-hidden>
                    {FEATURE_ICONS[i] ?? '·'}
                  </span>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="faq" className="landing-section landing-faq">
          <div className="landing-section-inner">
            <h2 className="landing-section-title">{t.faqTitle}</h2>
            <div className="landing-faq-list">
              {t.faq.map((item) => (
                <details key={item.q} className="landing-faq-item">
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
