export default function ServerSidebar({
  servers,
  activeServerId,
  onSelectServer,
  homeAction,
  messagesAction,
  messagesActive = false,
}) {
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
    </>
  )
}
