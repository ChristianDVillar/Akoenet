import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { getSocket } from '../services/socket'

import { getApiBaseUrl } from '../lib/apiBase'
import { resolveImageUrl } from '../lib/resolveImageUrl'
import StandardEmojiPicker from './StandardEmojiPicker'
import RichMessageText from './RichMessageText'
import MessageLinkPreview from './MessageLinkPreview'
import MessageVideoEmbeds from './MessageVideoEmbeds'
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

export default function DirectMessagesPanel({ user }) {
  const { t } = useTranslation()
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

  function formatConversationPreview(message) {
    if (!message) return t('dm.previewEmpty')
    const text = String(message).trim()
    if (!text) return t('dm.previewImage')
    if (text === '(imagen)') return t('dm.previewImage')
    return text
  }

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
        if (!cancelled) setError(t('dm.errLoad'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [conversationParam, setSearchParams, t])

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
      setError(t('dm.errSearchUsers'))
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
      setError(t('dm.errOpenConversation'))
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
          ? t('common.image')
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
        setError(t('dm.errEditHistory403'))
        return
      }
      setError(t('dm.errEditHistory'))
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
          setError(t('dm.errBlocked'))
          return
        }
        if (ack?.error === 'forbidden' || ack?.error === 'not_found') {
          setError(t('dm.errEditForbidden'))
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
            ? err?.response?.data?.message || t('dm.errEditSaveBlocked')
            : err?.response?.data?.error || t('dm.errEditSave')
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
            setError(t('dm.errDmTooFast'))
            setText(content)
            setReplyTo(savedDmReply)
            return
          }
          if (ack?.error === 'blocked_content') {
            setError(t('dm.errBlocked'))
            setText(content)
            setReplyTo(savedDmReply)
            return
          }
          if (ack?.error === 'save_failed') {
            setError(t('dm.errSaveFailed'))
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
          ? err?.response?.data?.message || t('dm.errSendBlocked')
          : err?.response?.data?.error || t('dm.errSend')
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
              setError(t('dm.errDmTooFast'))
            }
            if (ack?.error === 'blocked_content') {
              setError(t('dm.errBlocked'))
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
      setError(t('dm.errUploadSend'))
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

  function onDmDragLeave(_e) {
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
    const reason = window.prompt(t('dm.promptReport'))
    if (!reason || !reason.trim()) return
    setReportFeedback('')
    try {
      await api.post(`/dm/messages/${dmMessageId}/report`, { reason: reason.trim() })
      setReportFeedback(t('dm.reportSent'))
    } catch (err) {
      const msg =
        err?.response?.status === 429
          ? t('dm.report429')
          : err?.response?.data?.error || t('dm.reportFailed')
      setReportFeedback(msg)
    }
  }

  function validateUploadFile(file) {
    if (!file) return t('dm.uploadNoFile')
    if (!ALLOWED_IMAGE_MIME_TYPES.has(String(file.type || '').toLowerCase())) {
      return t('dm.uploadBadType')
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return t('dm.uploadTooBig')
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
      setError(t('dm.errRefresh'))
    }
  }

  return (
    <section className="card dm-panel">
      <h2>{t('dm.title')}</h2>
      <p className="muted small">{t('dm.lead')}</p>
      {error && <div className="error-banner inline">{error}</div>}
      {reportFeedback && <div className="error-banner inline">{reportFeedback}</div>}
      <form onSubmit={searchUsers} className="form-inline">
        <input
          id="dm-search-user"
          name="user_query"
          placeholder={t('dm.searchUserPh')}
          value={userQuery}
          onChange={(e) => setUserQuery(e.target.value)}
        />
        <button type="submit" className="btn secondary">
          {t('dm.searchUsersBtn')}
        </button>
      </form>
      {results.length > 0 && (
        <div className="dm-search-results">
          <p className="muted small">{t('dm.pickUserHint')}</p>
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
        <p className="muted small">{t('dm.noUsersFound')}</p>
      )}

      <div className="dm-layout">
        <aside className="dm-conversations">
          {conversations.length === 0 ? (
            <p className="muted small">{t('dm.noConversations')}</p>
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
                  title={isPresenceOnline(c?.peer_presence_status) ? t('common.online') : t('common.offline')}
                />
              </button>
            ))
          )}
        </aside>

        {isMobileDm && mobileChatOpen && (
          <button
            type="button"
            className="dm-chat-mobile-backdrop"
            aria-label={t('dm.closeMobileAria')}
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
                  <span>{t('dm.chatWith', { name: selectedConversation.peer_username })}</span>
                  <div className="dm-chat-header-actions">
                    <button
                      type="button"
                      className="btn ghost small"
                      title={t('dm.refreshTitle')}
                      onClick={refreshLatestDirectMessages}
                    >
                      {t('common.refresh')}
                    </button>
                    {isMobileDm && (
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={closeMobileChat}
                        title={t('dm.backTitle')}
                      >
                        {t('common.back')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn ghost small"
                      title={t('dm.searchThisChat')}
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
                      {isPresenceOnline(selectedConversation?.peer_presence_status)
                        ? t('common.online')
                        : t('common.offline')}
                    </span>
                  </div>
                </div>
                {peerTypingName ? (
                  <p className="dm-typing-hint muted small" role="status">
                    {t('dm.typing', { name: peerTypingName })}
                  </p>
                ) : null}
              </>
            ) : (
              <span className="muted small">{t('dm.selectChat')}</span>
            )}
          </div>
          {dmSearchOpen && selectedConversationId && (
            <section className="chat-search-panel dm-inline-search" aria-label={t('dm.searchInConvAria')}>
              <form className="chat-search-form" onSubmit={runDmSearch}>
                <input
                  className="composer-input chat-search-input"
                  value={dmSearchQuery}
                  onChange={(e) => setDmSearchQuery(e.target.value)}
                  placeholder={t('dm.dmSearchPh')}
                  aria-label={t('dm.dmSearchQueryAria')}
                />
                <button
                  type="submit"
                  className="btn secondary small"
                  disabled={dmSearchBusy || dmSearchQuery.trim().length < 2}
                >
                  {dmSearchBusy ? '…' : t('common.search')}
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    setDmSearchOpen(false)
                    setDmSearchResults([])
                  }}
                >
                  {t('common.close')}
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
                              ? t('common.image')
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
                      {m.edited_at && <span className="edited-badge">{t('common.edited')}</span>}
                    </div>
                    <div className="message-actions dm-message-actions" aria-label={t('chat.messageActionsAria')}>
                      {!m._optimistic && editingMessageId !== m.id && (
                        <button
                          type="button"
                          className="message-action-icon"
                          title={t('chat.replyTitle')}
                          aria-label={t('chat.replyAria')}
                          onClick={() => startDmReply(m)}
                        >
                          ↩
                        </button>
                      )}
                      {user?.id != null && Number(m.sender_id) !== Number(user.id) && !m._optimistic && (
                        <button
                          type="button"
                          className="message-action-icon"
                          title={t('chat.reportTitle')}
                          aria-label={t('chat.reportAria')}
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
                            title={t('chat.editTitle')}
                            aria-label={t('chat.editAria')}
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
                            title={t('chat.viewHistoryTitle')}
                            aria-label={t('chat.viewHistoryAria')}
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
                        {t('chat.replyingTo', {
                          name: m.reply_preview_username || t('chat.replyingToGeneric'),
                        })}
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
                          {t('common.save')}
                        </button>
                        <button type="button" className="btn ghost small" onClick={cancelDmEdit}>
                          {t('common.cancel')}
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
                    <MessageVideoEmbeds content={m.content} />
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
                  <span className="reply-context-label">{t('chat.replyingToBar', { name: replyTo.username })}</span>
                  {replyTo.snippet ? <p className="reply-context-snippet">{replyTo.snippet}</p> : null}
                </div>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => setReplyTo(null)}
                  aria-label={t('chat.cancelReplyAria')}
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
                selectedConversation
                  ? t('dm.composerPh', { name: selectedConversation.peer_username })
                  : t('dm.selectChat')
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
              {t('chat.send')}
            </button>
            {selectedConversationId && text.trim().length > 0 && composerHistoryMatches.length > 0 && (
              <div
                id="dm-composer-history-hint"
                className="composer-history-hint"
                role="status"
                aria-live="polite"
              >
                <span className="composer-history-hint-label">{t('dm.historyMatch')}</span>
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
        title={t('dm.editHistoryTitle')}
        entries={editHistoryEntries}
        onClose={() => {
          setEditHistoryModalOpen(false)
          setEditHistoryEntries([])
        }}
      />
      <p className="muted small">
        {t('dm.sessionLabel')}
        {user?.username}
      </p>
    </section>
  )
}
