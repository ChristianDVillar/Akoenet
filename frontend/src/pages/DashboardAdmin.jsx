import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'

function StatusBadge({ ok, label }) {
  return <span className={`status-badge ${ok ? 'ok' : 'fail'}`}>{label}</span>
}

function Latency({ ms }) {
  if (ms === null || ms === undefined) return <span className="muted small">n/a</span>
  return <span className="status-latency">{ms} ms</span>
}

export default function DashboardAdmin() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [health, setHealth] = useState(null)
  const [deps, setDeps] = useState(null)
  const [history, setHistory] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditLimit, setAuditLimit] = useState(20)
  const [auditOffset, setAuditOffset] = useState(0)
  const [auditAction, setAuditAction] = useState('')
  const [auditServerId, setAuditServerId] = useState('')
  const [auditFrom, setAuditFrom] = useState('')
  const [auditTo, setAuditTo] = useState('')
  const docsUrl = `${String(api.defaults.baseURL || '').replace(/\/$/, '')}/docs`

  function pushHistory(payload) {
    setHistory((prev) => {
      const entry = {
        at: new Date().toISOString(),
        ok: payload?.ok ?? false,
        total: payload?.total_latency_ms ?? null,
      }
      return [entry, ...prev].slice(0, 10)
    })
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const auditParams = new URLSearchParams()
      auditParams.set('limit', String(auditLimit))
      auditParams.set('offset', String(auditOffset))
      if (auditAction.trim()) auditParams.set('action', auditAction.trim())
      if (auditServerId.trim()) auditParams.set('server_id', auditServerId.trim())
      if (auditFrom) auditParams.set('from', new Date(auditFrom).toISOString())
      if (auditTo) auditParams.set('to', new Date(auditTo).toISOString())

      const [healthRes, depsRes, auditRes] = await Promise.all([
        api.get('/health'),
        api.get('/admin/health/deps', {
          validateStatus: () => true,
        }),
        api.get(`/admin/audit-logs?${auditParams.toString()}`),
      ])
      setHealth(healthRes.data)
      setDeps(depsRes.data)
      setAuditLogs(Array.isArray(auditRes?.data?.items) ? auditRes.data.items : [])
      setAuditTotal(Number(auditRes?.data?.total || 0))
      pushHistory(depsRes.data)
    } catch {
      setError('Could not load system diagnostics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditLimit, auditOffset, auditAction, auditServerId, auditFrom, auditTo])

  function applyAuditFilters(e) {
    e.preventDefault()
    setAuditOffset(0)
    load()
  }

  function clearAuditFilters() {
    setAuditAction('')
    setAuditServerId('')
    setAuditFrom('')
    setAuditTo('')
    setAuditOffset(0)
  }

  const canPrev = auditOffset > 0
  const canNext = auditOffset + auditLimit < auditTotal

  return (
    <div className="auth-page">
      <div className="auth-card status-page">
        <div className="status-header">
          <h1>Admin dashboard</h1>
          <Link to="/" className="btn ghost">
            Back
          </Link>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <p className="muted">Checking services…</p>
        ) : (
          <>
            <p className="muted small">Use this panel to quickly verify dependencies and troubleshoot incidents.</p>
            <div className="status-meta">
              <span>
                <strong>Version:</strong> {deps?.version || 'unknown'}
              </span>
              <span>
                <strong>Uptime:</strong> {deps?.uptime_ms ?? 0} ms
              </span>
              <span>
                <strong>Total check:</strong> {deps?.total_latency_ms ?? 0} ms
              </span>
            </div>
            <div className="status-grid">
              <div className="status-item">
                <strong>API</strong>
                <div className="status-right">
                  <StatusBadge ok={Boolean(health?.ok)} label={health?.ok ? 'OK' : 'ERROR'} />
                  <Latency ms={deps?.deps?.api?.latency_ms} />
                </div>
              </div>
              <div className="status-item">
                <strong>Database</strong>
                <div className="status-right">
                  <StatusBadge ok={Boolean(deps?.deps?.db?.ok)} label={deps?.deps?.db?.ok ? 'OK' : 'ERROR'} />
                  <Latency ms={deps?.deps?.db?.latency_ms} />
                </div>
              </div>
              <div className="status-item">
                <strong>Redis</strong>
                <div className="status-right">
                  <StatusBadge
                    ok={Boolean(deps?.deps?.redis?.ok)}
                    label={
                      deps?.deps?.redis?.enabled
                        ? deps?.deps?.redis?.ok
                          ? 'OK'
                          : 'ERROR'
                        : 'NO CONFIG'
                    }
                  />
                  <Latency ms={deps?.deps?.redis?.latency_ms} />
                </div>
              </div>
              <div className="status-item">
                <strong>Storage ({deps?.deps?.storage?.driver || 'local'})</strong>
                <div className="status-right">
                  <StatusBadge
                    ok={Boolean(deps?.deps?.storage?.ok)}
                    label={deps?.deps?.storage?.ok ? 'OK' : 'ERROR'}
                  />
                  <Latency ms={deps?.deps?.storage?.latency_ms} />
                </div>
              </div>
              <div className="status-item">
                <strong>Streamer Scheduler API</strong>
                <div className="status-right">
                  <StatusBadge
                    ok={
                      !deps?.deps?.scheduler?.configured ||
                      Boolean(deps?.deps?.scheduler?.ok)
                    }
                    label={
                      !deps?.deps?.scheduler?.configured
                        ? 'NOT SET'
                        : deps?.deps?.scheduler?.ok
                          ? 'OK'
                          : 'ERROR'
                    }
                  />
                  <Latency ms={deps?.deps?.scheduler?.latency_ms} />
                  {deps?.deps?.scheduler?.version ? (
                    <span className="muted small" style={{ marginLeft: '0.35rem' }}>
                      {deps.deps.scheduler.service || 'scheduler'} v{deps.deps.scheduler.version}
                      {deps?.deps?.scheduler?.legacy ? ' (legacy API)' : ''}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            {deps?.deps?.scheduler?.hint ? (
              <p className="muted small" style={{ marginTop: '0.5rem' }}>
                {deps.deps.scheduler.hint}
              </p>
            ) : null}

            <div className="status-actions">
              <button type="button" className="btn secondary" onClick={load}>
                Retry
              </button>
              <a href={docsUrl} target="_blank" rel="noreferrer" className="btn ghost">
                API Docs
              </a>
            </div>

            <div className="status-history">
              <h3>Recent checks history</h3>
              {history.length === 0 ? (
                <p className="muted small">No history yet.</p>
              ) : (
                <ul>
                  {history.map((h, i) => (
                    <li key={`${h.at}-${i}`}>
                      <span>{new Date(h.at).toLocaleTimeString()}</span>
                      <span>{h.ok ? 'OK' : 'ERROR'}</span>
                      <span>{h.total ?? 'n/a'} ms</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="status-history">
              <h3>Recent moderation audit logs</h3>
              <form onSubmit={applyAuditFilters} className="form-inline" style={{ marginBottom: '0.6rem', gap: '0.4rem', flexWrap: 'wrap' }}>
                <input
                  placeholder="Action (e.g. message_pin)"
                  value={auditAction}
                  onChange={(e) => setAuditAction(e.target.value)}
                  style={{ minWidth: '180px' }}
                />
                <input
                  placeholder="Server ID"
                  value={auditServerId}
                  onChange={(e) => setAuditServerId(e.target.value)}
                  style={{ width: '120px' }}
                />
                <input
                  type="datetime-local"
                  value={auditFrom}
                  onChange={(e) => setAuditFrom(e.target.value)}
                  title="From"
                />
                <input
                  type="datetime-local"
                  value={auditTo}
                  onChange={(e) => setAuditTo(e.target.value)}
                  title="To"
                />
                <button type="submit" className="btn secondary">Apply</button>
                <button type="button" className="btn ghost" onClick={clearAuditFilters}>Clear</button>
              </form>
              {auditLogs.length === 0 ? (
                <p className="muted small">No audit logs yet.</p>
              ) : (
                <ul>
                  {auditLogs.map((log) => (
                    <li key={log.id}>
                      <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                      <span>{log.action}</span>
                      <span>{log.actor_username || `user:${log.actor_user_id}`}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="status-actions" style={{ marginTop: '0.55rem', display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!canPrev}
                  onClick={() => setAuditOffset((v) => Math.max(0, v - auditLimit))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!canNext}
                  onClick={() => setAuditOffset((v) => v + auditLimit)}
                >
                  Next
                </button>
                <span className="muted small" style={{ margin: 0 }}>
                  Showing {auditTotal === 0 ? 0 : auditOffset + 1}-{Math.min(auditOffset + auditLimit, auditTotal)} of {auditTotal}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
