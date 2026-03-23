export default function ServerSidebar({
  servers,
  activeServerId,
  onSelectServer,
  homeAction,
}) {
  return (
    <aside className="rail">
      {homeAction && (
        <button
          type="button"
          className="rail-icon home-icon"
          title="Inicio"
          onClick={homeAction}
        >
          N
        </button>
      )}
      <div className="rail-sep" />
      <ul className="rail-list">
        {servers.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={`rail-icon ${activeServerId === s.id ? 'active' : ''}`}
              title={s.name}
              onClick={() => onSelectServer(s.id)}
            >
              {s.name.slice(0, 2).toUpperCase()}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
