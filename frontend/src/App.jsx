import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from './context/AuthContext'
import CookieConsentBanner from './components/CookieConsentBanner'
import ThemeSync from './components/ThemeSync'
import LegalTermsGate from './components/LegalTermsGate'
import { useEffect } from 'react'
import api from './services/api'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import DashboardAdmin from './pages/DashboardAdmin'
import InvitePage from './pages/InvitePage'
import { initMobileIntegrations } from './services/mobile-integrations'
import { reportError } from './lib/reportError'

const RegisterComplete = lazy(() => import('./pages/RegisterComplete'))
const Messages = lazy(() => import('./pages/Messages'))
const ServerView = lazy(() => import('./pages/ServerView'))
const TwitchCallback = lazy(() => import('./pages/TwitchCallback'))
const LegalDocPage = lazy(() => import('./pages/LegalDocPage'))
const DmcaPage = lazy(() => import('./pages/DmcaPage'))
const DpoPage = lazy(() => import('./pages/DpoPage'))
const SystemStatus = lazy(() => import('./pages/SystemStatus'))

function PageFallback() {
  const { t } = useTranslation()
  return (
    <div className="auth-page">
      <p className="muted">{t('app.loadingAkoeNet')}</p>
    </div>
  )
}

/**
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @param {boolean} [props.requireAdmin]
 */
function AuthGateRoute({ children, requireAdmin = false }) {
  const { t } = useTranslation()
  const { user, loading, serverUnreachable, refreshUser } = useAuth()

  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted">{t('app.loadingAkoeNet')}</p>
      </div>
    )
  }

  if (!user && serverUnreachable) {
    return (
      <div className="auth-page">
        <div className="auth-card api-offline-card">
          <h1 className="api-offline-title">{t('app.apiOfflineTitle')}</h1>
          {requireAdmin ? (
            <p className="muted api-offline-copy">{t('app.apiOfflineBodyAdmin')}</p>
          ) : (
            <>
              <p className="muted api-offline-copy">{t('app.apiOfflineBodyMember1')}</p>
              <p className="muted api-offline-copy">{t('app.apiOfflineBodyMember2')}</p>
            </>
          )}
          <button type="button" className="btn primary api-offline-retry" onClick={() => refreshUser()}>
            {t('app.tryAgain')}
          </button>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (user.needs_terms_acceptance) return <LegalTermsGate />
  if (requireAdmin && !user.is_admin) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const navigate = useNavigate()

  useEffect(() => {
    let cleanup = null
    initMobileIntegrations((to) => navigate(to)).then((fn) => {
      cleanup = fn
    }).catch((err) => {
      reportError('mobileIntegrations.init', err)
    })
    return () => {
      try {
        cleanup?.()
      } catch (err) {
        reportError('mobileIntegrations.cleanup', err)
      }
    }
  }, [navigate])

  useEffect(() => {
    const onMobilePushToken = (event) => {
      const token = String(event?.detail?.token || '').trim()
      const platform = String(event?.detail?.platform || '').trim().toLowerCase()
      const device_id = String(event?.detail?.device_id || '').trim()
      const app_version = String(event?.detail?.app_version || '').trim()
      if (!token || (platform !== 'android' && platform !== 'ios')) return
      api
        .post('/auth/push/native/subscribe', {
          token,
          platform,
          device_id: device_id || undefined,
          app_version: app_version || undefined,
          device_name: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        })
        .catch((err) => reportError('push.native.subscribe', err))
    }
    window.addEventListener('akoenet:mobile-push-token', onMobilePushToken)
    return () => {
      window.removeEventListener('akoenet:mobile-push-token', onMobilePushToken)
    }
  }, [])

  return (
    <>
      <ThemeSync />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/register/complete" element={<RegisterComplete />} />
          <Route path="/auth/twitch/callback" element={<TwitchCallback />} />
          <Route path="/legal/dmca" element={<DmcaPage />} />
          <Route path="/legal/dpo" element={<DpoPage />} />
          <Route path="/legal/:slug" element={<LegalDocPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/status" element={<SystemStatus />} />
          <Route path="/" element={<Home />} />
          <Route
            path="/messages"
            element={
              <AuthGateRoute>
                <Messages />
              </AuthGateRoute>
            }
          />
          <Route
            path="/server/:serverId"
            element={
              <AuthGateRoute>
                <ServerView />
              </AuthGateRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AuthGateRoute requireAdmin>
                <DashboardAdmin />
              </AuthGateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <CookieConsentBanner />
    </>
  )
}
