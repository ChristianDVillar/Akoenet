import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

/**
 * Maps backend /integrations/scheduler/upcoming errors to UI hints.
 * 502 = proxy OK but Scheduler unreachable or returned an error (see response body `error`, `httpStatus`).
 */
function schedulerEventTitle(e) {
  if (!e || typeof e !== 'object') return 'Stream'
  return String(e.title || e.name || e.summary || 'Stream').trim()
}

function schedulerEventLink(ev) {
  if (!ev || typeof ev !== 'object') return ''
  const u =
    ev.url ||
    ev.link ||
    ev.href ||
    ev.vod_url ||
    ev.clip_url ||
    ev.stream_url ||
    ev.twitch_url ||
    ev.youtube_url
  return u ? String(u).trim() : ''
}

function schedulerEventStart(ev) {
  if (!ev || typeof ev !== 'object') return null
  return (
    ev.starts_at ||
    ev.start_at ||
    ev.startTime ||
    ev.scheduled_at ||
    ev.scheduledFor ||
    ev.start ||
    null
  )
}

function describeSchedulerError(data) {
  const err = data?.error
  const http = data?.httpStatus
  if (err === 'scheduler_api_invalid_response') {
    return {
      title: 'Scheduler URL returned a web page, not JSON',
      body:
        'SCHEDULER_API_BASE_URL is probably the app/dashboard host. The backend must call the Scheduler HTTP API that returns JSON (often a different origin or path). Check your Scheduler docs for the public API base URL and set SCHEDULER_API_BASE_URL (and SCHEDULER_UPCOMING_PATH or SCHEDULER_UPCOMING_URL_TEMPLATE) accordingly.',
    }
  }
  if (err === 'scheduler_api_fetch_failed') {
    return {
      title: 'Cannot reach the Scheduler',
      body:
        'The backend could not connect to the Scheduler (timeout, DNS, or connection refused). Check SCHEDULER_API_BASE_URL, that the Scheduler is running, and from Docker use a URL the backend container can reach (e.g. host.docker.internal, not only localhost from the host).',
    }
  }
  if (err === 'scheduler_api_http_error' && http === 404) {
    return {
      title: 'Scheduler: streamer not found',
      body:
        'The Scheduler API returned 404 for this username. In User settings, set “Streamer Scheduler username” to your public /streamer/… slug if it differs from Twitch. Or use SCHEDULER_DEFAULT_STREAMER_USERNAME / ?username= with the Scheduler slug. Path default: /api/streamer/{username}/events.',
    }
  }
  if (err === 'scheduler_api_http_error' && (http === 401 || http === 403)) {
    return {
      title: 'Scheduler: unauthorized',
      body:
        'The Scheduler rejected the request. If your API requires a token, set SCHEDULER_API_TOKEN (or SCHEDULER_API_EXTRA_HEADER / VALUE) in the backend .env.',
    }
  }
  if (err === 'scheduler_api_http_error') {
    return {
      title: `Scheduler returned HTTP ${http ?? 'error'}`,
      body:
        'The Scheduler responded with an error. Check Scheduler logs and that SCHEDULER_API_BASE_URL and path template are correct.',
    }
  }
  return {
    title: 'Could not load the schedule',
    body: 'See the Network tab for the response body from /integrations/scheduler/upcoming.',
  }
}

/**
 * @param {object} props
 * @param {string} [props.streamerUsername] Optional override (e.g. VITE_SCHEDULER_STREAMER_USERNAME). Otherwise the backend uses the signed-in user's Twitch login.
 */
export default function SchedulerUpcomingWidget({ streamerUsername: streamerUsernameOverride }) {
  const { loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [formatted, setFormatted] = useState('')
  /** @type {unknown[]} */
  const [events, setEvents] = useState([])
  const [error, setError] = useState(null)
  /** @type {{ title: string, body: string } | null} */
  const [schedulerErrorDetail, setSchedulerErrorDetail] = useState(null)

  const load = useCallback(async () => {
    if (authLoading) return
    setLoading(true)
    setError(null)
    setSchedulerErrorDetail(null)
    const override = String(streamerUsernameOverride || '').trim()
    try {
      const params = { mode: 'all' }
      if (override) params.username = override
      const { data } = await api.get('/integrations/scheduler/upcoming', { params })
      if (data?.scheduler_configured === false) {
        setFormatted('')
        setEvents([])
        setError('scheduler_api_not_configured')
        return
      }
      setFormatted(data?.formatted || '')
      setEvents(Array.isArray(data?.events) ? data.events : [])
    } catch (e) {
      const status = e.response?.status
      const resData = e.response?.data
      const code = resData?.code
      setFormatted('')
      setEvents([])
      if (status === 400 && code === 'MISSING_STREAMER_USERNAME') {
        setError('missing_streamer')
      } else if (status === 503) {
        setError('scheduler_api_not_configured')
      } else if (status === 502) {
        setError('scheduler_proxy_failed')
        setSchedulerErrorDetail(describeSchedulerError(resData))
      } else {
        setError('fetch_failed')
      }
    } finally {
      setLoading(false)
    }
  }, [authLoading, streamerUsernameOverride])

  useEffect(() => {
    load()
  }, [load])

  if (authLoading) {
    return (
      <section className="scheduler-widget scheduler-widget--muted" aria-label="Streams">
        <div className="scheduler-widget-head">📅 Streams</div>
        <p className="scheduler-widget-hint muted">Loading…</p>
      </section>
    )
  }

  if (error === 'missing_streamer' && !String(streamerUsernameOverride || '').trim()) {
    return (
      <section className="scheduler-widget scheduler-widget--muted" aria-label="Streams">
        <div className="scheduler-widget-head">📅 Streams</div>
        <p className="scheduler-widget-hint">
          Sign in with Twitch to link your channel and show your schedule here. You can also set{' '}
          <code>SCHEDULER_DEFAULT_STREAMER_USERNAME</code> on the server or{' '}
          <code>VITE_SCHEDULER_STREAMER_USERNAME</code> as a frontend override.
        </p>
      </section>
    )
  }

  return (
    <section className="scheduler-widget" aria-label="Upcoming streams">
      <div className="scheduler-widget-head">
        <span>📅 Upcoming streams</span>
        <button type="button" className="btn ghost small scheduler-widget-refresh" onClick={load} disabled={loading}>
          {loading ? '…' : '↻'}
        </button>
      </div>
      {error === 'scheduler_api_not_configured' && (
        <p className="scheduler-widget-hint">
          Set <code>SCHEDULER_API_BASE_URL</code> in the backend environment.
        </p>
      )}
      {error === 'scheduler_proxy_failed' && !loading && schedulerErrorDetail && (
        <div className="scheduler-widget-hint">
          <strong>{schedulerErrorDetail.title}</strong>
          <p className="scheduler-widget-hint muted" style={{ marginTop: '0.5rem' }}>
            {schedulerErrorDetail.body}
          </p>
        </div>
      )}
      {error === 'fetch_failed' && !loading && (
        <p className="scheduler-widget-hint">Could not load the schedule.</p>
      )}
      {!error && !loading && events.length > 0 && (
        <ul className="scheduler-widget-events">
          {events.slice(0, 10).map((ev, i) => {
            const title = schedulerEventTitle(ev)
            const link = schedulerEventLink(ev)
            const start = schedulerEventStart(ev)
            const when = start
              ? new Date(start).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
              : ''
            return (
              <li key={`sched-ev-${i}`} className="scheduler-widget-event">
                <div className="scheduler-widget-event-title">{title}</div>
                {when ? <div className="scheduler-widget-event-when muted small">{when}</div> : null}
                {link ? (
                  <div className="scheduler-widget-event-actions">
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent('akoenet-composer-insert', { detail: { text: link } })
                        )
                      }}
                    >
                      Insert link in chat
                    </button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      {!error && !loading && events.length === 0 && formatted && (
        <pre className="scheduler-widget-body">{formatted}</pre>
      )}
      {!error && !loading && events.length === 0 && !formatted && (
        <p className="scheduler-widget-hint muted">No upcoming events.</p>
      )}
    </section>
  )
}
