import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Dashboard from './Dashboard'
import Landing from './Landing'
import InvitePage from './InvitePage'
import { INVITE_QUERY_PARAM } from '../lib/invites'

export default function Home() {
  const [searchParams] = useSearchParams()
  const inviteFromQuery = searchParams.get(INVITE_QUERY_PARAM)
  const { user, loading, serverUnreachable, refreshUser } = useAuth()

  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted">Cargando AkoeNet…</p>
      </div>
    )
  }

  if (inviteFromQuery) {
    return <InvitePage />
  }

  if (user) {
    return <Dashboard />
  }

  /* Siempre landing para visitantes; si la API falla, aviso en la propia landing */
  return <Landing apiUnreachable={serverUnreachable} onRetryApi={refreshUser} />
}
