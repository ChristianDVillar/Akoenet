import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import SiteFooter from '../components/SiteFooter'

const initial = {
  complainant_name: '',
  complainant_email: '',
  complainant_phone: '',
  copyright_holder: '',
  infringing_url: '',
  original_work_url: '',
  description: '',
  good_faith_statement: false,
  accuracy_statement: false,
  signature: '',
}

export default function DmcaPage() {
  const [form, setForm] = useState(initial)
  const [submitted, setSubmitted] = useState(false)
  const [referenceId, setReferenceId] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.good_faith_statement || !form.accuracy_statement) {
      setError('You must confirm both legal statements.')
      return
    }
    setBusy(true)
    try {
      const { data } = await api.post('/dmca/takedown', {
        ...form,
        complainant_phone: form.complainant_phone.trim() || null,
        original_work_url: form.original_work_url.trim() || null,
      })
      setReferenceId(data.reference_id)
      setSubmitted(true)
    } catch (err) {
      const d = err.response?.data
      const msg =
        d?.details?.map((x) => x.message).join(' ') || d?.message || d?.error || 'Submission failed.'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  if (submitted) {
    return (
      <div className="auth-page legal-form-page">
        <div className="auth-card legal-form-card">
          <h1>DMCA notice received</h1>
          <p className="muted">
            Reference id: <strong>{referenceId}</strong>
          </p>
          <p className="muted small">
            We will review your notice as soon as practicable. Keep this reference for follow-up.
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
        <h1>DMCA takedown notice</h1>
        <p className="muted small">
          For copyright complaints under applicable law (e.g. U.S. DMCA). Only complete this form if you are the
          rights holder or authorized to act on their behalf.
        </p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={onSubmit} className="form-stack legal-form-stack">
          <h2 className="legal-form-h2">Contact</h2>
          <label>
            Full name *
            <input
              value={form.complainant_name}
              onChange={(e) => setField('complainant_name', e.target.value)}
              required
              autoComplete="name"
            />
          </label>
          <label>
            Email *
            <input
              type="email"
              value={form.complainant_email}
              onChange={(e) => setField('complainant_email', e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Phone (optional)
            <input
              type="tel"
              value={form.complainant_phone}
              onChange={(e) => setField('complainant_phone', e.target.value)}
              autoComplete="tel"
            />
          </label>

          <h2 className="legal-form-h2">Work</h2>
          <label>
            Copyright owner *
            <input
              value={form.copyright_holder}
              onChange={(e) => setField('copyright_holder', e.target.value)}
              required
            />
          </label>
          <label>
            Original work URL (optional)
            <input
              type="url"
              value={form.original_work_url}
              onChange={(e) => setField('original_work_url', e.target.value)}
              placeholder="https://"
            />
          </label>
          <label>
            Infringing URL on AkoeNet *
            <input
              type="url"
              value={form.infringing_url}
              onChange={(e) => setField('infringing_url', e.target.value)}
              required
              placeholder="Paste link to the content"
            />
          </label>
          <label>
            Description *
            <textarea
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              required
              rows={5}
              minLength={20}
              placeholder="Identify the copyrighted work and the allegedly infringing material."
            />
          </label>

          <h2 className="legal-form-h2">Statements</h2>
          <label className="invite-toggle">
            <input
              type="checkbox"
              checked={form.good_faith_statement}
              onChange={(e) => setField('good_faith_statement', e.target.checked)}
            />
            <span>
              I have a good faith belief that use of the material is not authorized by the copyright owner, its agent,
              or the law. *
            </span>
          </label>
          <label className="invite-toggle">
            <input
              type="checkbox"
              checked={form.accuracy_statement}
              onChange={(e) => setField('accuracy_statement', e.target.checked)}
            />
            <span>
              The information in this notice is accurate, and under penalty of perjury, I am authorized to act on behalf
              of the owner of an exclusive right that is allegedly infringed. *
            </span>
          </label>
          <label>
            Electronic signature (type your full name) *
            <input
              value={form.signature}
              onChange={(e) => setField('signature', e.target.value)}
              required
              autoComplete="off"
            />
          </label>

          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Sending…' : 'Submit notice'}
          </button>
        </form>
      </div>
      <SiteFooter />
    </div>
  )
}
