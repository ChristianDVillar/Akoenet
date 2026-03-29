import { Link, Navigate, useParams } from 'react-router-dom'
import SiteFooter from '../components/SiteFooter'
import privacidadMd from '../../../docs/legal/PRIVACIDAD.md?raw'
import proteccionMd from '../../../docs/legal/PROTECCION_LEGAL.md?raw'
import terminosMd from '../../../docs/legal/TERMINOS_Y_CONDICIONES.md?raw'

const DOCS = {
  privacidad: { title: 'Política de privacidad', body: privacidadMd },
  terminos: { title: 'Términos y condiciones', body: terminosMd },
  proteccion: { title: 'Protección legal', body: proteccionMd },
}

export default function LegalDocPage() {
  const { slug } = useParams()
  const doc = DOCS[slug]

  if (!doc) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="legal-doc-page">
      <header className="legal-doc-header">
        <Link to="/" className="legal-doc-back">
          ← Inicio
        </Link>
        <h1>{doc.title}</h1>
      </header>
      <article className="legal-doc-body">
        <pre className="legal-doc-pre">{doc.body}</pre>
      </article>
      <SiteFooter className="legal-doc-footer" />
    </div>
  )
}
