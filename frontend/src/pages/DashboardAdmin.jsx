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

function formatNum(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString()
}

function formatUptimeMs(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return '—'
  const s = Math.floor(Number(ms) / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function KpiCard({ icon, title, value, delta, deltaLabel, sub }) {
  const d = delta
  const showDelta = d != null && !Number.isNaN(Number(d))
  return (
    <div className="admin-kpi-card">
      <div className="admin-kpi-card-head">
        <span aria-hidden>{icon}</span>
        <span>{title}</span>
      </div>
      <div className="admin-kpi-value">{value}</div>
      {showDelta ? (
        <div className={`admin-kpi-delta ${Number(d) >= 0 ? 'is-pos' : 'is-neg'}`}>
          {Number(d) >= 0 ? '+' : ''}
          {d}%
          {deltaLabel ? <span className="muted small"> {deltaLabel}</span> : null}
        </div>
      ) : null}
      {sub ? <div className="admin-kpi-sub muted">{sub}</div> : null}
    </div>
  )
}

export default function DashboardAdmin({ embedded = false }) {
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
  const [reportItems, setReportItems] = useState([])
  const [reportTotal, setReportTotal] = useState(0)
  const [reportLimit, setReportLimit] = useState(20)
  const [reportOffset, setReportOffset] = useState(0)
  const [reportStatus, setReportStatus] = useState('open')
  const [reportServerId, setReportServerId] = useState('')
  const [metrics, setMetrics] = useState(null)
  const [overview, setOverview] = useState(null)
  const [overviewEndpointAvailable, setOverviewEndpointAvailable] = useState(true)
  const [reportsEndpointAvailable, setReportsEndpointAvailable] = useState(true)
  const [metricsEndpointAvailable, setMetricsEndpointAvailable] = useState(true)
  const [loadWarnings, setLoadWarnings] = useState([])
  const docsUrl = `${String(api.defaults.baseURL || '').replace(/\/$/, '')}/docs`

  /** Axios rejects on 404 unless we accept all statuses; keeps partial UI when one admin route is missing (old deploy). */
  const acceptAllStatuses = { validateStatus: () => true }

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
    setLoadWarnings([])
    const warnings = []

    const auditParams = new URLSearchParams()
    auditParams.set('limit', String(auditLimit))
    auditParams.set('offset', String(auditOffset))
    if (auditAction.trim()) auditParams.set('action', auditAction.trim())
    if (auditServerId.trim()) auditParams.set('server_id', auditServerId.trim())
    if (auditFrom) auditParams.set('from', new Date(auditFrom).toISOString())
    if (auditTo) auditParams.set('to', new Date(auditTo).toISOString())
    const reportParams = new URLSearchParams()
    reportParams.set('limit', String(reportLimit))
    reportParams.set('offset', String(reportOffset))
    reportParams.set('status', reportStatus)
    if (reportServerId.trim()) reportParams.set('server_id', reportServerId.trim())

    try {
      const healthRes = await api.get('/health')
      setHealth(healthRes.data)
    } catch {
      setError('Could not reach API /health. Is the backend running and VITE_API_URL correct?')
      setLoading(false)
      return
    }

    try {
      const reqs = [
        api.get('/admin/health/deps', acceptAllStatuses),
        api.get(`/admin/audit-logs?${auditParams.toString()}`, acceptAllStatuses),
        reportsEndpointAvailable
          ? api.get(`/admin/reports/messages?${reportParams.toString()}`, acceptAllStatuses)
          : Promise.resolve({ status: 404, data: null }),
        metricsEndpointAvailable
          ? api.get('/admin/metrics', acceptAllStatuses)
          : Promise.resolve({ status: 404, data: null }),
        overviewEndpointAvailable
          ? api.get('/admin/overview', acceptAllStatuses)
          : Promise.resolve({ status: 404, data: null }),
      ]
      const [depsRes, auditRes, reportRes, metricsRes, overviewRes] = await Promise.all(reqs)

      const depsBody = depsRes.data && typeof depsRes.data === 'object' ? depsRes.data : null
      if (depsBody?.deps && typeof depsBody.deps === 'object') {
        setDeps(depsBody)
        pushHistory(depsBody)
      } else {
        setDeps(null)
        if (depsRes.status === 404) {
          warnings.push(
            'GET /admin/health/deps → 404. This process does not expose admin routes (outdated backend image or wrong service on this port). Redeploy the API from the current repo.'
          )
        } else if (depsRes.status === 401 || depsRes.status === 403) {
          warnings.push('Admin health denied (401/403). Sign out and sign in again with an admin account.')
        } else {
          warnings.push(`GET /admin/health/deps → HTTP ${depsRes.status}. Check server logs.`)
        }
      }

      if (auditRes.status === 200 && auditRes.data && Array.isArray(auditRes.data.items)) {
        setAuditLogs(auditRes.data.items)
        setAuditTotal(Number(auditRes.data.total || 0))
      } else {
        setAuditLogs([])
        setAuditTotal(0)
        if (auditRes.status === 404) {
          warnings.push('GET /admin/audit-logs → 404. Backend build likely predates admin.routes.')
        } else if (auditRes.status && auditRes.status !== 200) {
          warnings.push(`GET /admin/audit-logs → HTTP ${auditRes.status}.`)
        }
      }

      if (reportRes.status === 200 && reportRes.data && Array.isArray(reportRes.data.items)) {
        setReportItems(reportRes.data.items)
        setReportTotal(Number(reportRes.data.total || 0))
        setReportsEndpointAvailable(true)
      } else {
        setReportItems([])
        setReportTotal(0)
        if (reportRes.status === 404) {
          if (reportsEndpointAvailable) setReportsEndpointAvailable(false)
          warnings.push(
            'GET /admin/reports/messages → 404. Update the backend so admin message reports exist, or confirm requests hit this app (not another server on :3000).'
          )
        } else if (reportRes.status && reportRes.status !== 200) {
          warnings.push(`GET /admin/reports/messages → HTTP ${reportRes.status}.`)
        }
      }

      if (metricsRes.status === 200 && metricsRes.data && typeof metricsRes.data === 'object') {
        setMetrics(metricsRes.data)
        setMetricsEndpointAvailable(true)
      } else {
        setMetrics(null)
        if (metricsRes.status === 404) {
          if (metricsEndpointAvailable) setMetricsEndpointAvailable(false)
          warnings.push('GET /admin/metrics → 404. Same fix as other /admin/* 404s (redeploy current backend).')
        }
      }

      if (overviewRes.status === 200 && overviewRes.data?.ok) {
        setOverview(overviewRes.data)
        setOverviewEndpointAvailable(true)
      } else {
        setOverview(null)
        if (overviewRes.status === 404) {
          if (overviewEndpointAvailable) setOverviewEndpointAvailable(false)
          warnings.push(
            'GET /admin/overview → 404. Redeploy backend with latest admin routes to see KPI aggregates.'
          )
        } else if (overviewRes.status && overviewRes.status !== 200) {
          warnings.push(`GET /admin/overview → HTTP ${overviewRes.status}.`)
        }
      }

      setLoadWarnings(warnings)
    } catch {
      setError('Could not load admin endpoints (network error).')
      setLoadWarnings(warnings)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    auditLimit,
    auditOffset,
    auditAction,
    auditServerId,
    auditFrom,
    auditTo,
    reportLimit,
    reportOffset,
    reportStatus,
    reportServerId,
  ])

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

  function reportStatusLabel(metadata) {
    const status = String(metadata?.status || 'open').toLowerCase()
    if (status === 'resolved') return 'resolved'
    if (status === 'rejected') return 'rejected'
    return 'open'
  }

  async function updateReportStatus(auditId, status) {
    const note = window.prompt('Optional moderator note')
    try {
      await api.patch(`/admin/reports/messages/${auditId}`, { status, note: note || undefined })
      await load()
    } catch {
      setError('Could not update report status')
    }
  }

  const canPrev = auditOffset > 0
  const canNext = auditOffset + auditLimit < auditTotal
  const canPrevReports = reportOffset > 0
  const canNextReports = reportOffset + reportLimit < reportTotal

  const ov = overview
  const kpis = ov?.kpis
  const act = ov?.activity
  const sch = deps?.deps?.scheduler
  const pendingFromOverview = ov?.alerts?.pending_message_reports

  const content = (
    <>
      {error && <div className="error-banner">{error}</div>}
      {!loading &&
        loadWarnings.length > 0 &&
        loadWarnings.map((w) => (
          <div key={w} className="info-banner" style={{ marginBottom: '0.75rem' }}>
            {w}
          </div>
        ))}

      <div className="admin-overview">
        <div className="admin-overview-top">
          <h1 className="admin-overview-title">📊 Admin overview</h1>
          <div className="status-actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn secondary" onClick={load} disabled={loading}>
              Refrescar 🔄
            </button>
            {!embedded ? (
              <Link to="/" className="btn ghost">
                Back
              </Link>
            ) : null}
          </div>
        </div>

        {loading ? (
          <p className="muted">Checking services…</p>
        ) : (
          <>
            <div className="admin-kpi-grid">
              <KpiCard
                icon="👥"
                title="Usuarios"
                value={kpis ? formatNum(kpis.users.total) : '—'}
                delta={kpis?.users?.delta_pct_24h}
                deltaLabel="nuevos vs 24h previos"
                sub={kpis ? `${formatNum(kpis.users.new_today)} nuevos hoy (calendario)` : 'Actualiza el backend para KPIs'}
              />
              <KpiCard icon="🎫" title="Licencias" value="—" sub="No integrado en AkoeNet" />
              <KpiCard icon="💰" title="Ingresos" value="—" sub="No integrado en AkoeNet" />
              <KpiCard
                icon="💬"
                title="Mensajes"
                value={kpis ? formatNum(kpis.messages.total_in_db) : '—'}
                delta={kpis?.messages?.delta_pct_hour_vs_prior}
                deltaLabel="últ. hora vs hora anterior (DB)"
                sub={
                  kpis
                    ? `Canal ${formatNum(kpis.messages.channel_total)} · DM ${formatNum(kpis.messages.dm_total)}`
                    : 'Total en base de datos'
                }
              />
            </div>

            {deps?.deps ? (
              <div className="admin-health-strip">
                <h3>
                  <span>🟢 Health status</span>
                  <span className="muted small">
                    Última comprobación:{' '}
                    {deps.checked_at ? new Date(deps.checked_at).toLocaleString() : '—'}
                  </span>
                </h3>
                <div className="admin-health-line">
                  <span>
                    <strong>API</strong> {health?.ok ? '✅' : '❌'}{' '}
                    <Latency ms={deps.deps.api?.latency_ms} />
                  </span>
                  <span>
                    <strong>DB</strong> {deps.deps.db?.ok ? '✅' : '❌'}{' '}
                    <Latency ms={deps.deps.db?.latency_ms} />
                  </span>
                  <span>
                    <strong>Redis</strong>{' '}
                    {deps.deps.redis?.enabled ? (deps.deps.redis?.ok ? '✅' : '❌') : '⚪'}{' '}
                    <Latency ms={deps.deps.redis?.latency_ms} />
                  </span>
                  <span>
                    <strong>Storage</strong> {deps.deps.storage?.ok ? '✅' : '❌'} ({deps.deps.storage?.driver || 'local'})
                  </span>
                  <span>
                    <strong>Scheduler API</strong>{' '}
                    {!sch?.configured ? '⚪ no configurado' : sch?.ok ? '✅' : '❌'}
                    {sch?.configured && sch?.version
                      ? ` v${sch.version}${sch?.legacy ? ' (legacy)' : ''}`
                      : ''}
                  </span>
                </div>
                <p className="muted small" style={{ margin: '0.55rem 0 0' }}>
                  Uptime proceso: {formatUptimeMs(deps.uptime_ms)} · App <code className="inline-code">{deps.version || 'unknown'}</code> ·
                  chequeo total <Latency ms={deps.total_latency_ms} />
                </p>
              </div>
            ) : null}

            <div className="admin-overview-columns">
              <div className="admin-overview-panel">
                <h3>📈 Actividad reciente</h3>
                <ul>
                  <li>
                    Mensajes última hora (canal):{' '}
                    {act?.messages_last_hour ? formatNum(act.messages_last_hour.channel) : '—'}
                  </li>
                  <li>
                    DMs última hora: {act?.messages_last_hour ? formatNum(act.messages_last_hour.dm) : '—'}
                  </li>
                  <li>
                    Usuarios activos (24h, enviaron mensaje/DM):{' '}
                    {act?.users_active_24h != null ? formatNum(act.users_active_24h) : '—'}
                  </li>
                  <li>
                    Nuevos usuarios hoy: {act?.users_new_today != null ? formatNum(act.users_new_today) : '—'}
                  </li>
                  {kpis ? (
                    <li>Servidores totales: {formatNum(kpis.servers_total)}</li>
                  ) : null}
                  {metrics ? (
                    <li className="muted small" style={{ listStyle: 'none', paddingLeft: 0 }}>
                      Proceso (no persistente): últimos ~60s canal {metrics.messages_last_60s?.channel ?? 0} · DM{' '}
                      {metrics.messages_last_60s?.dm ?? 0}
                    </li>
                  ) : null}
                </ul>
              </div>
              <div className="admin-overview-panel">
                <h3>⚠️ Alertas y pendientes</h3>
                <ul>
                  <li>Licencias por vencer: no aplica (producto sin licencias)</li>
                  <li>
                    Reportes de mensajes pendientes:{' '}
                    {pendingFromOverview != null ? formatNum(pendingFromOverview) : '—'}
                  </li>
                  <li>Usuarios con contraseña débil: no comprobado</li>
                  {sch?.configured && sch?.legacy ? (
                    <li>Scheduler API en modo legacy (discovery ausente o antiguo)</li>
                  ) : null}
                  {sch?.configured && sch?.hint ? <li>{sch.hint}</li> : null}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>

      {!loading && (
        <>
            <p className="muted small" style={{ marginTop: '1rem' }}>
              Use this panel to verify dependencies, audit logs, and message reports. Licencias e ingresos son placeholders
              hasta que exista integración comercial.
            </p>
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
            {metrics && (
              <div className="status-meta" style={{ marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <span>
                  <strong>Msgs (total):</strong> ch {metrics.messages_total?.channel ?? 0} · dm{' '}
                  {metrics.messages_total?.dm ?? 0}
                </span>
                <span>
                  <strong>Msgs (last ~60s):</strong> ch {metrics.messages_last_60s?.channel ?? 0} · dm{' '}
                  {metrics.messages_last_60s?.dm ?? 0}
                </span>
                <span className="muted small">
                  Process uptime: {Math.round((metrics.uptime_ms || 0) / 1000)}s (resets on deploy)
                </span>
              </div>
            )}
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
              {deps?.deps?.scheduler?.admin_url ? (
                <a
                  href={deps.deps.scheduler.admin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn ghost"
                >
                  Scheduler Admin
                </a>
              ) : null}
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
            <div className="status-history">
              <h3>Message reports moderation</h3>
              {!reportsEndpointAvailable ? (
                <p className="muted small">
                  Message reports endpoint is not available in this backend build (`/admin/reports/messages` returns
                  404).
                </p>
              ) : null}
              <form onSubmit={(e) => e.preventDefault()} className="form-inline" style={{ marginBottom: '0.6rem', gap: '0.4rem', flexWrap: 'wrap' }}>
                <select value={reportStatus} onChange={(e) => { setReportStatus(e.target.value); setReportOffset(0) }}>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                  <option value="rejected">Rejected</option>
                  <option value="all">All</option>
                </select>
                <input
                  placeholder="Server ID"
                  value={reportServerId}
                  onChange={(e) => { setReportServerId(e.target.value); setReportOffset(0) }}
                  style={{ width: '120px' }}
                />
                <button type="button" className="btn ghost" onClick={load}>Refresh</button>
              </form>
              {reportItems.length === 0 ? (
                <p className="muted small">No reports found.</p>
              ) : (
                <ul>
                  {reportItems.map((r) => (
                    <li key={`report-${r.id}`}>
                      <span>{new Date(r.created_at).toLocaleTimeString()}</span>
                      <span>
                        {r.report_action === 'dm_message_report_user' ? 'DM' : 'Channel'} · #{r.id} · msg:
                        {r.target_message_id ?? 'n/a'} · by {r.reporter_username || `user:${r.reporter_user_id}`}
                      </span>
                      <span>{reportStatusLabel(r.metadata)}</span>
                      <span style={{ display: 'inline-flex', gap: '0.35rem' }}>
                        <button type="button" className="btn ghost small" onClick={() => updateReportStatus(r.id, 'resolved')}>Resolve</button>
                        <button type="button" className="btn ghost small" onClick={() => updateReportStatus(r.id, 'rejected')}>Reject</button>
                        <button type="button" className="btn ghost small" onClick={() => updateReportStatus(r.id, 'open')}>Reopen</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="status-actions" style={{ marginTop: '0.55rem', display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!canPrevReports}
                  onClick={() => setReportOffset((v) => Math.max(0, v - reportLimit))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!canNextReports}
                  onClick={() => setReportOffset((v) => v + reportLimit)}
                >
                  Next
                </button>
                <span className="muted small" style={{ margin: 0 }}>
                  Showing {reportTotal === 0 ? 0 : reportOffset + 1}-{Math.min(reportOffset + reportLimit, reportTotal)} of {reportTotal}
                </span>
              </div>
            </div>
        </>
      )}
    </>
  )

  if (embedded) {
    return <section className="card status-page status-page--wide">{content}</section>
  }

  return (
    <div className="auth-page">
      <div className="auth-card status-page status-page--wide">{content}</div>
    </div>
  )
}
