import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import SiteFooter from '../components/SiteFooter'

const REQUEST_TYPES = [
  { value: 'general', label: 'General privacy question' },
  { value: 'access', label: 'Access (copy of data)' },
  { value: 'rectification', label: 'Rectification' },
  { value: 'erasure', label: 'Erasure' },
  { value: 'portability', label: 'Portability' },
  { value: 'objection', label: 'Objection' },
  { value: 'restriction', label: 'Restriction' },
]

export default function DpoPage() {
  const [contact, setContact] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    request_type: 'general',
  })
  const [sent, setSent] = useState(false)
  const [refId, setRefId] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.get('/dpo/contact')
        if (!cancelled) setContact(data)
      } catch {
        if (!cancelled) setLoadError('Could not load DPO contact details.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data } = await api.post('/dpo/message', {
        ...form,
        subject: form.subject.trim() || null,
      })
      setRefId(data.reference_id)
      setSent(true)
    } catch (err) {
      const d = err.response?.data
      const msg =
        d?.details?.map((x) => x.message).join(' ') || d?.message || d?.error || 'Could not send your message.'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="auth-page legal-form-page">
        <div className="auth-card legal-form-card">
          <h1>Message sent</h1>
          <p className="muted">
            Reference id: <strong>{refId}</strong>
          </p>
          <p className="muted small">
            If a reply is required, we will use the email address you provided. Keep this reference for follow-up.
          </p>
          <Link to="/" className="btn primary">
            Home
          </Link>
        </div>
        <SiteFooter />
      </div>
    )
  }

  return (
    <div className="auth-page legal-form-page">
      <div className="auth-card legal-form-card">
        <p className="muted small" style={{ marginBottom: '0.75rem' }}>
          <Link to="/">← Home</Link>
        </p>
        <h1>Data protection contact</h1>
        <p className="muted small">
          For GDPR-related requests and privacy questions about this service. This form records your message for our
          records; we do not use it for marketing.
        </p>

        {loadError && <div className="error-banner inline">{loadError}</div>}

        {contact && (
          <section className="legal-dpo-contact" aria-label="Published contact">
            {contact.name ? (
              <p>
                <strong>{contact.name}</strong>
              </p>
            ) : null}
            {contact.email ? (
              <p>
                Email:{' '}
                <a href={`mailto:${contact.email}`} className="link-inline">
                  {contact.email}
                </a>
              </p>
            ) : null}
            {contact.phone ? <p>Phone: {contact.phone}</p> : null}
            {contact.address ? <p className="muted small">{contact.address}</p> : null}
            {contact.note ? <p className="muted small">{contact.note}</p> : null}
          </section>
        )}

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={onSubmit} className="form-stack legal-form-stack">
          <label>
            Your name *
            <input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              required
              minLength={2}
              autoComplete="name"
            />
          </label>
          <label>
            Your email *
            <input
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Subject (optional)
            <input
              value={form.subject}
              onChange={(e) => setField('subject', e.target.value)}
              maxLength={500}
            />
          </label>
          <label>
            Type of request
            <select value={form.request_type} onChange={(e) => setField('request_type', e.target.value)}>
              {REQUEST_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Message *
            <textarea
              value={form.message}
              onChange={(e) => setField('message', e.target.value)}
              required
              rows={6}
              minLength={10}
            />
          </label>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send message'}
          </button>
        </form>

        <p className="muted small legal-dpo-lookup">
          To check status later (with the email you used here):{' '}
          <code className="inline-code">GET /dpo/request/&lt;id&gt;?email=…</code> (API) or ask support with your
          reference id.
        </p>
      </div>
      <SiteFooter />
    </div>
  )
}
