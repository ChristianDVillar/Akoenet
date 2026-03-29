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

export default function SystemStatus() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [health, setHealth] = useState(null)
  const [deps, setDeps] = useState(null)

  async function load() {
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
      setError('Could not load system diagnostics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="auth-page">
      <div className="auth-card status-page">
        <div className="status-header">
          <h1>System diagnostics</h1>
          <Link to="/" className="btn ghost">
            Back
          </Link>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <p className="muted">Checking services…</p>
        ) : (
          <>
            <p className="muted small">Quick health overview for API, database, Redis, and storage.</p>
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
            </div>
          </>
        )}
      </div>
    </div>
  )
}
