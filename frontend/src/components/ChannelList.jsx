export default function ChannelList({
  serverName,
  channels,
  activeChannelId,
  onSelectChannel,
  newChannel,
  setNewChannel,
  onAddChannel,
  user,
  onLogout,
}) {
  return (
    <aside className="channel-column">
      <header className="channel-header">
        <h2>{serverName || 'Servidor'}</h2>
        <div className="channel-header-row">
          <span className="muted small">{user?.username}</span>
          <button type="button" className="btn link" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>
      <div className="channel-section-label">Canales de texto</div>
      <ul className="channel-list">
        {channels.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={`channel-item ${activeChannelId === c.id ? 'active' : ''}`}
              onClick={() => onSelectChannel(c.id)}
            >
              <span className="hash">#</span>
              {c.name}
            </button>
          </li>
        ))}
      </ul>
      <form className="new-channel-form" onSubmit={onAddChannel}>
        <input
          placeholder="Nuevo canal"
          value={newChannel}
          onChange={(e) => setNewChannel(e.target.value)}
        />
        <button type="submit" className="btn small primary">
          +
        </button>
      </form>
    </aside>
  )
}
