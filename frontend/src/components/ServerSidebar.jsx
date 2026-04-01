import { useEffect, useState } from 'react'

export default function ServerSidebar({
  servers,
  activeServerId,
  onSelectServer,
  homeAction,
  messagesAction,
  messagesActive = false,
}) {
  const activeServer = servers.find((s) => s.id === activeServerId) || null
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const mq = window.matchMedia('(max-width: 720px)')
    if (!mq.matches) return undefined

    let baseHeight = window.visualViewport?.height || window.innerHeight

    const syncFromViewport = () => {
      if (!mq.matches) {
        setKeyboardOpen(false)
        return
      }
      const current = window.visualViewport?.height || window.innerHeight
      const delta = baseHeight - current
      // Typical virtual keyboard reduces viewport considerably.
      setKeyboardOpen(delta > 120)
    }

    const onFocusIn = (event) => {
      const el = event.target
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el?.isContentEditable
      ) {
        syncFromViewport()
      }
    }
    const onFocusOut = () => {
      window.setTimeout(syncFromViewport, 90)
    }
    const onResize = () => {
      const current = window.visualViewport?.height || window.innerHeight
      if (!keyboardOpen && current > baseHeight) {
        baseHeight = current
      }
      syncFromViewport()
    }

    window.addEventListener('focusin', onFocusIn)
    window.addEventListener('focusout', onFocusOut)
    window.visualViewport?.addEventListener('resize', onResize)
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('focusout', onFocusOut)
      window.visualViewport?.removeEventListener('resize', onResize)
      window.removeEventListener('resize', onResize)
    }
  }, [keyboardOpen])

  return (
    <>
      <aside className="rail">
        <div className="rail-home-zone">
          {homeAction && (
            <button
              type="button"
              className="rail-icon home-icon"
              title="Inicio"
              aria-label="Inicio"
              onClick={homeAction}
            >
              <span className="rail-active-pill" aria-hidden="true" />
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M4.5 10.25L12 4l7.5 6.25"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6.75 9.5V19a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1V9.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
        {messagesAction && (
          <div className="rail-shortcuts-zone">
            <div className="rail-sep rail-sep-shortcuts" />
            <button
              type="button"
              className={`rail-icon rail-icon-message ${messagesActive ? 'active' : ''}`}
              title="Mensajes directos"
              aria-label="Mensajes directos"
              onClick={messagesAction}
            >
              <span className="rail-active-pill" aria-hidden="true" />
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M5 6.5C5 5.12 6.12 4 7.5 4h9C17.88 4 19 5.12 19 6.5v6C19 13.88 17.88 15 16.5 15H11l-3.5 3v-3H7.5C6.12 15 5 13.88 5 12.5v-6Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M8.5 8.5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M8.5 11h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        <div className="rail-sep" />
        <ul className="rail-list">
          {servers.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`rail-icon ${activeServerId === s.id ? 'active' : ''}`}
                title={s.name}
                aria-label={s.name}
                onClick={() => onSelectServer(s.id)}
              >
                <span className="rail-active-pill" aria-hidden="true" />
                {s.name.slice(0, 2).toUpperCase()}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <nav
        className={`mobile-bottom-nav ${keyboardOpen ? 'keyboard-open' : ''}`}
        aria-label="Mobile quick navigation"
      >
        {homeAction && (
          <button type="button" className="mobile-bottom-nav-item" onClick={homeAction}>
            <span className="mobile-bottom-nav-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M4.5 10.25L12 4l7.5 6.25"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6.75 9.5V19a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1V9.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="mobile-bottom-nav-label">Inicio</span>
          </button>
        )}
        {messagesAction && (
          <button
            type="button"
            className={`mobile-bottom-nav-item ${messagesActive ? 'active' : ''}`}
            onClick={messagesAction}
          >
            <span className="mobile-bottom-nav-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M5 6.5C5 5.12 6.12 4 7.5 4h9C17.88 4 19 5.12 19 6.5v6C19 13.88 17.88 15 16.5 15H11l-3.5 3v-3H7.5C6.12 15 5 13.88 5 12.5v-6Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M8.5 8.5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M8.5 11h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </span>
            <span className="mobile-bottom-nav-label">Mensajes</span>
          </button>
        )}
        {activeServer && (
          <button
            type="button"
            className={`mobile-bottom-nav-item ${!messagesActive ? 'active' : ''}`}
            onClick={() => onSelectServer(activeServer.id)}
          >
            <span className="mobile-bottom-nav-icon mobile-bottom-nav-icon--server" aria-hidden="true">
              {activeServer.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="mobile-bottom-nav-label">{activeServer.name.slice(0, 12)}</span>
          </button>
        )}
      </nav>
    </>
  )
}
