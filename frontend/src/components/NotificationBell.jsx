import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSocket } from '../services/socket'

export default function NotificationBell() {
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

  const unread = items.length

  return (
    <div className="notification-bell-wrap">
      <button
        type="button"
        className={`btn ghost small notification-bell-trigger${unread ? ' notification-bell-trigger--has' : ''}`}
        title="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        🔔
        {unread > 0 ? <span className="notification-bell-badge">{unread > 9 ? '9+' : unread}</span> : null}
      </button>
      {open && (
        <div className="notification-bell-panel" role="menu">
          <div className="notification-bell-head">
            <span>Recent</span>
            <button type="button" className="btn link small" onClick={() => setItems([])}>
              Clear
            </button>
          </div>
          {items.length === 0 ? (
            <p className="muted small notification-bell-empty">No notifications yet. @mentions appear here.</p>
          ) : (
            <ul className="notification-bell-list">
              {items.map((n) => (
                <li key={n._id}>
                  <button type="button" className="notification-bell-item" onClick={() => goTo(n)}>
                    <span className="notification-bell-item-title">
                      {n.type === 'mention' ? `@${n.from_username || 'user'} in #${n.channel_name || 'channel'}` : 'Notification'}
                    </span>
                    <span className="notification-bell-item-meta">
                      {n.server_name} · #{n.channel_name}
                    </span>
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
