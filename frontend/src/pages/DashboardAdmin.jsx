import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../services/api'

function StatusBadge({ ok, label }) {
  return <span className={`status-badge ${ok ? 'ok' : 'fail'}`}>{label}</span>
}

function Latency({ ms }) {
  const { t } = useTranslation()
  if (ms === null || ms === undefined) return <span className="muted small">{t('admin.na')}</span>
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
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [health, setHealth] = useState(null)
  const [deps, setDeps] = useState(null)
  const [history, setHistory] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditLimit] = useState(20)
  const [auditOffset, setAuditOffset] = useState(0)
  const [auditAction, setAuditAction] = useState('')
  const [auditServerId, setAuditServerId] = useState('')
  const [auditFrom, setAuditFrom] = useState('')
  const [auditTo, setAuditTo] = useState('')
  const [reportItems, setReportItems] = useState([])
  const [reportTotal, setReportTotal] = useState(0)
  const [reportLimit] = useState(20)
  const [reportOffset, setReportOffset] = useState(0)
  const [reportStatus, setReportStatus] = useState('open')
  const [reportServerId, setReportServerId] = useState('')
  const [metrics, setMetrics] = useState(null)
  const [pushDebug, setPushDebug] = useState(null)
  const [overview, setOverview] = useState(null)
  const [overviewEndpointAvailable, setOverviewEndpointAvailable] = useState(true)
  const [reportsEndpointAvailable, setReportsEndpointAvailable] = useState(true)
  const [metricsEndpointAvailable, setMetricsEndpointAvailable] = useState(true)
  const [pushDebugEndpointAvailable, setPushDebugEndpointAvailable] = useState(true)
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
      setError(t('admin.errHealth'))
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
        pushDebugEndpointAvailable
          ? api.get('/admin/push/debug', acceptAllStatuses)
          : Promise.resolve({ status: 404, data: null }),
        overviewEndpointAvailable
          ? api.get('/admin/overview', acceptAllStatuses)
          : Promise.resolve({ status: 404, data: null }),
      ]
      const [depsRes, auditRes, reportRes, metricsRes, pushDebugRes, overviewRes] = await Promise.all(reqs)

      const depsBody = depsRes.data && typeof depsRes.data === 'object' ? depsRes.data : null
      if (depsBody?.deps && typeof depsBody.deps === 'object') {
        setDeps(depsBody)
        pushHistory(depsBody)
      } else {
        setDeps(null)
        if (depsRes.status === 404) {
          warnings.push(t('admin.warnDeps404'))
        } else if (depsRes.status === 401 || depsRes.status === 403) {
          warnings.push(t('admin.warnDeps403'))
        } else {
          warnings.push(t('admin.warnDepsHttp', { status: depsRes.status }))
        }
      }

      if (auditRes.status === 200 && auditRes.data && Array.isArray(auditRes.data.items)) {
        setAuditLogs(auditRes.data.items)
        setAuditTotal(Number(auditRes.data.total || 0))
      } else {
        setAuditLogs([])
        setAuditTotal(0)
        if (auditRes.status === 404) {
          warnings.push(t('admin.warnAudit404'))
        } else if (auditRes.status && auditRes.status !== 200) {
          warnings.push(t('admin.warnAuditHttp', { status: auditRes.status }))
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
          warnings.push(t('admin.warnReports404'))
        } else if (reportRes.status && reportRes.status !== 200) {
          warnings.push(t('admin.warnReportsHttp', { status: reportRes.status }))
        }
      }

      if (metricsRes.status === 200 && metricsRes.data && typeof metricsRes.data === 'object') {
        setMetrics(metricsRes.data)
        setMetricsEndpointAvailable(true)
      } else {
        setMetrics(null)
        if (metricsRes.status === 404) {
          if (metricsEndpointAvailable) setMetricsEndpointAvailable(false)
          warnings.push(t('admin.warnMetrics404'))
        }
      }

      if (pushDebugRes.status === 200 && pushDebugRes.data && typeof pushDebugRes.data === 'object') {
        setPushDebug(pushDebugRes.data)
        setPushDebugEndpointAvailable(true)
      } else {
        setPushDebug(null)
        if (pushDebugRes.status === 404) {
          if (pushDebugEndpointAvailable) setPushDebugEndpointAvailable(false)
          warnings.push(t('admin.warnPushDebug404'))
        } else if (pushDebugRes.status && pushDebugRes.status !== 200) {
          warnings.push(t('admin.warnPushDebugHttp', { status: pushDebugRes.status }))
        }
      }

      if (overviewRes.status === 200 && overviewRes.data?.ok) {
        setOverview(overviewRes.data)
        setOverviewEndpointAvailable(true)
      } else {
        setOverview(null)
        if (overviewRes.status === 404) {
          if (overviewEndpointAvailable) setOverviewEndpointAvailable(false)
          warnings.push(t('admin.warnOverview404'))
        } else if (overviewRes.status && overviewRes.status !== 200) {
          warnings.push(t('admin.warnOverviewHttp', { status: overviewRes.status }))
        }
      }

      setLoadWarnings(warnings)
    } catch {
      setError(t('admin.errAdminLoad'))
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
    t,
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
    if (status === 'resolved') return t('admin.reportTagResolved')
    if (status === 'rejected') return t('admin.reportTagRejected')
    return t('admin.reportTagOpen')
  }

  async function updateReportStatus(auditId, status) {
    const note = window.prompt(t('admin.promptModeratorNote'))
    try {
      await api.patch(`/admin/reports/messages/${auditId}`, { status, note: note || undefined })
      await load()
    } catch {
      setError(t('admin.errUpdateReport'))
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
          <h1 className="admin-overview-title">📊 {t('admin.title')}</h1>
          <div className="status-actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn secondary" onClick={load} disabled={loading}>
              {t('admin.refresh')} 🔄
            </button>
            {!embedded ? (
              <Link to="/" className="btn ghost">
                {t('admin.back')}
              </Link>
            ) : null}
          </div>
        </div>

        {loading ? (
          <p className="muted">{t('admin.checking')}</p>
        ) : (
          <>
            <div className="admin-kpi-grid">
              <KpiCard
                icon="👥"
                title={t('admin.kpiUsers')}
                value={kpis ? formatNum(kpis.users.total) : '—'}
                delta={kpis?.users?.delta_pct_24h}
                deltaLabel={t('admin.kpiUsersDelta')}
                sub={
                  kpis
                    ? t('admin.kpiUsersSubNew', { count: formatNum(kpis.users.new_today) })
                    : t('admin.kpiUsersSubFallback')
                }
              />
              <KpiCard icon="🎫" title={t('admin.kpiLicenses')} value="—" sub={t('admin.kpiLicensesSub')} />
              <KpiCard icon="💰" title={t('admin.kpiRevenue')} value="—" sub={t('admin.kpiRevenueSub')} />
              <KpiCard
                icon="💬"
                title={t('admin.kpiMessages')}
                value={kpis ? formatNum(kpis.messages.total_in_db) : '—'}
                delta={kpis?.messages?.delta_pct_hour_vs_prior}
                deltaLabel={t('admin.kpiMessagesDelta')}
                sub={
                  kpis
                    ? t('admin.kpiMessagesSub', {
                        ch: formatNum(kpis.messages.channel_total),
                        dm: formatNum(kpis.messages.dm_total),
                      })
                    : t('admin.kpiMessagesSubTotal')
                }
              />
            </div>

            {deps?.deps ? (
              <div className="admin-health-strip">
                <h3>
                  <span>🟢 {t('admin.healthTitle')}</span>
                  <span className="muted small">
                    {t('admin.healthLastCheck')}{' '}
                    {deps.checked_at ? new Date(deps.checked_at).toLocaleString() : '—'}
                  </span>
                </h3>
                <div className="admin-health-line">
                  <span>
                    <strong>{t('admin.healthApi')}</strong> {health?.ok ? '✅' : '❌'}{' '}
                    <Latency ms={deps.deps.api?.latency_ms} />
                  </span>
                  <span>
                    <strong>{t('admin.healthDb')}</strong> {deps.deps.db?.ok ? '✅' : '❌'}{' '}
                    <Latency ms={deps.deps.db?.latency_ms} />
                  </span>
                  <span>
                    <strong>{t('admin.healthRedis')}</strong>{' '}
                    {deps.deps.redis?.enabled ? (deps.deps.redis?.ok ? '✅' : '❌') : '⚪'}{' '}
                    <Latency ms={deps.deps.redis?.latency_ms} />
                  </span>
                  <span>
                    <strong>{t('admin.healthStorage')}</strong> {deps.deps.storage?.ok ? '✅' : '❌'} (
                    {deps.deps.storage?.driver || 'local'})
                  </span>
                  <span>
                    <strong>{t('admin.healthScheduler')}</strong>{' '}
                    {!sch?.configured ? `⚪ ${t('admin.schedulerNotConfigured')}` : sch?.ok ? '✅' : '❌'}
                    {sch?.configured && sch?.version
                      ? ` v${sch.version}${sch?.legacy ? ` ${t('admin.schedulerLegacy')}` : ''}`
                      : ''}
                  </span>
                </div>
                <p className="muted small" style={{ margin: '0.55rem 0 0' }}>
                  {t('admin.healthFooterProcess')} {formatUptimeMs(deps.uptime_ms)} · {t('admin.healthFooterApp')}{' '}
                  <code className="inline-code">{deps.version || 'unknown'}</code> · {t('admin.healthFooterCheck')}{' '}
                  <Latency ms={deps.total_latency_ms} />
                </p>
              </div>
            ) : null}

            <div className="admin-overview-columns">
              <div className="admin-overview-panel">
                <h3>📈 {t('admin.activityTitle')}</h3>
                <ul>
                  <li>
                    {t('admin.actMsgHourCh')}{' '}
                    {act?.messages_last_hour ? formatNum(act.messages_last_hour.channel) : '—'}
                  </li>
                  <li>
                    {t('admin.actMsgHourDm')} {act?.messages_last_hour ? formatNum(act.messages_last_hour.dm) : '—'}
                  </li>
                  <li>
                    {t('admin.actUsers24h')}{' '}
                    {act?.users_active_24h != null ? formatNum(act.users_active_24h) : '—'}
                  </li>
                  <li>
                    {t('admin.actNewUsersToday')} {act?.users_new_today != null ? formatNum(act.users_new_today) : '—'}
                  </li>
                  {kpis ? (
                    <li>
                      {t('admin.actServersTotal')} {formatNum(kpis.servers_total)}
                    </li>
                  ) : null}
                  {metrics ? (
                    <li className="muted small" style={{ listStyle: 'none', paddingLeft: 0 }}>
                      {t('admin.actMetricsProcess', {
                        ch: metrics.messages_last_60s?.channel ?? 0,
                        dm: metrics.messages_last_60s?.dm ?? 0,
                      })}
                    </li>
                  ) : null}
                </ul>
              </div>
              <div className="admin-overview-panel">
                <h3>⚠️ {t('admin.alertsTitle')}</h3>
                <ul>
                  <li>{t('admin.alertLicenses')}</li>
                  <li>
                    {t('admin.alertReportsPending')}{' '}
                    {pendingFromOverview != null ? formatNum(pendingFromOverview) : '—'}
                  </li>
                  <li>{t('admin.alertWeakPw')}</li>
                  {sch?.configured && sch?.legacy ? <li>{t('admin.alertSchedulerLegacy')}</li> : null}
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
              {t('admin.footerHint')}
            </p>
            <div className="status-meta">
              <span>
                <strong>{t('admin.metaVersion')}</strong> {deps?.version || 'unknown'}
              </span>
              <span>
                <strong>{t('admin.metaUptime')}</strong> {deps?.uptime_ms ?? 0} ms
              </span>
              <span>
                <strong>{t('admin.metaTotalCheck')}</strong> {deps?.total_latency_ms ?? 0} ms
              </span>
            </div>
            {metrics && (
              <div className="status-meta" style={{ marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <span>
                  <strong>{t('admin.metaMsgsTotal')}</strong> ch {metrics.messages_total?.channel ?? 0} · dm{' '}
                  {metrics.messages_total?.dm ?? 0}
                </span>
                <span>
                  <strong>{t('admin.metaMsgs60')}</strong> ch {metrics.messages_last_60s?.channel ?? 0} · dm{' '}
                  {metrics.messages_last_60s?.dm ?? 0}
                </span>
                <span className="muted small">
                  {t('admin.metaProcessUptime', { sec: Math.round((metrics.uptime_ms || 0) / 1000) })}
                </span>
              </div>
            )}
            <div className="status-history">
              <h3>{t('admin.mobileStatusTitle')}</h3>
              {!pushDebugEndpointAvailable ? (
                <p className="muted small">{t('admin.mobileStatus404')}</p>
              ) : pushDebug ? (
                <>
                  <div className="status-grid">
                    <div className="status-item">
                      <strong>{t('admin.mobileAndroidFcm')}</strong>
                      <div className="status-right">
                        <StatusBadge
                          ok={Boolean(pushDebug?.configured?.android_fcm)}
                          label={pushDebug?.configured?.android_fcm ? t('admin.statusOk') : t('admin.statusError')}
                        />
                      </div>
                    </div>
                    <div className="status-item">
                      <strong>{t('admin.mobileWebPush')}</strong>
                      <div className="status-right">
                        <StatusBadge
                          ok={Boolean(pushDebug?.configured?.web_push_vapid)}
                          label={pushDebug?.configured?.web_push_vapid ? t('admin.statusOk') : t('admin.statusError')}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="status-meta" style={{ marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    <span>
                      <strong>{t('admin.mobileNativeTokens')}</strong>{' '}
                      {formatNum(pushDebug?.subscriptions?.native_total ?? 0)}
                    </span>
                    <span>
                      <strong>{t('admin.mobileAndroidTokens')}</strong>{' '}
                      {formatNum(pushDebug?.subscriptions?.native_android_total ?? 0)}
                    </span>
                    <span>
                      <strong>{t('admin.mobileIosTokens')}</strong>{' '}
                      {formatNum(pushDebug?.subscriptions?.native_ios_total ?? 0)}
                    </span>
                    <span>
                      <strong>{t('admin.mobileUsersAndroid')}</strong>{' '}
                      {formatNum(pushDebug?.users?.with_android_native ?? 0)}
                    </span>
                  </div>
                  <p className="muted small" style={{ marginTop: '0.5rem' }}>
                    {t('admin.mobileHint')}
                  </p>
                </>
              ) : (
                <p className="muted small">{t('admin.na')}</p>
              )}
            </div>
            <div className="status-grid">
              <div className="status-item">
                <strong>{t('admin.healthApi')}</strong>
                <div className="status-right">
                  <StatusBadge
                    ok={Boolean(health?.ok)}
                    label={health?.ok ? t('admin.statusOk') : t('admin.statusError')}
                  />
                  <Latency ms={deps?.deps?.api?.latency_ms} />
                </div>
              </div>
              <div className="status-item">
                <strong>{t('admin.healthDb')}</strong>
                <div className="status-right">
                  <StatusBadge
                    ok={Boolean(deps?.deps?.db?.ok)}
                    label={deps?.deps?.db?.ok ? t('admin.statusOk') : t('admin.statusError')}
                  />
                  <Latency ms={deps?.deps?.db?.latency_ms} />
                </div>
              </div>
              <div className="status-item">
                <strong>{t('admin.healthRedis')}</strong>
                <div className="status-right">
                  <StatusBadge
                    ok={Boolean(deps?.deps?.redis?.ok)}
                    label={
                      deps?.deps?.redis?.enabled
                        ? deps?.deps?.redis?.ok
                          ? t('admin.statusOk')
                          : t('admin.statusError')
                        : t('admin.statusNoConfig')
                    }
                  />
                  <Latency ms={deps?.deps?.redis?.latency_ms} />
                </div>
              </div>
              <div className="status-item">
                <strong>
                  {t('admin.healthStorage')} ({deps?.deps?.storage?.driver || 'local'})
                </strong>
                <div className="status-right">
                  <StatusBadge
                    ok={Boolean(deps?.deps?.storage?.ok)}
                    label={deps?.deps?.storage?.ok ? t('admin.statusOk') : t('admin.statusError')}
                  />
                  <Latency ms={deps?.deps?.storage?.latency_ms} />
                </div>
              </div>
              <div className="status-item">
                <strong>{t('admin.healthScheduler')}</strong>
                <div className="status-right">
                  <StatusBadge
                    ok={
                      !deps?.deps?.scheduler?.configured ||
                      Boolean(deps?.deps?.scheduler?.ok)
                    }
                    label={
                      !deps?.deps?.scheduler?.configured
                        ? t('admin.statusNotSet')
                        : deps?.deps?.scheduler?.ok
                          ? t('admin.statusOk')
                          : t('admin.statusError')
                    }
                  />
                  <Latency ms={deps?.deps?.scheduler?.latency_ms} />
                  {deps?.deps?.scheduler?.version ? (
                    <span className="muted small" style={{ marginLeft: '0.35rem' }}>
                      {deps.deps.scheduler.service || t('admin.schedulerFallback')} v{deps.deps.scheduler.version}
                      {deps?.deps?.scheduler?.legacy ? ` ${t('admin.legacyApi')}` : ''}
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
                {t('admin.retry')}
              </button>
              <a href={docsUrl} target="_blank" rel="noreferrer" className="btn ghost">
                {t('admin.apiDocs')}
              </a>
              {deps?.deps?.scheduler?.admin_url ? (
                <a
                  href={deps.deps.scheduler.admin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn ghost"
                >
                  {t('admin.schedulerAdmin')}
                </a>
              ) : null}
            </div>

            <div className="status-history">
              <h3>{t('admin.historyChecksTitle')}</h3>
              {history.length === 0 ? (
                <p className="muted small">{t('admin.historyEmpty')}</p>
              ) : (
                <ul>
                  {history.map((h, i) => (
                    <li key={`${h.at}-${i}`}>
                      <span>{new Date(h.at).toLocaleTimeString()}</span>
                      <span>{h.ok ? t('admin.statusOk') : t('admin.statusError')}</span>
                      <span>{h.total ?? t('admin.na')} ms</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="status-history">
              <h3>{t('admin.auditTitle')}</h3>
              <form onSubmit={applyAuditFilters} className="form-inline" style={{ marginBottom: '0.6rem', gap: '0.4rem', flexWrap: 'wrap' }}>
                <input
                  placeholder={t('admin.auditActionPh')}
                  value={auditAction}
                  onChange={(e) => setAuditAction(e.target.value)}
                  style={{ minWidth: '180px' }}
                />
                <input
                  placeholder={t('admin.auditServerIdPh')}
                  value={auditServerId}
                  onChange={(e) => setAuditServerId(e.target.value)}
                  style={{ width: '120px' }}
                />
                <input
                  type="datetime-local"
                  value={auditFrom}
                  onChange={(e) => setAuditFrom(e.target.value)}
                  title={t('admin.auditFromTitle')}
                />
                <input
                  type="datetime-local"
                  value={auditTo}
                  onChange={(e) => setAuditTo(e.target.value)}
                  title={t('admin.auditToTitle')}
                />
                <button type="submit" className="btn secondary">
                  {t('admin.apply')}
                </button>
                <button type="button" className="btn ghost" onClick={clearAuditFilters}>
                  {t('admin.clear')}
                </button>
              </form>
              {auditLogs.length === 0 ? (
                <p className="muted small">{t('admin.auditEmpty')}</p>
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
                  {t('admin.previous')}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!canNext}
                  onClick={() => setAuditOffset((v) => v + auditLimit)}
                >
                  {t('admin.next')}
                </button>
                <span className="muted small" style={{ margin: 0 }}>
                  {t('admin.showingRange', {
                    from: auditTotal === 0 ? 0 : auditOffset + 1,
                    to: Math.min(auditOffset + auditLimit, auditTotal),
                    total: auditTotal,
                  })}
                </span>
              </div>
            </div>
            <div className="status-history">
              <h3>{t('admin.reportsTitle')}</h3>
              {!reportsEndpointAvailable ? (
                <p className="muted small">{t('admin.reports404')}</p>
              ) : null}
              <form onSubmit={(e) => e.preventDefault()} className="form-inline" style={{ marginBottom: '0.6rem', gap: '0.4rem', flexWrap: 'wrap' }}>
                <select value={reportStatus} onChange={(e) => { setReportStatus(e.target.value); setReportOffset(0) }}>
                  <option value="open">{t('admin.reportStatusOpen')}</option>
                  <option value="resolved">{t('admin.reportStatusResolved')}</option>
                  <option value="rejected">{t('admin.reportStatusRejected')}</option>
                  <option value="all">{t('admin.reportStatusAll')}</option>
                </select>
                <input
                  placeholder={t('admin.auditServerIdPh')}
                  value={reportServerId}
                  onChange={(e) => { setReportServerId(e.target.value); setReportOffset(0) }}
                  style={{ width: '120px' }}
                />
                <button type="button" className="btn ghost" onClick={load}>
                  {t('common.refresh')}
                </button>
              </form>
              {reportItems.length === 0 ? (
                <p className="muted small">{t('admin.reportsEmpty')}</p>
              ) : (
                <ul>
                  {reportItems.map((r) => (
                    <li key={`report-${r.id}`}>
                      <span>{new Date(r.created_at).toLocaleTimeString()}</span>
                      <span>
                        {r.report_action === 'dm_message_report_user'
                          ? t('admin.reportLineDm')
                          : t('admin.reportLineChannel')}{' '}
                        · #{r.id} · {t('admin.reportLineMsg')}
                        {r.target_message_id ?? t('admin.reportLineNa')} · {t('admin.reportLineBy')}{' '}
                        {r.reporter_username || `user:${r.reporter_user_id}`}
                      </span>
                      <span>{reportStatusLabel(r.metadata)}</span>
                      <span style={{ display: 'inline-flex', gap: '0.35rem' }}>
                        <button type="button" className="btn ghost small" onClick={() => updateReportStatus(r.id, 'resolved')}>
                          {t('admin.resolve')}
                        </button>
                        <button type="button" className="btn ghost small" onClick={() => updateReportStatus(r.id, 'rejected')}>
                          {t('admin.reject')}
                        </button>
                        <button type="button" className="btn ghost small" onClick={() => updateReportStatus(r.id, 'open')}>
                          {t('admin.reopen')}
                        </button>
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
                  {t('admin.previous')}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!canNextReports}
                  onClick={() => setReportOffset((v) => v + reportLimit)}
                >
                  {t('admin.next')}
                </button>
                <span className="muted small" style={{ margin: 0 }}>
                  {t('admin.showingRange', {
                    from: reportTotal === 0 ? 0 : reportOffset + 1,
                    to: Math.min(reportOffset + reportLimit, reportTotal),
                    total: reportTotal,
                  })}
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
