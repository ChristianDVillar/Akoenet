import { useAuth } from '../context/AuthContext'
import Dashboard from './Dashboard'
import Landing from './Landing'

export default function Home() {
  const { user, loading, serverUnreachable, refreshUser } = useAuth()

  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted">Cargando AkoeNet…</p>
      </div>
    )
  }

  if (user) {
    return <Dashboard />
  }

  /* Siempre landing para visitantes; si la API falla, aviso en la propia landing */
  return <Landing apiUnreachable={serverUnreachable} onRetryApi={refreshUser} />
}
