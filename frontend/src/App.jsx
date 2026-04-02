import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import Home from './pages/Home'
import Messages from './pages/Messages'
import ServerView from './pages/ServerView'
import TwitchCallback from './pages/TwitchCallback'
import DashboardAdmin from './pages/DashboardAdmin'
import LegalDocPage from './pages/LegalDocPage'
import DmcaPage from './pages/DmcaPage'
import DpoPage from './pages/DpoPage'
import InvitePage from './pages/InvitePage'
import SystemStatus from './pages/SystemStatus'
import CookieConsentBanner from './components/CookieConsentBanner'
import ThemeSync from './components/ThemeSync'

function PrivateRoute({ children }) {
  const { user, loading, serverUnreachable, refreshUser } = useAuth()
  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted">Loading AkoeNet…</p>
      </div>
    )
  }
  if (!user && serverUnreachable) {
    return (
      <div className="auth-page">
        <div className="auth-card api-offline-card">
          <h1 className="api-offline-title">Can’t reach the API</h1>
          <p className="muted api-offline-copy">
            The app could not load your session. Usually the backend is still starting (for example right after{' '}
            <code className="inline-code">docker compose up</code>) or nothing is listening on the API URL.
          </p>
          <p className="muted api-offline-copy">
            Wait until the backend is healthy, then try again. Your login token is still saved in this browser.
          </p>
          <button type="button" className="btn primary api-offline-retry" onClick={() => refreshUser()}>
            Try again
          </button>
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AdminRoute({ children }) {
  const { user, loading, serverUnreachable, refreshUser } = useAuth()
  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted">Loading AkoeNet…</p>
      </div>
    )
  }
  if (!user && serverUnreachable) {
    return (
      <div className="auth-page">
        <div className="auth-card api-offline-card">
          <h1 className="api-offline-title">Can’t reach the API</h1>
          <p className="muted api-offline-copy">
            Start or restart the backend, then retry. Your session token is still stored locally.
          </p>
          <button type="button" className="btn primary api-offline-retry" onClick={() => refreshUser()}>
            Try again
          </button>
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (!user.is_admin) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <>
      <ThemeSync />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
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
            <PrivateRoute>
              <Messages />
            </PrivateRoute>
          }
        />
        <Route
          path="/server/:serverId"
          element={
            <PrivateRoute>
              <ServerView />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <DashboardAdmin />
            </AdminRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CookieConsentBanner />
    </>
  )
}
