import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import api from '../services/api'
import LanguageSwitcher from '../components/LanguageSwitcher'

function StatusBadge({ ok, label }) {
  return <span className={`status-badge ${ok ? 'ok' : 'fail'}`}>{label}</span>
}

function Latency({ ms }) {
  const { t } = useTranslation()
  if (ms === null || ms === undefined) return <span className="muted small">{t('systemStatus.na')}</span>
  return <span className="status-latency">{ms} ms</span>
}

export default function SystemStatus() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [health, setHealth] = useState(null)
  const [deps, setDeps] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [healthRes, depsRes] = await Promise.all([
        api.get('/health'),
        api.get('/health/deps', {
          validateStatus: () => true,
        }),
      ])
      setHealth(healthRes.data)
      setDeps(depsRes.data)
    } catch {
      setError(t('systemStatus.errLoad'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const okLabel = t('systemStatus.ok')
  const errLabel = t('systemStatus.error')
  const noCfg = t('systemStatus.notConfigured')
  const notSet = t('systemStatus.notSet')
  const legacy = t('systemStatus.legacyApi')

  return (
    <div className="auth-page">
      <div className="auth-card status-page">
        <div className="status-header">
          <h1>{t('systemStatus.title')}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <LanguageSwitcher />
            <Link to="/" className="btn ghost">
              {t('systemStatus.back')}
            </Link>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <p className="muted">{t('systemStatus.checking')}</p>
        ) : (
          <>
            <p className="muted small">{t('systemStatus.lead')}</p>
            <div className="status-meta">
              <span>
                <strong>{t('systemStatus.version')}</strong> {deps?.version || t('systemStatus.versionUnknown')}
              </span>
              <span>
                <strong>{t('systemStatus.uptime')}</strong> {deps?.uptime_ms ?? 0} ms
              </span>
              <span>
                <strong>{t('systemStatus.totalCheck')}</strong> {deps?.total_latency_ms ?? 0} ms
              </span>
            </div>
            <div className="status-grid">
              <div className="status-item">
                <strong>{t('systemStatus.api')}</strong>
                <div className="status-right">
                  <StatusBadge ok={Boolean(health?.ok)} label={health?.ok ? okLabel : errLabel} />
                  <Latency ms={deps?.deps?.api?.latency_ms} />
                </div>
              </div>
              <div className="status-item">
                <strong>{t('systemStatus.database')}</strong>
                <div className="status-right">
                  <StatusBadge ok={Boolean(deps?.deps?.db?.ok)} label={deps?.deps?.db?.ok ? okLabel : errLabel} />
                  <Latency ms={deps?.deps?.db?.latency_ms} />
                </div>
              </div>
              <div className="status-item">
                <strong>{t('systemStatus.redis')}</strong>
                <div className="status-right">
                  <StatusBadge
                    ok={Boolean(deps?.deps?.redis?.ok)}
                    label={
                      deps?.deps?.redis?.enabled ? (deps?.deps?.redis?.ok ? okLabel : errLabel) : noCfg
                    }
                  />
                  <Latency ms={deps?.deps?.redis?.latency_ms} />
                </div>
              </div>
              <div className="status-item">
                <strong>
                  {t('systemStatus.storage')} ({deps?.deps?.storage?.driver || 'local'})
                </strong>
                <div className="status-right">
                  <StatusBadge ok={Boolean(deps?.deps?.storage?.ok)} label={deps?.deps?.storage?.ok ? okLabel : errLabel} />
                  <Latency ms={deps?.deps?.storage?.latency_ms} />
                </div>
              </div>
              <div className="status-item">
                <strong>{t('systemStatus.scheduler')}</strong>
                <div className="status-right">
                  <StatusBadge
                    ok={!deps?.deps?.scheduler?.configured || Boolean(deps?.deps?.scheduler?.ok)}
                    label={
                      !deps?.deps?.scheduler?.configured
                        ? notSet
                        : deps?.deps?.scheduler?.ok
                          ? okLabel
                          : errLabel
                    }
                  />
                  <Latency ms={deps?.deps?.scheduler?.latency_ms} />
                  {deps?.deps?.scheduler?.version ? (
                    <span className="muted small" style={{ marginLeft: '0.35rem' }}>
                      {deps.deps.scheduler.service || t('systemStatus.schedulerFallback')} v
                      {deps.deps.scheduler.version}
                      {deps?.deps?.scheduler?.legacy ? ` ${legacy}` : ''}
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
                {t('systemStatus.retry')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
