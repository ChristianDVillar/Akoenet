import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from './context/AuthContext'
import CookieConsentBanner from './components/CookieConsentBanner'
import ThemeSync from './components/ThemeSync'
import LegalTermsGate from './components/LegalTermsGate'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import DashboardAdmin from './pages/DashboardAdmin'
import InvitePage from './pages/InvitePage'

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
