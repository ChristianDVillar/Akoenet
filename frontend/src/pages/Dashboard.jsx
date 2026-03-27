import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import ServerSidebar from '../components/ServerSidebar'
import DirectMessagesPanel from '../components/DirectMessagesPanel'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [servers, setServers] = useState([])
  const [newName, setNewName] = useState('')
  const [joinId, setJoinId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const { data } = await api.get('/servers')
      setServers(data)
    } catch {
      setError('No se pudieron cargar los servidores')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function createServer(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setError('')
    try {
      await api.post('/servers', { name: newName.trim() })
      setNewName('')
      await load()
    } catch {
      setError('No se pudo crear el servidor')
    }
  }

  async function joinServer(e) {
    e.preventDefault()
    const id = parseInt(joinId, 10)
    if (Number.isNaN(id)) {
      setError('ID de servidor inválido')
      return
    }
    setError('')
    try {
      await api.post(`/servers/${id}/join`)
      setJoinId('')
      await load()
    } catch (err) {
      const msg =
        err.response?.status === 409
          ? 'Ya eres miembro'
          : err.response?.status === 404
            ? 'Servidor no encontrado'
            : err.response?.status === 403
              ? 'No puedes unirte a ese servidor'
            : 'No se pudo unir'
      setError(msg)
    }
  }

  return (
    <div className="app-shell dashboard-shell">
      <ServerSidebar
        servers={servers}
        activeServerId={null}
        onSelectServer={(id) => navigate(`/server/${id}`)}
      />
      <div className="main-panel home-panel">
        <header className="home-header">
          <div>
            <h1>AkoNet</h1>
            <p className="akonet-tag">AkoNet · tus comunidades</p>
          </div>
          <div className="user-bar">
            <span className="muted">{user?.username}</span>
            <button type="button" className="btn ghost" onClick={logout}>
              Salir
            </button>
          </div>
        </header>

        {error && <div className="error-banner inline">{error}</div>}

        <section className="home-grid">
          <div className="card">
            <h2>Crear servidor</h2>
            <form onSubmit={createServer} className="form-inline">
              <input
                placeholder="Nombre del servidor"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button type="submit" className="btn primary">
                Crear
              </button>
            </form>
          </div>
          <div className="card">
            <h2>Unirse con ID</h2>
            <form onSubmit={joinServer} className="form-inline">
              <input
                placeholder="ID numérico del servidor"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
              />
              <button type="submit" className="btn secondary">
                Unirme
              </button>
            </form>
            <p className="muted small">
              Pide a un admin el ID del servidor para entrar (MVP sin enlaces de
              invitación).
            </p>
          </div>
        </section>

        <section className="server-list-section">
          <h2>Tus servidores</h2>
          {loading ? (
            <p className="muted">Cargando…</p>
          ) : servers.length === 0 ? (
            <p className="muted">Aún no tienes servidores. Crea uno arriba.</p>
          ) : (
            <ul className="server-tiles">
              {servers.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="server-tile"
                    onClick={() => navigate(`/server/${s.id}`)}
                  >
                    <span className="server-initial">
                      {s.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="server-name">{s.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <DirectMessagesPanel user={user} />
      </div>
    </div>
  )
}
