import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LegalTermsGate from '../components/LegalTermsGate'
import Dashboard from './Dashboard'
import Landing from './Landing'
import InvitePage from './InvitePage'
import { INVITE_QUERY_PARAM } from '../lib/invites'

export default function Home() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const inviteFromQuery = searchParams.get(INVITE_QUERY_PARAM)
  const { user, loading, serverUnreachable, refreshUser } = useAuth()

  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted">{t('app.loadingAkoeNet')}</p>
      </div>
    )
  }

  if (user?.needs_terms_acceptance) {
    return <LegalTermsGate />
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
