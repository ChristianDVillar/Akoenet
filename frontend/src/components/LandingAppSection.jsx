import { useCallback, useEffect, useState } from 'react'
import {
  getLandingDeviceKind,
  isAndroidBrowser,
  isIosBrowser,
  isStandalonePwa,
} from '../lib/landingDevice'

/**
 * Sección “descargar / instalar app”: copia distinta para móvil vs PC y PWA (Chrome/Edge).
 */
const desktopDocsUrl = import.meta.env.VITE_DESKTOP_BUILD_DOCS_URL
const desktopInstallerUrl = import.meta.env.VITE_DESKTOP_INSTALLER_URL

export default function LandingAppSection({ t }) {
  const a = t.appSection
  const [kind, setKind] = useState(() => getLandingDeviceKind())
  const [standalone, setStandalone] = useState(() => isStandalonePwa())
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installOutcome, setInstallOutcome] = useState(null)

  const isMobile = kind === 'mobile' || kind === 'tablet'
  const mobileOs = isIosBrowser() ? 'ios' : isAndroidBrowser() ? 'android' : 'other'

  useEffect(() => {
    setKind(getLandingDeviceKind())
    setStandalone(isStandalonePwa())
  }, [])

  useEffect(() => {
    const onBip = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  const runInstall = useCallback(async () => {
    if (!deferredPrompt) return
    setInstallOutcome(null)
    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      setInstallOutcome(outcome === 'accepted' ? 'accepted' : 'dismissed')
    } catch {
      setInstallOutcome('error')
    }
    setDeferredPrompt(null)
  }, [deferredPrompt])

  if (standalone) {
    return (
      <section id="app" className="landing-section landing-app" aria-labelledby="landing-app-title">
        <div className="landing-section-inner landing-app-inner">
          <p className="landing-app-standalone">{a.standaloneNote}</p>
        </div>
      </section>
    )
  }

  return (
    <section id="app" className="landing-section landing-app" aria-labelledby="landing-app-title">
      <div className="landing-section-inner landing-app-inner">
        <h2 id="landing-app-title" className="landing-section-title">
          {a.title}
        </h2>
        <p className="landing-app-lead">{a.lead}</p>

        {isMobile ? (
          <div className="landing-app-columns">
            <div className="landing-app-card">
              <h3 className="landing-app-card-title">{a.mobile.pwaTitle}</h3>
              {mobileOs === 'ios' ? (
                <p className="landing-app-card-body">{a.mobile.pwaBodyIOS}</p>
              ) : mobileOs === 'android' ? (
                <p className="landing-app-card-body">{a.mobile.pwaBodyAndroid}</p>
              ) : (
                <p className="landing-app-card-body">{a.mobile.pwaBodyOther}</p>
              )}
            </div>
            <div className="landing-app-card landing-app-card--muted">
              <h3 className="landing-app-card-title">{a.mobile.roadmapTitle}</h3>
              <p className="landing-app-card-body">{a.mobile.roadmapBody}</p>
            </div>
          </div>
        ) : (
          <div className="landing-app-columns">
            <div className="landing-app-card">
              <h3 className="landing-app-card-title">{a.desktop.pwaTitle}</h3>
              <p className="landing-app-card-body">{a.desktop.pwaBody}</p>
              {deferredPrompt ? (
                <button type="button" className="btn primary landing-app-install-btn" onClick={() => void runInstall()}>
                  {a.desktop.installCta}
                </button>
              ) : (
                <p className="landing-app-hint">{a.desktop.installFallback}</p>
              )}
              {installOutcome === 'accepted' ? (
                <p className="landing-app-toast ok">{a.desktop.installAccepted}</p>
              ) : null}
              {installOutcome === 'dismissed' ? (
                <p className="landing-app-toast muted">{a.desktop.installDismissed}</p>
              ) : null}
            </div>
            <div className="landing-app-card landing-app-card--muted landing-app-card--desktop-native">
              <h3 className="landing-app-card-title">{a.desktop.nativeTitle}</h3>
              <p className="landing-app-card-body">
                {desktopInstallerUrl ? a.desktop.nativeBodyHosted : a.desktop.nativeBody}
              </p>
              {desktopInstallerUrl ? (
                <a
                  className="btn primary landing-app-native-download"
                  href={desktopInstallerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {a.desktop.nativeDownloadCta}
                </a>
              ) : null}
              {desktopDocsUrl ? (
                <a
                  className="landing-app-native-docs"
                  href={desktopDocsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {a.desktop.nativeDocsCta}
                </a>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
