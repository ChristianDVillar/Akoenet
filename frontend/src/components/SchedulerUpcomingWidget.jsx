import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

/**
 * Maps backend /integrations/scheduler/upcoming errors to UI hints.
 * 502 = proxy OK but Scheduler unreachable or returned an error (see response body `error`, `httpStatus`).
 */
function schedulerEventTitle(e, tr) {
  if (!e || typeof e !== 'object') return tr('schedulerWidget.streamFallback')
  return String(e.title || e.name || e.summary || tr('schedulerWidget.streamFallback')).trim()
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

function describeSchedulerError(data, tr) {
  const err = data?.error
  const http = data?.httpStatus
  if (err === 'scheduler_api_invalid_response') {
    return {
      title: tr('schedulerWidget.errInvalidJsonTitle'),
      body: tr('schedulerWidget.errInvalidJsonBody'),
    }
  }
  if (err === 'scheduler_api_fetch_failed') {
    return {
      title: tr('schedulerWidget.errCannotReachTitle'),
      body: tr('schedulerWidget.errCannotReachBody'),
    }
  }
  if (err === 'scheduler_api_http_error' && http === 404) {
    return {
      title: tr('schedulerWidget.errStreamer404Title'),
      body: tr('schedulerWidget.errStreamer404Body'),
    }
  }
  if (err === 'scheduler_api_http_error' && (http === 401 || http === 403)) {
    return {
      title: tr('schedulerWidget.errUnauthorizedTitle'),
      body: tr('schedulerWidget.errUnauthorizedBody'),
    }
  }
  if (err === 'scheduler_api_http_error') {
    return {
      title: tr('schedulerWidget.errHttpTitle', { http: http ?? 'error' }),
      body: tr('schedulerWidget.errHttpBody'),
    }
  }
  return {
    title: tr('schedulerWidget.errGenericTitle'),
    body: tr('schedulerWidget.errGenericBody'),
  }
}

/**
 * @param {object} props
 * @param {string} [props.streamerUsername] Optional override (e.g. VITE_SCHEDULER_STREAMER_USERNAME). Otherwise the backend uses the signed-in user's Twitch login.
 */
export default function SchedulerUpcomingWidget({ streamerUsername: streamerUsernameOverride }) {
  const { t } = useTranslation()
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
        setSchedulerErrorDetail(describeSchedulerError(resData, t))
      } else {
        setError('fetch_failed')
      }
    } finally {
      setLoading(false)
    }
  }, [authLoading, streamerUsernameOverride, t])

  useEffect(() => {
    load()
  }, [load])

  if (authLoading) {
    return (
      <section className="scheduler-widget scheduler-widget--muted" aria-label={t('schedulerWidget.ariaStreams')}>
        <div className="scheduler-widget-head">{t('schedulerWidget.headStreams')}</div>
        <p className="scheduler-widget-hint muted">{t('schedulerWidget.loading')}</p>
      </section>
    )
  }

  if (error === 'missing_streamer' && !String(streamerUsernameOverride || '').trim()) {
    return (
      <section className="scheduler-widget scheduler-widget--muted" aria-label={t('schedulerWidget.ariaStreams')}>
        <div className="scheduler-widget-head">{t('schedulerWidget.headStreams')}</div>
        <p className="scheduler-widget-hint">{t('schedulerWidget.missingStreamerHint')}</p>
      </section>
    )
  }

  return (
    <section className="scheduler-widget" aria-label={t('schedulerWidget.ariaUpcoming')}>
      <div className="scheduler-widget-head">
        <span>{t('schedulerWidget.headUpcoming')}</span>
        <button type="button" className="btn ghost small scheduler-widget-refresh" onClick={load} disabled={loading}>
          {loading ? '…' : '↻'}
        </button>
      </div>
      {error === 'scheduler_api_not_configured' && (
        <p className="scheduler-widget-hint">{t('schedulerWidget.notConfiguredHint')}</p>
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
        <p className="scheduler-widget-hint">{t('schedulerWidget.fetchFailed')}</p>
      )}
      {!error && !loading && events.length > 0 && (
        <ul className="scheduler-widget-events">
          {events.slice(0, 10).map((ev, i) => {
            const title = schedulerEventTitle(ev, t)
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
                      {t('schedulerWidget.insertLink')}
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
        <p className="scheduler-widget-hint muted">{t('schedulerWidget.noEvents')}</p>
      )}
    </section>
  )
}
