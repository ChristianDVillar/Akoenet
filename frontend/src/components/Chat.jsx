import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { getSocket } from '../services/socket'
import VoiceRoom from './VoiceRoom'
import EmojiText from './EmojiText'

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export default function Chat({ channelId, channelName, channelType = 'text', serverId, user, emojis = [] }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [sendError, setSendError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [reactionPickerId, setReactionPickerId] = useState(null)
  const bottomRef = useRef(null)
  const messageNodeRef = useRef(new Map())
  const emojiPickerWrapRef = useRef(null)
  const reactionPickerWrapRef = useRef(null)
  function resolveImageUrl(rawUrl) {
    if (!rawUrl) return ''
    if (!rawUrl.startsWith('http')) {
      return `${baseURL}${rawUrl}`
    }
    try {
      const parsed = new URL(rawUrl)
      const pathParts = parsed.pathname.split('/').filter(Boolean)
      // Backward compatibility: old records may store direct MinIO URLs (/bucket/key).
      if (pathParts.length >= 2) {
        const key = pathParts.slice(1).join('/')
        return `${baseURL}/uploads/${encodeURIComponent(key)}`
      }
      return rawUrl
    } catch {
      return rawUrl
    }
  }

  const emojiMap = Object.fromEntries(emojis.map((e) => [e.name, resolveImageUrl(e.image_url)]))

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
    const onDeleted = ({ id, channel_id: chId }) => {
      if (String(chId) !== String(channelId)) return
      setMessages((prev) => prev.filter((m) => m.id !== id))
    }
    const onUpdated = (msg) => {
      if (String(msg.channel_id) !== String(channelId)) return
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)))
    }
    const onReactionsUpdated = ({ message_id: messageId, channel_id: chId, reactions }) => {
      if (String(chId) !== String(channelId)) return
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: reactions || [] } : m)))
    }
    s.on('receive_message', onMsg)
    s.on('message_deleted', onDeleted)
    s.on('message_updated', onUpdated)
    s.on('message_reactions_updated', onReactionsUpdated)
    return () => {
      s.off('receive_message', onMsg)
      s.off('message_deleted', onDeleted)
      s.off('message_updated', onUpdated)
      s.off('message_reactions_updated', onReactionsUpdated)
      s.emit('leave_channel', channelId)
    }
  }, [channelId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, channelId])

  useEffect(() => {
    function onDocumentClick(event) {
      if (emojiPickerWrapRef.current && !emojiPickerWrapRef.current.contains(event.target)) {
        setPickerOpen(false)
      }
      if (reactionPickerWrapRef.current && !reactionPickerWrapRef.current.contains(event.target)) {
        setReactionPickerId(null)
      }
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setPickerOpen(false)
        setReactionPickerId(null)
      }
    }
    document.addEventListener('mousedown', onDocumentClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocumentClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  function send() {
    const s = getSocket()
    if (!s || !channelId || !text.trim()) return
    setSendError('')
    s.emit(
      'send_message',
      { channel_id: channelId, content: text.trim() },
      (ack) => {
        if (ack?.error === 'rate_limited') {
          setSendError('You are sending messages too fast')
        }
      }
    )
    setText('')
    setPickerOpen(false)
  }

  function insertEmojiShortcode(name) {
    const shortcode = `:${name}:`
    setText((prev) => {
      if (!prev.trim()) return `${shortcode} `
      return `${prev} ${shortcode} `
    })
  }

  function deleteMessage(messageId) {
    const s = getSocket()
    if (!s) return
    s.emit('delete_message', { message_id: messageId }, (ack) => {
      if (ack?.error === 'forbidden') {
        setSendError('You do not have permission to delete this message')
      }
    })
  }

  function pinMessage(messageId, pin) {
    const s = getSocket()
    if (!s) return
    s.emit('pin_message', { message_id: messageId, pin }, (ack) => {
      if (ack?.error === 'forbidden') {
        setSendError('You do not have permission to pin messages')
      }
    })
  }

  function toggleReaction(messageId, reactionKey, active) {
    const s = getSocket()
    if (!s) return
    s.emit('react_message', { message_id: messageId, reaction_key: reactionKey, active })
  }

  async function exportHistory(format) {
    const token = localStorage.getItem('token')
    if (!token || !channelId) return
    try {
      const res = await fetch(`${baseURL}/messages/channel/${channelId}/export?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `channel-${channelId}-messages.${format}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      /* ignore */
    }
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
      s.emit(
        'send_message',
        {
          channel_id: channelId,
          content: '',
          image_url: data.url,
        },
        (ack) => {
          if (ack?.error === 'rate_limited') {
            setSendError('You are sending messages too fast')
          }
        }
      )
    } catch {
      /* ignore */
    } finally {
      setUploading(false)
    }
  }

  if (!channelId) {
    return (
      <main className="chat-panel empty">
        <p className="muted">Select a channel to open AkoNet.</p>
      </main>
    )
  }

  const isVoice = channelType === 'voice'
  const isForum = channelType === 'forum'
  const pinnedMessages = messages
    .filter((m) => m.is_pinned)
    .sort((a, b) => new Date(b.pinned_at || b.created_at).getTime() - new Date(a.pinned_at || a.created_at).getTime())

  function jumpToMessage(messageId) {
    const node = messageNodeRef.current.get(messageId)
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <main className="chat-panel">
      <header className="chat-header">
        <div>
          <span className="hash">{isVoice ? '🔊' : isForum ? '🗂' : '#'}</span>
          <span className="chat-title">{channelName || 'channel'}</span>
        </div>
        <div className="chat-header-actions">
          {!isVoice && (
            <>
              <button type="button" className="btn ghost small" onClick={() => exportHistory('json')}>
                Export JSON
              </button>
              <button type="button" className="btn ghost small" onClick={() => exportHistory('csv')}>
                Export CSV
              </button>
            </>
          )}
          <span className="akonet-pill">AkoNet · real-time</span>
        </div>
      </header>

      {isVoice ? (
        <VoiceRoom channelId={channelId} user={user} />
      ) : (
      <>
      {pinnedMessages.length > 0 && (
        <section className="pinned-strip">
          <strong>{pinnedMessages.length} pinned</strong>
          <div className="pinned-strip-list">
            {pinnedMessages.map((m) => (
              <button
                key={`pin-${m.id}`}
                type="button"
                className="pinned-chip"
                onClick={() => jumpToMessage(m.id)}
                title="Jump to message"
              >
                <span className="pinned-chip-user">{m.username}:</span>
                {m.content && m.content !== '(imagen)' && (
                  <span className="pinned-chip-text">
                    <EmojiText text={m.content.slice(0, 80)} emojis={emojiMap} />
                  </span>
                )}
                {m.image_url && (
                  <>
                    <img
                      src={resolveImageUrl(m.image_url)}
                      alt="Pinned image"
                      className="pinned-chip-image"
                    />
                    <span className="pinned-chip-preview" aria-hidden="true">
                      <img src={resolveImageUrl(m.image_url)} alt="" className="pinned-chip-preview-image" />
                    </span>
                  </>
                )}
                {!m.content && m.image_url && <span className="pinned-chip-text">Image</span>}
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="message-list">
        {sendError && <div className="error-banner inline">{sendError}</div>}
        {messages.length === 0 && (
          <div className="empty-chat-tip">
            No messages yet. Start the conversation.
          </div>
        )}
        {messages.map((m) => (
          <article
            key={m.id}
            className="message-row"
            ref={(el) => {
              if (el) messageNodeRef.current.set(m.id, el)
              else messageNodeRef.current.delete(m.id)
            }}
          >
            <div className="avatar">{m.username?.slice(0, 1).toUpperCase()}</div>
            <div>
              <div className="message-meta">
                <strong>{m.username}</strong>
                {m.is_pinned && <span className="pin-badge">PIN</span>}
                <time>
                  {new Date(m.created_at).toLocaleString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              {m.content && m.content !== '(imagen)' && (
                <p className="message-body">
                  <EmojiText text={m.content} emojis={emojiMap} />
                </p>
              )}
              {m.image_url && (
                <a href={m.image_url} target="_blank" rel="noreferrer">
                  <img
                    src={resolveImageUrl(m.image_url)}
                    alt=""
                    className="message-image"
                  />
                </a>
              )}
              <div className="message-actions">
                <button type="button" className="btn link" onClick={() => deleteMessage(m.id)}>
                  Delete
                </button>
                <button
                  type="button"
                  className="btn link"
                  onClick={() => pinMessage(m.id, !m.is_pinned)}
                >
                  {m.is_pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  type="button"
                  className="btn link"
                  onClick={() => setReactionPickerId((prev) => (prev === m.id ? null : m.id))}
                >
                  React
                </button>
              </div>
              <div className="reaction-row" ref={reactionPickerId === m.id ? reactionPickerWrapRef : undefined}>
                {(m.reactions || []).map((r) => (
                  <button
                    key={`${m.id}-${r.key}`}
                    type="button"
                    className={`reaction-chip ${r.reacted ? 'active' : ''}`}
                    onClick={() => toggleReaction(m.id, r.key, !r.reacted)}
                  >
                    <EmojiText text={r.key} emojis={emojiMap} /> <span>{r.count}</span>
                  </button>
                ))}
                {reactionPickerId === m.id && (
                  <div className="reaction-picker-inline">
                    {['👍', '❤️', '🔥', '😂'].map((k) => (
                      <button key={k} type="button" className="reaction-chip" onClick={() => toggleReaction(m.id, k, true)}>
                        {k}
                      </button>
                    ))}
                    {emojis.slice(0, 8).map((emoji) => {
                      const key = `:${emoji.name}:`
                      return (
                        <button
                          key={`${m.id}-pick-${emoji.id}`}
                          type="button"
                          className="reaction-chip"
                          onClick={() => toggleReaction(m.id, key, true)}
                        >
                          <EmojiText text={key} emojis={emojiMap} />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
        <div ref={bottomRef} />
      </div>
      </>
      )}

      <footer className="composer">
        <label className="file-btn">
          <input type="file" accept="image/*" hidden onChange={onFile} />
          📎
        </label>
        {!isVoice && emojis.length > 0 && (
          <div className="emoji-picker-wrap" ref={emojiPickerWrapRef}>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setPickerOpen((prev) => !prev)}
              title="Server emojis"
            >
              😀
            </button>
            {pickerOpen && (
              <div className="emoji-picker-panel">
                {emojis.map((emoji) => (
                  <button
                    key={emoji.id}
                    type="button"
                    className="emoji-picker-item"
                    onClick={() => insertEmojiShortcode(emoji.name)}
                    title={`:${emoji.name}:`}
                  >
                    <img
                      src={resolveImageUrl(emoji.image_url)}
                      alt={emoji.name}
                    />
                    <span>:{emoji.name}:</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <input
          className="composer-input"
          placeholder={
            isVoice
              ? 'Voice channel: side chat'
              : isForum
                ? 'Post in this forum'
                : `Message in AkoNet · server ${serverId ?? ''}`
          }
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
          disabled={isVoice || uploading || !text.trim()}
        >
          {isForum ? 'Post' : 'Send'}
        </button>
      </footer>
    </main>
  )
}
