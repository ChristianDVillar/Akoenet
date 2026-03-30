import { useEffect, useMemo, useRef, useState } from 'react'
import api from '../services/api'
import { getSocket } from '../services/socket'
import VoiceRoom from './VoiceRoom'
import EmojiText from './EmojiText'
import RichMessageText from './RichMessageText'
import { resolveImageUrl } from '../lib/resolveImageUrl'

import { getApiBaseUrl } from '../lib/apiBase'

const baseURL = getApiBaseUrl()

export default function Chat({
  channelId,
  channelName,
  channelType = 'text',
  user,
  members = [],
  emojis = [],
  voiceUserLimit,
  voiceConnectedCount,
  rtcVoiceChannelId,
  rtcVoiceChannelName,
  onVoiceSessionChange,
  onOpenChannelSettings,
}) {
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
  const typingStopTimerRef = useRef(null)
  const lastTypingEmitRef = useRef(0)
  const currentUserIdRef = useRef(null)
  const [typingPeers, setTypingPeers] = useState({})

  useEffect(() => {
    currentUserIdRef.current = user?.id != null ? Number(user.id) : null
  }, [user?.id])

  const emojiMap = Object.fromEntries(emojis.map((e) => [e.name, resolveImageUrl(e.image_url)]))
  const memberAvatarByUserId = useMemo(() => {
    const map = new Map()
    for (const m of members || []) {
      if (m?.id != null && m?.avatar_url) {
        map.set(Number(m.id), m.avatar_url)
      }
    }
    return map
  }, [members])

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
    const onTyping = (payload) => {
      if (String(payload?.channel_id) !== String(channelId)) return
      const myId = currentUserIdRef.current
      if (myId != null && Number(payload.user_id) === myId) return
      setTypingPeers((prev) => {
        const next = { ...prev }
        const uid = String(payload.user_id)
        if (payload.typing) {
          next[uid] = payload.username || `user_${uid}`
        } else {
          delete next[uid]
        }
        return next
      })
    }
    s.on('channel_typing', onTyping)
    return () => {
      s.off('receive_message', onMsg)
      s.off('message_deleted', onDeleted)
      s.off('message_updated', onUpdated)
      s.off('message_reactions_updated', onReactionsUpdated)
      s.off('channel_typing', onTyping)
      s.emit('leave_channel', channelId)
    }
  }, [channelId])

  useEffect(() => {
    setTypingPeers({})
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

  function emitTyping(typing) {
    const s = getSocket()
    if (!s || !channelId) return
    s.emit('channel_typing', { channel_id: channelId, typing })
  }

  function handleComposerChange(e) {
    const v = e.target.value
    setText(v)
    if (channelType === 'voice' || !channelId) return
    const s = getSocket()
    if (!s) return
    const now = Date.now()
    if (v.trim() && now - lastTypingEmitRef.current > 2000) {
      emitTyping(true)
      lastTypingEmitRef.current = now
    }
    clearTimeout(typingStopTimerRef.current)
    typingStopTimerRef.current = setTimeout(() => {
      emitTyping(false)
    }, 3000)
  }

  function send() {
    const s = getSocket()
    if (!s || !channelId || !text.trim()) return
    clearTimeout(typingStopTimerRef.current)
    emitTyping(false)
    setSendError('')
    s.emit(
      'send_message',
      { channel_id: channelId, content: text.trim() },
      (ack) => {
        if (ack?.error === 'rate_limited') {
          setSendError('Slow down a little — you are sending a bit too fast.')
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
        setSendError("You can't delete that message.")
      }
    })
  }

  function pinMessage(messageId, pin) {
    const s = getSocket()
    if (!s) return
    s.emit('pin_message', { message_id: messageId, pin }, (ack) => {
      if (ack?.error === 'forbidden') {
        setSendError("You can't pin messages here.")
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
            setSendError('Slow down a little — you are sending a bit too fast.')
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
        <div className="chat-empty-hero">
          <p className="chat-empty-title">Choose a channel</p>
          <p className="chat-empty-sub">Pick one on the left and jump into the conversation.</p>
        </div>
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

  const typingNames = Object.values(typingPeers)
  let typingLine = ''
  if (typingNames.length === 1) typingLine = `${typingNames[0]} is writing…`
  else if (typingNames.length === 2) typingLine = `${typingNames[0]} and ${typingNames[1]} are writing…`
  else if (typingNames.length > 2) {
    const n = typingNames.length - 2
    typingLine = `${typingNames[0]}, ${typingNames[1]} and ${n} other${n === 1 ? '' : 's'} are writing…`
  }

  return (
    <main className="chat-panel">
      <header className="chat-header">
        <div className="chat-header-topic">
          <span className="hash" aria-hidden="true">
            {isVoice ? '🔊' : isForum ? '🗂' : '#'}
          </span>
          <div>
            <span className="chat-title">{channelName || 'Channel'}</span>
            {!isVoice && (
              <p className="chat-header-hint">Messages update live for everyone here</p>
            )}
          </div>
        </div>
        <div className="chat-header-actions">
          {channelId && (
            <button
              type="button"
              className="btn ghost small"
              onClick={onOpenChannelSettings}
              title="Channel settings"
            >
              ⚙
            </button>
          )}
          {!isVoice && (
            <div className="chat-save-row" role="group" aria-label="Download chat history">
              <button type="button" className="btn link chat-save-link" onClick={() => exportHistory('csv')}>
                Spreadsheet
              </button>
              <span className="chat-save-dot" aria-hidden="true">
                ·
              </span>
              <button type="button" className="btn link chat-save-link" onClick={() => exportHistory('json')}>
                JSON backup
              </button>
            </div>
          )}
          <span className="chat-live-pill" title="Connected in real time">
            <span className="chat-live-dot" aria-hidden="true" />
            Live
          </span>
        </div>
      </header>

      {!isVoice && (
      <>
      {pinnedMessages.length > 0 && (
        <section className="pinned-strip">
          <div className="pinned-strip-head">
            <span className="pinned-strip-label">Pinned for everyone</span>
            <span className="pinned-strip-badge">{pinnedMessages.length}</span>
          </div>
          <div className="pinned-strip-list">
            {pinnedMessages.map((m) => (
              <button
                key={`pin-${m.id}`}
                type="button"
                className="pinned-chip"
                onClick={() => jumpToMessage(m.id)}
                title="Go to this message"
              >
                <span className="pinned-chip-user">{m.username}:</span>
                {m.content && m.content !== '(imagen)' && (
                  <span className="pinned-chip-text">
                    <RichMessageText text={m.content.slice(0, 80)} emojis={emojiMap} />
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
        {typingLine && (
          <div className="typing-bar" role="status">
            <span className="typing-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            {typingLine}
          </div>
        )}
        {sendError && <div className="error-banner inline">{sendError}</div>}
        {messages.length === 0 && (
          <div className="empty-chat-tip">
            <p className="empty-chat-title">Quiet here for now</p>
            <p className="empty-chat-sub">Say hello — your message shows up for everyone instantly.</p>
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
            {(m.avatar_url || memberAvatarByUserId.get(Number(m.user_id))) ? (
              <img
                className="avatar avatar-img"
                src={resolveImageUrl(m.avatar_url || memberAvatarByUserId.get(Number(m.user_id)))}
                alt={`${m.username || 'User'} avatar`}
                onError={(e) => {
                  e.currentTarget.src = '/vite.svg'
                }}
              />
            ) : (
              <div className="avatar">{m.username?.slice(0, 1).toUpperCase()}</div>
            )}
            <div>
              <div className="message-meta">
                <strong>{m.username}</strong>
                {m.is_pinned && <span className="pin-badge">Pinned</span>}
                <time>
                  {new Date(m.created_at).toLocaleString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              {m.content && m.content !== '(imagen)' && (
                <p className="message-body">
                  <RichMessageText text={m.content} emojis={emojiMap} />
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
              <div className="message-actions" aria-label="Message actions">
                <button
                  type="button"
                  className="message-action-icon"
                  title="Delete"
                  aria-label="Delete message"
                  onClick={() => deleteMessage(m.id)}
                >
                  🗑️
                </button>
                <button
                  type="button"
                  className={`message-action-icon${m.is_pinned ? ' message-action-icon--on' : ''}`}
                  title={m.is_pinned ? 'Unpin' : 'Pin'}
                  aria-label={m.is_pinned ? 'Unpin message' : 'Pin message'}
                  onClick={() => pinMessage(m.id, !m.is_pinned)}
                >
                  📌
                </button>
                <button
                  type="button"
                  className="message-action-icon"
                  title="React"
                  aria-label="Add reaction"
                  onClick={() => setReactionPickerId((prev) => (prev === m.id ? null : m.id))}
                >
                  ➕
                </button>
              </div>
            </div>
          </article>
        ))}
        <div ref={bottomRef} />
      </div>
      </>
      )}

      {rtcVoiceChannelId != null && (
        <VoiceRoom
          channelId={rtcVoiceChannelId}
          user={user}
          autoJoin={isVoice}
          compact={!isVoice}
          channelLabel={rtcVoiceChannelName}
          voiceUserLimit={voiceUserLimit}
          voiceConnectedCount={voiceConnectedCount}
          onVoiceSessionChange={onVoiceSessionChange}
        />
      )}

      <footer className="composer">
        <label className="file-btn">
          <input
            id="chat-composer-attachment"
            name="attachment"
            type="file"
            accept="image/*"
            hidden
            onChange={onFile}
          />
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
          id="chat-composer-message"
          name="message"
          className="composer-input"
          placeholder={
            isVoice
              ? 'Side chat for this voice room…'
              : isForum
                ? 'Start a thread…'
                : channelName
                  ? `Message #${channelName}`
                  : 'Write a message…'
          }
          value={text}
          onChange={handleComposerChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button
          type="button"
          className="btn primary chat-send-btn"
          onClick={send}
          disabled={isVoice || uploading || !text.trim()}
        >
          {isForum ? 'Post' : 'Send'}
        </button>
      </footer>
    </main>
  )
}
