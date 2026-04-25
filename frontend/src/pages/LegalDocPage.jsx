import { Link, Navigate, useParams } from 'react-router-dom'
import SiteFooter from '../components/SiteFooter'
import { useLandingLocale } from '../hooks/useLandingLocale'
import privacidadMd from '../../../docs/legal/PRIVACIDAD.md?raw'
import privacidadEn from '../../../docs/legal/PRIVACIDAD.en.md?raw'
import proteccionMd from '../../../docs/legal/PROTECCION_LEGAL.md?raw'
import proteccionEn from '../../../docs/legal/PROTECCION_LEGAL.en.md?raw'
import terminosMd from '../../../docs/legal/TERMINOS_Y_CONDICIONES.md?raw'
import terminosEn from '../../../docs/legal/TERMINOS_Y_CONDICIONES.en.md?raw'
import cookiesMd from '../../../docs/legal/POLITICA_COOKIES.md?raw'
import cookiesEn from '../../../docs/legal/POLITICA_COOKIES.en.md?raw'
import moderacionMd from '../../../docs/legal/MODERACION_CONTENIDOS.md?raw'
import moderacionEn from '../../../docs/legal/MODERACION_CONTENIDOS.en.md?raw'
import accountDeletionMd from '../../../docs/legal/ACCOUNT_DELETION.md?raw'
import accountDeletionEn from '../../../docs/legal/ACCOUNT_DELETION.en.md?raw'

const DOCS = {
  privacidad: {
    es: { title: 'Política de privacidad', body: privacidadMd },
    en: { title: 'Privacy Policy', body: privacidadEn },
  },
  terminos: {
    es: { title: 'Términos y condiciones', body: terminosMd },
    en: { title: 'Terms of Service', body: terminosEn },
  },
  proteccion: {
    es: { title: 'Protección legal', body: proteccionMd },
    en: { title: 'Legal notice', body: proteccionEn },
  },
  cookies: {
    es: { title: 'Política de cookies', body: cookiesMd },
    en: { title: 'Cookie policy', body: cookiesEn },
  },
  moderacion: {
    es: { title: 'Moderación de contenidos', body: moderacionMd },
    en: { title: 'Content moderation', body: moderacionEn },
  },
  'account-deletion': {
    es: { title: 'Eliminación de cuenta', body: accountDeletionMd },
    en: { title: 'Account deletion', body: accountDeletionEn },
  },
}

export default function LegalDocPage() {
  const { slug } = useParams()
  const { locale, setLocale } = useLandingLocale()
  const lang = locale === 'es' ? 'es' : 'en'
  const docSet = DOCS[slug]

  if (!docSet) {
    return <Navigate to="/" replace />
  }

  const doc = docSet[lang] || docSet.es
  const backLabel = locale === 'es' ? '← Inicio' : '← Home'

  return (
    <div className="legal-doc-page">
      <header className="legal-doc-header">
        <Link to="/" className="legal-doc-back">
          {backLabel}
        </Link>
        <p className="legal-doc-lang-toggle muted small" role="navigation" aria-label="Document language">
          <button
            type="button"
            className={`legal-doc-lang-btn${locale === 'en' ? ' legal-doc-lang-btn--active' : ''}`}
            onClick={() => setLocale('en')}
          >
            English
          </button>
          <span className="legal-doc-lang-sep" aria-hidden>
            ·
          </span>
          <button
            type="button"
            className={`legal-doc-lang-btn${locale === 'es' ? ' legal-doc-lang-btn--active' : ''}`}
            onClick={() => setLocale('es')}
          >
            Español
          </button>
        </p>
        <h1>{doc.title}</h1>
      </header>
      <article className="legal-doc-body">
        <pre className="legal-doc-pre">{doc.body}</pre>
      </article>
      <SiteFooter className="legal-doc-footer" />
    </div>
  )
}
