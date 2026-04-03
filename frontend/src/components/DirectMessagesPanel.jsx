import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { getSocket } from '../services/socket'

import { getApiBaseUrl } from '../lib/apiBase'
import { resolveImageUrl } from '../lib/resolveImageUrl'
import StandardEmojiPicker from './StandardEmojiPicker'
import RichMessageText from './RichMessageText'
import MessageLinkPreview from './MessageLinkPreview'
import EditHistoryModal from './EditHistoryModal'

const baseURL = getApiBaseUrl()
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
])

function isPresenceOnline(status) {
  const s = String(status || '').toLowerCase()
  return s === 'online' || s === 'idle' || s === 'dnd'
}

function formatConversationPreview(message) {
  if (!message) return 'No messages yet'
  const text = String(message).trim()
  if (!text) return 'Shared an image'
  if (text === '(imagen)') return 'Shared an image'
  return text
}

export default function DirectMessagesPanel({ user }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const conversationParam = searchParams.get('conversation') ?? ''
  const [conversations, setConversations] = useState([])
  const [selectedConversationId, setSelectedConversationId] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [userQuery, setUserQuery] = useState('')
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const [reportFeedback, setReportFeedback] = useState('')
  const [uploading, setUploading] = useState(false)
  const [peerTypingName, setPeerTypingName] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editingDraft, setEditingDraft] = useState('')
  const [dmSearchOpen, setDmSearchOpen] = useState(false)
  const [dmSearchQuery, setDmSearchQuery] = useState('')
  const [dmSearchResults, setDmSearchResults] = useState([])
  const [dmSearchBusy, setDmSearchBusy] = useState(false)
  const [editHistoryModalOpen, setEditHistoryModalOpen] = useState(false)
  const [editHistoryEntries, setEditHistoryEntries] = useState([])
  const [failedAvatarKeys, setFailedAvatarKeys] = useState(() => new Set())
  const [isMobileDm, setIsMobileDm] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 720px)').matches : false
  )
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [mobileDragOffset, setMobileDragOffset] = useState(0)
  const messageNodeRef = useRef(new Map())
  const bottomRef = useRef(null)
  const dmComposerInputRef = useRef(null)
  const mobileTouchStartYRef = useRef(null)
  const mobileDraggingRef = useRef(false)
  const [composerHistoryIndex, setComposerHistoryIndex] = useState(0)
  const dmTypingStopTimerRef = useRef(null)
  const lastDmTypingEmitRef = useRef(0)
  const currentUserIdRef = useRef(null)
  const fileDragDepthRef = useRef(0)
  const [fileDragOver, setFileDragOver] = useState(false)

  async function loadConversations() {
    const { data } = await api.get('/dm/conversations')
    setConversations(data)
    setSelectedConversationId((prev) => (prev != null ? prev : data[0]?.id ?? null))
  }

  useEffect(() => {
    currentUserIdRef.current = user?.id != null ? Number(user.id) : null
  }, [user?.id])

  const composerHistoryMatches = useMemo(() => {
    if (!selectedConversationId) return []
    const prefix = text.trim()
    if (prefix.length < 1) return []
    const pl = prefix.toLowerCase()
    const out = []
    for (const m of messages) {
      if (m._optimistic) continue
      const c = m.content
      if (c == null || c === '' || c === '(imagen)') continue
      if (String(c).toLowerCase().startsWith(pl)) out.push(m)
    }
    out.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    return out.slice(0, 40)
  }, [messages, text, selectedConversationId])

  const composerHistorySafeIndex = Math.min(
    composerHistoryIndex,
    Math.max(0, composerHistoryMatches.length - 1)
  )
  const composerHighlightId =
    composerHistoryMatches.length > 0 ? composerHistoryMatches[composerHistorySafeIndex]?.id : null

  useEffect(() => {
    if (composerHighlightId == null) return
    const node = messageNodeRef.current.get(composerHighlightId)
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [composerHighlightId, composerHistorySafeIndex])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.get('/dm/conversations')
        if (cancelled) return
        setConversations(data)
        const prefer = conversationParam !== '' ? Number(conversationParam) : null
        if (Number.isFinite(prefer)) {
          setSelectedConversationId(prefer)
          if (typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches) {
            setMobileChatOpen(true)
          }
          setSearchParams(
            (p) => {
              const n = new URLSearchParams(p)
              n.delete('conversation')
              return n
            },
            { replace: true }
          )
        } else {
          setSelectedConversationId((prev) => prev ?? (data[0]?.id ?? null))
        }
      } catch {
        if (!cancelled) setError('Could not load your direct messages')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [conversationParam, setSearchParams])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const mq = window.matchMedia('(max-width: 720px)')
    const onChange = (e) => setIsMobileDm(e.matches)
    mq.addEventListener('change', onChange)
    setIsMobileDm(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!isMobileDm) setMobileChatOpen(false)
  }, [isMobileDm])

  useEffect(() => {
    if (!(isMobileDm && mobileChatOpen)) {
      setMobileDragOffset(0)
      return undefined
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isMobileDm, mobileChatOpen])

  useEffect(() => {
    if (!(isMobileDm && mobileChatOpen)) return
    const id = window.setTimeout(() => {
      dmComposerInputRef.current?.focus?.()
    }, 120)
    return () => window.clearTimeout(id)
  }, [isMobileDm, mobileChatOpen])

  useEffect(() => {
    setPeerTypingName('')
    setReplyTo(null)
    setEditingMessageId(null)
    setEditingDraft('')
    setDmSearchOpen(false)
    setDmSearchQuery('')
    setDmSearchResults([])
    setEditHistoryModalOpen(false)
    setEditHistoryEntries([])
    setComposerHistoryIndex(0)
  }, [selectedConversationId])

  function handleSelectConversation(conversationId) {
    setSelectedConversationId(conversationId)
    if (isMobileDm) setMobileChatOpen(true)
  }

  function closeMobileChat() {
    setMobileChatOpen(false)
    setMobileDragOffset(0)
  }

  function onMobileSheetTouchStart(event) {
    if (!isMobileDm || !mobileChatOpen) return
    const y = event.touches?.[0]?.clientY
    if (typeof y !== 'number') return
    mobileTouchStartYRef.current = y
    mobileDraggingRef.current = true
  }

  function onMobileSheetTouchMove(event) {
    if (!isMobileDm || !mobileDraggingRef.current) return
    const y = event.touches?.[0]?.clientY
    const start = mobileTouchStartYRef.current
    if (typeof y !== 'number' || typeof start !== 'number') return
    const delta = Math.max(0, y - start)
    setMobileDragOffset(Math.min(delta, 180))
  }

  function onMobileSheetTouchEnd() {
    if (!isMobileDm) return
    mobileDraggingRef.current = false
    const shouldClose = mobileDragOffset > 90
    if (shouldClose) {
      closeMobileChat()
    } else {
      setMobileDragOffset(0)
    }
    mobileTouchStartYRef.current = null
  }

  useEffect(() => {
    setReportFeedback('')
    if (!selectedConversationId) {
      setMessages([])
      setFailedAvatarKeys(new Set())
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
      setMessages((prev) => {
        const cleaned = prev.filter((m) => {
          if (!m._optimistic) return true
          if (Number(m.sender_id) !== Number(msg.sender_id)) return true
          return String(m.content || '').trim() !== String(msg.content || '').trim()
        })
        if (cleaned.some((m) => m.id === msg.id)) return cleaned
        return [...cleaned, msg]
      })
    }
    const onTyping = (payload) => {
      if (String(payload?.conversation_id) !== String(selectedConversationId)) return
      const myId = currentUserIdRef.current
      if (myId != null && Number(payload.user_id) === myId) return
      if (payload.typing) {
        setPeerTypingName(payload.username || `user_${payload.user_id}`)
      } else {
        setPeerTypingName('')
      }
    }
    const onUpdated = (msg) => {
      if (String(msg.conversation_id) !== String(selectedConversationId)) return
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)))
    }
    const onReconnect = () => {
      api
        .get(`/dm/conversations/${selectedConversationId}/messages`)
        .then(({ data }) => setMessages(data))
        .catch(() => {})
    }
    socket.on('receive_direct_message', onMessage)
    socket.on('direct_typing', onTyping)
    socket.on('direct_message_updated', onUpdated)
    socket.on('reconnect', onReconnect)
    return () => {
      socket.off('reconnect', onReconnect)
      socket.off('direct_typing', onTyping)
      socket.off('direct_message_updated', onUpdated)
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
        setMessages((prev) => {
          const cleaned = prev.filter((m) => {
            if (!m._optimistic) return true
            if (Number(m.sender_id) !== Number(message.sender_id)) return true
            return String(m.content || '').trim() !== String(message.content || '').trim()
          })
          if (cleaned.some((m) => m.id === message.id)) return cleaned
          return [...cleaned, message]
        })
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
      if (isMobileDm) setMobileChatOpen(true)
      setResults([])
      setUserQuery('')
      await loadConversations()
    } catch {
      setError('Could not open conversation')
    }
  }

  function emitDmTyping(typing) {
    const s = getSocket()
    if (!s || !selectedConversationId) return
    s.emit('direct_typing', { conversation_id: selectedConversationId, typing })
  }

  function onComposerChange(e) {
    const v = e.target.value
    setText(v)
    setComposerHistoryIndex(0)
    const s = getSocket()
    if (!s || !selectedConversationId) return
    const now = Date.now()
    if (v.trim() && now - lastDmTypingEmitRef.current > 2000) {
      emitDmTyping(true)
      lastDmTypingEmitRef.current = now
    }
    clearTimeout(dmTypingStopTimerRef.current)
    dmTypingStopTimerRef.current = setTimeout(() => emitDmTyping(false), 3000)
  }

  function jumpToDmMessage(messageId) {
    const node = messageNodeRef.current.get(messageId)
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function runDmSearch(e) {
    e?.preventDefault?.()
    const q = dmSearchQuery.trim()
    if (q.length < 2 || !selectedConversationId) return
    setDmSearchBusy(true)
    try {
      const { data } = await api.get(`/dm/conversations/${selectedConversationId}/messages/search`, {
        params: { q },
      })
      setDmSearchResults(Array.isArray(data) ? data : [])
    } catch {
      setDmSearchResults([])
    } finally {
      setDmSearchBusy(false)
    }
  }

  function startDmReply(m) {
    const snippet =
      m.content && m.content !== '(imagen)'
        ? m.content.slice(0, 120)
        : m.image_url
          ? 'Image'
          : ''
    setReplyTo({ id: m.id, username: m.username, snippet })
  }

  function cancelDmEdit() {
    setEditingMessageId(null)
    setEditingDraft('')
  }

  async function showDmEditHistory(dmMessageId) {
    try {
      const { data } = await api.get(`/dm/messages/${dmMessageId}/edit-history`)
      const items = Array.isArray(data) ? data : []
      setEditHistoryEntries(items.slice(0, 50))
      setEditHistoryModalOpen(true)
    } catch (err) {
      if (err?.response?.status === 403) {
        setError('You do not have permission to view edit history.')
        return
      }
      setError('Could not load edit history.')
    }
  }

  function saveDmEdit() {
    if (!editingMessageId || !editingDraft.trim()) return
    const s = getSocket()
    const id = editingMessageId
    const content = editingDraft.trim()
    setError('')
    if (s) {
      s.emit('edit_direct_message', { dm_message_id: id, content }, (ack) => {
        if (ack?.error === 'blocked_content') {
          setError('That message contains prohibited language.')
          return
        }
        if (ack?.error === 'forbidden' || ack?.error === 'not_found') {
          setError("You can't edit that message.")
          return
        }
        if (ack?.ok) cancelDmEdit()
      })
      return
    }
    api
      .patch(`/dm/messages/${id}`, { content })
      .then(({ data }) => {
        setMessages((prev) => prev.map((m) => (m.id === data.id ? { ...m, ...data } : m)))
        cancelDmEdit()
      })
      .catch((err) => {
        const code = err?.response?.data?.error
        setError(
          code === 'blocked_content'
            ? err?.response?.data?.message || 'That message contains prohibited language.'
            : err?.response?.data?.error || 'Could not save edit'
        )
      })
  }

  async function sendMessage() {
    if (!selectedConversationId || !text.trim()) return
    const content = text.trim()
    setError('')
    clearTimeout(dmTypingStopTimerRef.current)
    emitDmTyping(false)
    const rawReplyId = replyTo?.id
    const replyToId =
      rawReplyId != null &&
      (typeof rawReplyId === 'number' || (typeof rawReplyId === 'string' && /^\d+$/.test(rawReplyId)))
        ? Number(rawReplyId)
        : null
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const optimistic = {
      id: `pending-${clientId}`,
      _optimistic: true,
      _clientId: clientId,
      conversation_id: selectedConversationId,
      sender_id: user?.id,
      username: user?.username || 'You',
      content,
      created_at: new Date().toISOString(),
      image_url: null,
      avatar_url: user?.avatar_url || null,
      reply_to_id: replyToId,
      reply_preview_username: replyTo?.username || null,
      reply_preview_content: replyTo?.snippet || null,
    }
    const savedDmReply = replyTo
    setMessages((prev) => [...prev, optimistic])
    setText('')
    setReplyTo(null)
    const socket = getSocket()
    if (socket) {
      socket.emit(
        'send_direct_message',
        {
          conversation_id: selectedConversationId,
          content,
          ...(replyToId ? { reply_to_message_id: replyToId } : {}),
        },
        (ack) => {
          setMessages((prev) => prev.filter((m) => m._clientId !== clientId))
          if (ack?.error === 'rate_limited') {
            setError('You are sending direct messages too fast')
            setText(content)
            setReplyTo(savedDmReply)
            return
          }
          if (ack?.error === 'blocked_content') {
            setError('That message contains prohibited language.')
            setText(content)
            setReplyTo(savedDmReply)
            return
          }
          if (ack?.error === 'save_failed') {
            setError('Message could not be saved. Try again.')
            setText(content)
            setReplyTo(savedDmReply)
            return
          }
          if (ack?.ok && ack.message) {
            setMessages((prev) =>
              prev.some((m) => m.id === ack.message.id) ? prev : [...prev, ack.message]
            )
          }
        }
      )
      return
    }
    try {
      const { data } = await api.post(`/dm/conversations/${selectedConversationId}/messages`, {
        content,
        ...(replyToId ? { reply_to_message_id: replyToId } : {}),
      })
      setMessages((prev) => {
        const without = prev.filter((m) => m._clientId !== clientId)
        if (without.some((m) => m.id === data.id)) return without
        return [...without, data]
      })
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m._clientId !== clientId))
      setText(content)
      setReplyTo(savedDmReply)
      const code = err?.response?.data?.error
      setError(
        code === 'blocked_content'
          ? err?.response?.data?.message || 'That message contains prohibited language.'
          : err?.response?.data?.error || 'Could not send message'
      )
    }
  }

  async function uploadDmImage(file) {
    if (!file || !selectedConversationId) return
    const fileError = validateUploadFile(file)
    if (fileError) {
      setError(fileError)
      return
    }
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
            if (ack?.error === 'blocked_content') {
              setError('That message contains prohibited language.')
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

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    await uploadDmImage(file)
  }

  function onDmDragEnter(e) {
    if (!selectedConversationId) return
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    fileDragDepthRef.current += 1
    setFileDragOver(true)
  }

  function onDmDragLeave(e) {
    fileDragDepthRef.current -= 1
    if (fileDragDepthRef.current <= 0) {
      fileDragDepthRef.current = 0
      setFileDragOver(false)
    }
  }

  function onDmDragOver(e) {
    if (!selectedConversationId) return
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  async function onDmDrop(e) {
    if (!selectedConversationId) return
    fileDragDepthRef.current = 0
    setFileDragOver(false)
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    await uploadDmImage(file)
  }

  async function reportDmMessage(dmMessageId) {
    if (typeof dmMessageId === 'string' && dmMessageId.startsWith('pending-')) return
    const reason = window.prompt('Why are you reporting this message? (required)')
    if (!reason || !reason.trim()) return
    setReportFeedback('')
    try {
      await api.post(`/dm/messages/${dmMessageId}/report`, { reason: reason.trim() })
      setReportFeedback('Report sent. Moderators will review it.')
    } catch (err) {
      const msg =
        err?.response?.status === 429
          ? 'You are reporting too fast. Try again later.'
          : err?.response?.data?.error || 'Could not send report'
      setReportFeedback(msg)
    }
  }

  function validateUploadFile(file) {
    if (!file) return 'Please select an image.'
    if (!ALLOWED_IMAGE_MIME_TYPES.has(String(file.type || '').toLowerCase())) {
      return 'Invalid file type. Allowed: JPG, PNG, WEBP, GIF, AVIF.'
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return 'File is too large. Maximum size is 5MB.'
    }
    return ''
  }

  async function refreshLatestDirectMessages() {
    if (!selectedConversationId) return
    try {
      const latestId = messages.reduce((max, m) => {
        const n = Number(m?.id)
        return Number.isFinite(n) ? Math.max(max, n) : max
      }, 0)
      const params = latestId > 0 ? { after: latestId } : undefined
      const { data } = await api.get(`/dm/conversations/${selectedConversationId}/messages`, { params })
      const incoming = Array.isArray(data) ? data : []
      if (!incoming.length) return
      setMessages((prev) => {
        const map = new Map(prev.map((m) => [String(m.id), m]))
        for (const m of incoming) map.set(String(m.id), m)
        return [...map.values()].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      })
    } catch {
      setError('Could not refresh messages right now.')
    }
  }

  return (
    <section className="card dm-panel">
      <h2>Direct messages</h2>
      <p className="muted small">Search users, open a conversation, and chat in real time.</p>
      {error && <div className="error-banner inline">{error}</div>}
      {reportFeedback && <div className="error-banner inline">{reportFeedback}</div>}
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
              <span className={`dm-presence-dot ${isPresenceOnline(u?.presence_status) ? 'online' : 'offline'}`} />
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
                className={`server-tile server-tile--dm ${c.id === selectedConversationId ? 'active' : ''}`}
                onClick={() => handleSelectConversation(c.id)}
              >
                <span className="server-initial">{c.peer_username.slice(0, 2).toUpperCase()}</span>
                <span className="dm-conversation-meta">
                  <span className="server-name">{c.peer_username}</span>
                  <span className="dm-conversation-preview">
                    {formatConversationPreview(c.last_message)}
                  </span>
                </span>
                <span className="dm-conversation-time">
                  {c.last_message_at
                    ? new Date(c.last_message_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ''}
                </span>
                <span
                  className={`dm-presence-dot ${
                    isPresenceOnline(c?.peer_presence_status) ? 'online' : 'offline'
                  }`}
                  title={isPresenceOnline(c?.peer_presence_status) ? 'Online' : 'Offline'}
                />
              </button>
            ))
          )}
        </aside>

        {isMobileDm && mobileChatOpen && (
          <button
            type="button"
            className="dm-chat-mobile-backdrop"
            aria-label="Close direct message chat"
            onClick={closeMobileChat}
          />
        )}

        <div
          className={`dm-chat ${isMobileDm ? 'dm-chat-mobile' : ''} ${
            isMobileDm && mobileChatOpen ? 'is-open' : ''
          }${fileDragOver ? ' dm-chat--file-drag' : ''}`}
          style={
            isMobileDm
              ? { '--dm-sheet-drag': `${mobileChatOpen ? mobileDragOffset : 0}px` }
              : undefined
          }
          onDragEnter={onDmDragEnter}
          onDragLeave={onDmDragLeave}
          onDragOver={onDmDragOver}
          onDrop={onDmDrop}
          onTouchStart={onMobileSheetTouchStart}
          onTouchMove={onMobileSheetTouchMove}
          onTouchEnd={onMobileSheetTouchEnd}
          onTouchCancel={onMobileSheetTouchEnd}
        >
          <div className="dm-chat-header">
            {isMobileDm && (
              <div className="dm-mobile-sheet-grab-wrap" aria-hidden="true">
                <span className="dm-mobile-sheet-grab" />
              </div>
            )}
            {selectedConversation ? (
              <>
                <div className="dm-chat-header-row">
                  <span>{`Chat with ${selectedConversation.peer_username}`}</span>
                  <div className="dm-chat-header-actions">
                    <button
                      type="button"
                      className="btn ghost small"
                      title="Refresh messages"
                      onClick={refreshLatestDirectMessages}
                    >
                      Refresh
                    </button>
                    {isMobileDm && (
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={closeMobileChat}
                        title="Back to conversations"
                      >
                        Back
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn ghost small"
                      title="Search in this chat"
                      onClick={() => setDmSearchOpen((o) => !o)}
                      aria-expanded={dmSearchOpen}
                    >
                      🔎
                    </button>
                    <span
                      className={`dm-chat-header-status ${
                        isPresenceOnline(selectedConversation?.peer_presence_status) ? 'online' : 'offline'
                      }`}
                    >
                      {isPresenceOnline(selectedConversation?.peer_presence_status) ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
                {peerTypingName ? (
                  <p className="dm-typing-hint muted small" role="status">
                    {peerTypingName} is writing…
                  </p>
                ) : null}
              </>
            ) : (
              'Select a chat'
            )}
          </div>
          {dmSearchOpen && selectedConversationId && (
            <section className="chat-search-panel dm-inline-search" aria-label="Search in conversation">
              <form className="chat-search-form" onSubmit={runDmSearch}>
                <input
                  className="composer-input chat-search-input"
                  value={dmSearchQuery}
                  onChange={(e) => setDmSearchQuery(e.target.value)}
                  placeholder="Search in this chat (2+ characters)"
                  aria-label="Search direct messages"
                />
                <button
                  type="submit"
                  className="btn secondary small"
                  disabled={dmSearchBusy || dmSearchQuery.trim().length < 2}
                >
                  {dmSearchBusy ? '…' : 'Search'}
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    setDmSearchOpen(false)
                    setDmSearchResults([])
                  }}
                >
                  Close
                </button>
              </form>
              {dmSearchResults.length > 0 && (
                <ul className="chat-search-results">
                  {dmSearchResults.map((sm) => (
                    <li key={sm.id}>
                      <button
                        type="button"
                        className="chat-search-hit"
                        onClick={() => {
                          jumpToDmMessage(sm.id)
                          setDmSearchOpen(false)
                        }}
                      >
                        <span className="chat-search-hit-user">{sm.username}</span>
                        <span className="chat-search-hit-text">
                          {sm.content && sm.content !== '(imagen)'
                            ? sm.content.slice(0, 120)
                            : sm.image_url
                              ? 'Image'
                              : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <div className="message-list">
            {messages.map((m) => (
              <article
                key={m.id}
                className={`message-row${m._optimistic ? ' message-row--optimistic' : ''}${
                  composerHighlightId != null && String(m.id) === String(composerHighlightId)
                    ? ' message-row--composer-history-match'
                    : ''
                }`}
                id={
                  composerHighlightId != null && String(m.id) === String(composerHighlightId)
                    ? `dm-hist-msg-${m.id}`
                    : undefined
                }
                ref={(el) => {
                  if (el) messageNodeRef.current.set(m.id, el)
                  else messageNodeRef.current.delete(m.id)
                }}
              >
                {(m.avatar_url || (m._optimistic && user?.avatar_url)) &&
                !failedAvatarKeys.has(`${m.id}:${m.avatar_url || user?.avatar_url || ''}`) ? (
                  <img
                    className="avatar avatar-img"
                    src={resolveImageUrl(m.avatar_url || user?.avatar_url)}
                    alt=""
                    onError={() =>
                      setFailedAvatarKeys((prev) => {
                        const next = new Set(prev)
                        next.add(`${m.id}:${m.avatar_url || user?.avatar_url || ''}`)
                        return next
                      })
                    }
                  />
                ) : (
                  <div className="avatar">{m.username?.slice(0, 1).toUpperCase()}</div>
                )}
                <div>
                  <div className="dm-message-meta-row">
                    <div className="message-meta">
                      <strong>{m.username}</strong>
                      <time>
                        {new Date(m.created_at).toLocaleString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                      {m.edited_at && <span className="edited-badge">(edited)</span>}
                    </div>
                    <div className="message-actions dm-message-actions" aria-label="Message actions">
                      {!m._optimistic && editingMessageId !== m.id && (
                        <button
                          type="button"
                          className="message-action-icon"
                          title="Reply"
                          aria-label="Reply to message"
                          onClick={() => startDmReply(m)}
                        >
                          ↩
                        </button>
                      )}
                      {user?.id != null && Number(m.sender_id) !== Number(user.id) && !m._optimistic && (
                        <button
                          type="button"
                          className="message-action-icon"
                          title="Report"
                          aria-label="Report message"
                          onClick={() => reportDmMessage(m.id)}
                        >
                          🚩
                        </button>
                      )}
                      {user?.id != null &&
                        Number(m.sender_id) === Number(user.id) &&
                        !m._optimistic &&
                        m.content &&
                        m.content !== '(imagen)' &&
                        editingMessageId !== m.id && (
                          <button
                            type="button"
                            className="message-action-icon"
                            title="Edit"
                            aria-label="Edit message"
                            onClick={() => {
                              setEditingMessageId(m.id)
                              setEditingDraft(m.content || '')
                            }}
                          >
                            ✎
                          </button>
                        )}
                      {!!m.edited_at &&
                        !m._optimistic &&
                        Number(m.sender_id) === Number(user?.id) && (
                          <button
                            type="button"
                            className="message-action-icon"
                            title="View edit history"
                            aria-label="View edit history"
                            onClick={() => showDmEditHistory(m.id)}
                          >
                            🕘
                          </button>
                        )}
                    </div>
                  </div>
                  {(m.reply_preview_username || m.reply_preview_content) && (
                    <div className="message-reply-preview">
                      <span className="message-reply-preview-label">
                        Replying to {m.reply_preview_username || 'message'}
                      </span>
                      {m.reply_preview_content && m.reply_preview_content !== '(imagen)' && (
                        <span className="message-reply-preview-snippet">
                          {String(m.reply_preview_content).slice(0, 100)}
                        </span>
                      )}
                    </div>
                  )}
                  {editingMessageId === m.id ? (
                    <div className="message-edit-block">
                      <textarea
                        className="composer-input message-edit-textarea"
                        value={editingDraft}
                        onChange={(e) => setEditingDraft(e.target.value)}
                        rows={3}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            saveDmEdit()
                          }
                          if (e.key === 'Escape') cancelDmEdit()
                        }}
                      />
                      <div className="message-edit-actions">
                        <button type="button" className="btn primary small" onClick={saveDmEdit}>
                          Save
                        </button>
                        <button type="button" className="btn ghost small" onClick={cancelDmEdit}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                  {m.content && m.content !== '(imagen)' && (
                    <p className="message-body">
                      <RichMessageText text={m.content} emojis={{}} />
                    </p>
                  )}
                  {m.content && m.content !== '(imagen)' && (
                    <MessageLinkPreview content={m.content} />
                  )}
                  {m.image_url && (
                    <a href={resolveImageUrl(m.image_url)} target="_blank" rel="noreferrer">
                      <img
                        src={resolveImageUrl(m.image_url)}
                        alt=""
                        className="message-image"
                      />
                    </a>
                  )}
                    </>
                  )}
                </div>
              </article>
            ))}
            <div ref={bottomRef} />
          </div>
          <footer className="composer">
            {replyTo && (
              <div className="reply-context-bar">
                <div className="reply-context-text">
                  <span className="reply-context-label">Replying to {replyTo.username}</span>
                  {replyTo.snippet ? <p className="reply-context-snippet">{replyTo.snippet}</p> : null}
                </div>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => setReplyTo(null)}
                  aria-label="Cancel reply"
                >
                  ✕
                </button>
              </div>
            )}
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
            <StandardEmojiPicker
              inputRef={dmComposerInputRef}
              text={text}
              setText={setText}
              disabled={!selectedConversationId}
            />
            <input
              ref={dmComposerInputRef}
              id="dm-composer-message"
              name="message"
              className="composer-input"
              placeholder={
                selectedConversation ? `Direct message to ${selectedConversation.peer_username}` : 'Select a chat'
              }
              value={text}
              onChange={onComposerChange}
              onKeyDown={(e) => {
                if (composerHistoryMatches.length > 1 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                  e.preventDefault()
                  const len = composerHistoryMatches.length
                  if (e.key === 'ArrowDown') {
                    setComposerHistoryIndex((i) => (i + 1) % len)
                  } else {
                    setComposerHistoryIndex((i) => (i - 1 + len) % len)
                  }
                  return
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              disabled={!selectedConversationId}
              aria-controls="dm-composer-history-hint"
              aria-activedescendant={
                composerHighlightId != null ? `dm-hist-msg-${composerHighlightId}` : undefined
              }
            />
            <button
              type="button"
              className="btn primary"
              onClick={sendMessage}
              disabled={!selectedConversationId || uploading || !text.trim()}
            >
              Send
            </button>
            {selectedConversationId && text.trim().length > 0 && composerHistoryMatches.length > 0 && (
              <div
                id="dm-composer-history-hint"
                className="composer-history-hint"
                role="status"
                aria-live="polite"
              >
                <span className="composer-history-hint-label">History match</span>
                <span className="composer-history-hint-meta">
                  {composerHistorySafeIndex + 1} / {composerHistoryMatches.length}
                </span>
                <span className="composer-history-hint-snippet">
                  {composerHistoryMatches[composerHistorySafeIndex]?.username}:{' '}
                  {String(composerHistoryMatches[composerHistorySafeIndex]?.content || '').slice(0, 120)}
                  {String(composerHistoryMatches[composerHistorySafeIndex]?.content || '').length > 120
                    ? '…'
                    : ''}
                </span>
                {composerHistoryMatches.length > 1 ? (
                  <span className="composer-history-hint-keys muted small">↑ ↓</span>
                ) : null}
              </div>
            )}
          </footer>
        </div>
      </div>
      <EditHistoryModal
        open={editHistoryModalOpen}
        title="Direct message edit history"
        entries={editHistoryEntries}
        onClose={() => {
          setEditHistoryModalOpen(false)
          setEditHistoryEntries([])
        }}
      />
      <p className="muted small">Current session: {user?.username}</p>
    </section>
  )
}
