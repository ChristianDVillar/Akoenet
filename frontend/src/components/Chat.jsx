import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { getSocket } from '../services/socket'

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export default function Chat({ channelId, channelName, serverId }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!channelId) {
      setMessages([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.get(`/messages/channel/${channelId}`)
        if (!cancelled) setMessages(data)
      } catch {
        if (!cancelled) setMessages([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [channelId])

  useEffect(() => {
    const s = getSocket()
    if (!s || !channelId) return

    s.emit('join_channel', channelId)

    const onMsg = (msg) => {
      if (String(msg.channel_id) !== String(channelId)) return
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
    }
    s.on('receive_message', onMsg)
    return () => {
      s.off('receive_message', onMsg)
      s.emit('leave_channel', channelId)
    }
  }, [channelId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, channelId])

  function send() {
    const s = getSocket()
    if (!s || !channelId || !text.trim()) return
    s.emit(
      'send_message',
      { channel_id: channelId, content: text.trim() },
      () => {}
    )
    setText('')
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !channelId) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const token = localStorage.getItem('token')
      const res = await fetch(`${baseURL}/upload/channel/${channelId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'upload')
      const s = getSocket()
      s.emit('send_message', {
        channel_id: channelId,
        content: '',
        image_url: data.url,
      })
    } catch {
      /* ignore */
    } finally {
      setUploading(false)
    }
  }

  if (!channelId) {
    return (
      <main className="chat-panel empty">
        <p className="muted">Selecciona un canal para abrir EchoNet.</p>
      </main>
    )
  }

  return (
    <main className="chat-panel">
      <header className="chat-header">
        <div>
          <span className="hash">#</span>
          <span className="chat-title">{channelName || 'canal'}</span>
        </div>
        <span className="echonet-pill">EchoNet · tiempo real</span>
      </header>

      <div className="message-list">
        {messages.map((m) => (
          <article key={m.id} className="message-row">
            <div className="avatar">{m.username?.slice(0, 1).toUpperCase()}</div>
            <div>
              <div className="message-meta">
                <strong>{m.username}</strong>
                <time>
                  {new Date(m.created_at).toLocaleString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              {m.content && m.content !== '(imagen)' && (
                <p className="message-body">{m.content}</p>
              )}
              {m.image_url && (
                <a href={m.image_url} target="_blank" rel="noreferrer">
                  <img
                    src={m.image_url.startsWith('http') ? m.image_url : `${baseURL}${m.image_url}`}
                    alt=""
                    className="message-image"
                  />
                </a>
              )}
            </div>
          </article>
        ))}
        <div ref={bottomRef} />
      </div>

      <footer className="composer">
        <label className="file-btn">
          <input type="file" accept="image/*" hidden onChange={onFile} />
          📎
        </label>
        <input
          className="composer-input"
          placeholder={`Mensaje en EchoNet · servidor ${serverId ?? ''}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button
          type="button"
          className="btn primary"
          onClick={send}
          disabled={uploading || !text.trim()}
        >
          Enviar
        </button>
      </footer>
    </main>
  )
}
