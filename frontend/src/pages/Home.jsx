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

  if (!user && serverUnreachable) {
    return (
      <div className="auth-page">
        <div className="auth-card api-offline-card">
          <h1 className="api-offline-title">No hay conexión con la API</h1>
          <p className="muted api-offline-copy">
            La app no pudo validar tu sesión. Suele ocurrir si el backend aún arranca (por ejemplo tras{' '}
            <code className="inline-code">docker compose up</code>) o la URL del API no es correcta.
          </p>
          <p className="muted api-offline-copy">
            Espera a que el backend responda y reintenta. Si tenías sesión, el token sigue guardado en este
            navegador.
          </p>
          <button type="button" className="btn primary api-offline-retry" onClick={() => refreshUser()}>
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (user) {
    return <Dashboard />
  }

  return <Landing />
}
