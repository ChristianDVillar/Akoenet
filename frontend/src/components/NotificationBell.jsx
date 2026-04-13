import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getSocket } from '../services/socket'

export default function NotificationBell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])

  const push = useCallback((payload) => {
    setItems((prev) => [{ ...payload, _id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }, ...prev].slice(0, 30))
  }, [])

  useEffect(() => {
    const s = getSocket()
    if (!s) return
    const onInApp = (payload) => {
      if (!payload || typeof payload !== 'object') return
      push(payload)
    }
    s.on('in_app_notification', onInApp)
    return () => {
      s.off('in_app_notification', onInApp)
    }
  }, [push])

  function goTo(n) {
    if (!n?.server_id || !n?.channel_id) return
    navigate(`/server/${n.server_id}?channel=${n.channel_id}`)
    setOpen(false)
  }

  function titleForNotification(n) {
    if (n?.type === 'mention')
      return t('notifications.mentionTitle', {
        user: n.from_username || t('notifications.userFallback'),
        channel: n.channel_name || t('notifications.channelFallback'),
      })
    if (n?.type === 'report_status')
      return t('notifications.reportTitle', {
        id: n.report_id || '?',
        status: n.status || t('notifications.updatedFallback'),
      })
    return t('notifications.genericTitle')
  }

  function metaForNotification(n) {
    if (n?.server_name || n?.channel_name)
      return t('notifications.metaServerChannel', {
        server: n.server_name || t('notifications.serverFallback'),
        channel: n.channel_name || t('notifications.channelFallback'),
      })
    if (n?.type === 'report_status') return t('notifications.moderationUpdate')
    return ''
  }

  const unread = items.length

  return (
    <div className="notification-bell-wrap">
      <button
        type="button"
        className={`btn ghost small notification-bell-trigger${unread ? ' notification-bell-trigger--has' : ''}`}
        title={t('notifications.bellTitle')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        🔔
        {unread > 0 ? <span className="notification-bell-badge">{unread > 9 ? '9+' : unread}</span> : null}
      </button>
      {open && (
        <div className="notification-bell-panel" role="menu">
          <div className="notification-bell-head">
            <span>{t('notifications.recent')}</span>
            <button type="button" className="btn link small" onClick={() => setItems([])}>
              {t('notifications.clear')}
            </button>
          </div>
          {items.length === 0 ? (
            <p className="muted small notification-bell-empty">{t('notifications.empty')}</p>
          ) : (
            <ul className="notification-bell-list">
              {items.map((n) => (
                <li key={n._id}>
                  <button type="button" className="notification-bell-item" onClick={() => goTo(n)}>
                    <span className="notification-bell-item-title">
                      {titleForNotification(n)}
                    </span>
                    {metaForNotification(n) ? (
                      <span className="notification-bell-item-meta">{metaForNotification(n)}</span>
                    ) : null}
                    {n.snippet ? <span className="notification-bell-item-snippet">{n.snippet}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
