import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import SiteFooter from '../components/SiteFooter'
import { useLandingLocale } from '../hooks/useLandingLocale'
import { landingContent } from '../lib/landingContent'
import LandingAppSection from '../components/LandingAppSection'
import { inviteLandingPath, parseInviteTokenFromInput } from '../lib/invites'

const FEATURE_ICONS = ['💬', '🎙️', '🛡️', '✉️']

function LandingInviteStrip({ t }) {
  const navigate = useNavigate()
  const [raw, setRaw] = useState('')
  const [err, setErr] = useState('')
  function onSubmit(e) {
    e.preventDefault()
    const token = parseInviteTokenFromInput(raw)
    if (!token) {
      setErr(t.inviteJoin.error)
      return
    }
    setErr('')
    navigate(inviteLandingPath(token))
  }
  return (
    <section className="landing-invite-join" aria-labelledby="landing-invite-heading">
      <div className="landing-invite-join-inner">
        <h2 id="landing-invite-heading" className="landing-invite-join-title">
          {t.inviteJoin.title}
        </h2>
        <p className="landing-invite-join-hint">{t.inviteJoin.hint}</p>
        <form onSubmit={onSubmit} className="landing-invite-join-form">
          <input
            type="text"
            name="invite_paste"
            autoComplete="off"
            placeholder={t.inviteJoin.placeholder}
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value)
              if (err) setErr('')
            }}
            className="landing-invite-join-input"
          />
          <button type="submit" className="btn primary landing-invite-join-btn">
            {t.inviteJoin.button}
          </button>
        </form>
        {err ? <p className="landing-invite-join-err">{err}</p> : null}
      </div>
    </section>
  )
}

export default function Landing({ apiUnreachable = false, onRetryApi }) {
  const { locale, setLocale } = useLandingLocale()
  const t = landingContent[locale]

  return (
    <div className="landing-page">
      {apiUnreachable && (
        <div className="landing-api-offline" role="alert">
          <p>{t.apiOfflineBanner.message}</p>
          {typeof onRetryApi === 'function' && (
            <button type="button" className="btn secondary small" onClick={() => onRetryApi()}>
              {t.apiOfflineBanner.retry}
            </button>
          )}
        </div>
      )}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <span className="landing-logo">
            <span className="landing-logo-text">AkoeNet</span>
            <img src="/Akoenet.png" alt="" className="landing-logo-mark" aria-hidden="true" />
          </span>
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
            <a href="#app">{t.nav.app}</a>
            <a href="#faq">{t.nav.faq}</a>
            <Link to="/legal/terminos">{t.nav.terms}</Link>
            <Link to="/legal/privacidad">{t.nav.privacy}</Link>
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

        <LandingInviteStrip t={t} />

        <LandingAppSection t={t} />

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
