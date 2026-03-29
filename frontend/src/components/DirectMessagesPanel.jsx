import { useEffect, useMemo, useRef, useState } from 'react'
import api from '../services/api'
import { getSocket } from '../services/socket'

import { getApiBaseUrl } from '../lib/apiBase'

const baseURL = getApiBaseUrl()

export default function DirectMessagesPanel({ user }) {
  const [conversations, setConversations] = useState([])
  const [selectedConversationId, setSelectedConversationId] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [userQuery, setUserQuery] = useState('')
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const bottomRef = useRef(null)

  async function loadConversations() {
    const { data } = await api.get('/dm/conversations')
    setConversations(data)
    if (!selectedConversationId && data[0]?.id) {
      setSelectedConversationId(data[0].id)
    }
  }

  useEffect(() => {
    loadConversations().catch(() => setError('Could not load your direct messages'))
  }, [])

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.get(`/dm/conversations/${selectedConversationId}/messages`)
        if (!cancelled) setMessages(data)
      } catch {
        if (!cancelled) setMessages([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedConversationId])

  useEffect(() => {
    const socket = getSocket()
    if (!socket || !selectedConversationId) return
    socket.emit('join_direct_conversation', selectedConversationId)
    const onMessage = (msg) => {
      if (String(msg.conversation_id) !== String(selectedConversationId)) return
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    }
    socket.on('receive_direct_message', onMessage)
    return () => {
      socket.off('receive_direct_message', onMessage)
      socket.emit('leave_direct_conversation', selectedConversationId)
    }
  }, [selectedConversationId])

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const onNotify = ({ conversationId, message }) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversationId)
        if (idx < 0) return prev
        const updated = {
          ...prev[idx],
          last_message: message.content,
          last_message_at: message.created_at,
        }
        const copy = [...prev]
        copy.splice(idx, 1)
        return [updated, ...copy]
      })
      if (String(conversationId) === String(selectedConversationId)) {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
      }
    }
    socket.on('direct_message_notification', onNotify)
    return () => {
      socket.off('direct_message_notification', onNotify)
    }
  }, [selectedConversationId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, selectedConversationId])

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  )

  async function searchUsers(e) {
    e.preventDefault()
    if (!userQuery.trim()) return
    setError('')
    try {
      const { data } = await api.get('/dm/users', { params: { q: userQuery.trim() } })
      setResults(data)
    } catch {
      setError('Could not search users')
    }
  }

  async function startConversation(targetUserId) {
    setError('')
    try {
      const { data } = await api.post('/dm/conversations', { target_user_id: targetUserId })
      setSelectedConversationId(data.id)
      setResults([])
      setUserQuery('')
      await loadConversations()
    } catch {
      setError('Could not open conversation')
    }
  }

  async function sendMessage() {
    if (!selectedConversationId || !text.trim()) return
    const content = text.trim()
    setText('')
    const socket = getSocket()
    if (socket) {
      socket.emit(
        'send_direct_message',
        {
          conversation_id: selectedConversationId,
          content,
        },
        (ack) => {
          if (ack?.error === 'rate_limited') {
            setError('You are sending direct messages too fast')
          }
        }
      )
      return
    }
    try {
      const { data } = await api.post(`/dm/conversations/${selectedConversationId}/messages`, {
        content,
      })
      setMessages((prev) => [...prev, data])
    } catch {
      setError('Could not send message')
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selectedConversationId) return
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const token = localStorage.getItem('token')
      const res = await fetch(`${baseURL}/upload/direct/${selectedConversationId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'upload')
      const socket = getSocket()
      if (socket) {
        socket.emit(
          'send_direct_message',
          {
            conversation_id: selectedConversationId,
            content: '',
            image_url: data.url,
          },
          (ack) => {
            if (ack?.error === 'rate_limited') {
              setError('You are sending direct messages too fast')
            }
          }
        )
      } else {
        const { data: message } = await api.post(
          `/dm/conversations/${selectedConversationId}/messages`,
          {
            content: '',
            image_url: data.url,
          }
        )
        setMessages((prev) => [...prev, message])
      }
    } catch {
      setError('Could not send image')
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="card dm-panel">
      <h2>Direct messages</h2>
      <p className="muted small">Search users, open a conversation, and chat in real time.</p>
      {error && <div className="error-banner inline">{error}</div>}
      <form onSubmit={searchUsers} className="form-inline">
        <input
          id="dm-search-user"
          name="user_query"
          placeholder="Search user"
          value={userQuery}
          onChange={(e) => setUserQuery(e.target.value)}
        />
        <button type="submit" className="btn secondary">
          Search users
        </button>
      </form>
      {results.length > 0 && (
        <div className="dm-search-results">
          <p className="muted small">Select a user below to start a new chat.</p>
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              className="server-tile"
              onClick={() => startConversation(u.id)}
            >
              <span className="server-initial">{u.username.slice(0, 2).toUpperCase()}</span>
              <span className="server-name">{u.username}</span>
            </button>
          ))}
        </div>
      )}
      {userQuery.trim().length > 1 && results.length === 0 && (
        <p className="muted small">No users found. Try another username or email fragment.</p>
      )}

      <div className="dm-layout">
        <aside className="dm-conversations">
          {conversations.length === 0 ? (
            <p className="muted small">You do not have direct conversations yet. Search someone to start one.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`server-tile ${c.id === selectedConversationId ? 'active' : ''}`}
                onClick={() => setSelectedConversationId(c.id)}
              >
                <span className="server-initial">{c.peer_username.slice(0, 2).toUpperCase()}</span>
                <span className="server-name">{c.peer_username}</span>
              </button>
            ))
          )}
        </aside>

        <div className="dm-chat">
          <div className="dm-chat-header">
            {selectedConversation ? `Chat with ${selectedConversation.peer_username}` : 'Select a chat'}
          </div>
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
              <input
                id="dm-composer-attachment"
                name="attachment"
                type="file"
                accept="image/*"
                hidden
                onChange={onFile}
                disabled={!selectedConversationId || uploading}
              />
              📎
            </label>
            <input
              id="dm-composer-message"
              name="message"
              className="composer-input"
              placeholder={
                selectedConversation ? `Direct message to ${selectedConversation.peer_username}` : 'Select a chat'
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              disabled={!selectedConversationId}
            />
            <button
              type="button"
              className="btn primary"
              onClick={sendMessage}
              disabled={!selectedConversationId || uploading || !text.trim()}
            >
              Send
            </button>
          </footer>
        </div>
      </div>
      <p className="muted small">Current session: {user?.username}</p>
    </section>
  )
}
