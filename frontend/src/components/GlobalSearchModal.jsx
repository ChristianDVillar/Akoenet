import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../services/api'

export default function GlobalSearchModal() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState('')

  const runSearch = useCallback(async () => {
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    setBusy(true)
    setError('')
    try {
      const { data } = await api.get('/messages/search/global', { params: { q: term, limit: 25 } })
      setResults(Array.isArray(data) ? data : [])
    } catch {
      setResults([])
      setError(t('globalSearch.errFailed'))
    } finally {
      setBusy(false)
    }
  }, [q, t])

  useEffect(() => {
    function onOpen() {
      setOpen(true)
    }
    window.addEventListener('akoenet-open-global-search', onOpen)
    return () => window.removeEventListener('akoenet-open-global-search', onOpen)
  }, [])

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      if (open && e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function hitRow(m) {
    const sid = m.server_id
    const cid = m.channel_id
    if (sid == null || cid == null) return
    navigate(`/server/${sid}?channel=${cid}`)
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      className="global-search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('globalSearch.ariaDialog')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="global-search-modal card">
        <div className="global-search-head">
          <h2 className="global-search-title">{t('globalSearch.title')}</h2>
          <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>
            {t('common.close')}
          </button>
        </div>
        <p className="muted small">{t('globalSearch.lead')}</p>
        <form
          className="global-search-form"
          onSubmit={(e) => {
            e.preventDefault()
            runSearch()
          }}
        >
          <input
            className="composer-input"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('globalSearch.placeholder')}
            aria-label={t('globalSearch.queryAria')}
          />
          <button type="submit" className="btn primary" disabled={busy || q.trim().length < 2}>
            {busy ? t('globalSearch.busy') : t('common.search')}
          </button>
        </form>
        {error && <div className="error-banner inline">{error}</div>}
        <ul className="global-search-results">
          {results.map((m) => (
            <li key={m.id}>
              <button type="button" className="global-search-hit" onClick={() => hitRow(m)}>
                <span className="global-search-hit-path">
                  {m.server_name} → #{m.channel_name}
                </span>
                <span className="global-search-hit-user">{m.username}</span>
                <span className="global-search-hit-text">
                  {m.content && m.content !== '(imagen)' ? m.content.slice(0, 160) : m.image_url ? t('common.image') : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
