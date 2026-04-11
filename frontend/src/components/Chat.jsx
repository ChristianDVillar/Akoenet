import { useEffect, useMemo, useRef, useState } from 'react'
import api from '../services/api'
import { getSocket } from '../services/socket'
import VoiceRoom from './VoiceRoom'
import EmojiText from './EmojiText'
import RichMessageText from './RichMessageText'
import MessageLinkPreview from './MessageLinkPreview'
import MessageVideoEmbeds from './MessageVideoEmbeds'
import StandardEmojiPicker from './StandardEmojiPicker'
import EditHistoryModal from './EditHistoryModal'
import { resolveImageUrl } from '../lib/resolveImageUrl'

import { getApiBaseUrl } from '../lib/apiBase'

const baseURL = getApiBaseUrl()
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
])

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
  onOpenMembersPanel,
  membersCount = 0,
}) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [sendError, setSendError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [reactionPickerId, setReactionPickerId] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  /** When set, show messages belonging to this thread (root message id). */
  const [threadRootId, setThreadRootId] = useState(null)
  const threadRootIdRef = useRef(null)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editingDraft, setEditingDraft] = useState('')
  const [editHistoryModalOpen, setEditHistoryModalOpen] = useState(false)
  const [editHistoryEntries, setEditHistoryEntries] = useState([])
  const bottomRef = useRef(null)
  const messageNodeRef = useRef(new Map())
  const composerInputRef = useRef(null)
  const fileDragDepthRef = useRef(0)
  const [fileDragOver, setFileDragOver] = useState(false)
  const emojiPickerWrapRef = useRef(null)
  const reactionPickerWrapRef = useRef(null)
  const typingStopTimerRef = useRef(null)
  const lastTypingEmitRef = useRef(0)
  const currentUserIdRef = useRef(null)
  const [typingPeers, setTypingPeers] = useState({})
  const [failedAvatarKeys, setFailedAvatarKeys] = useState(() => new Set())
  /** Index into history prefix matches (↑/↓); reset when composer text changes in handleComposerChange */
  const [composerHistoryIndex, setComposerHistoryIndex] = useState(0)

  useEffect(() => {
    currentUserIdRef.current = user?.id != null ? Number(user.id) : null
  }, [user?.id])

  useEffect(() => {
    function onComposerInsert(e) {
      const t = e.detail?.text
      if (typeof t !== 'string' || !channelId || channelType === 'voice') return
      const s = t.trim()
      if (!s) return
      setText((prev) => (prev && prev.trim() ? `${prev.trimEnd()}\n${s}` : s))
      requestAnimationFrame(() => composerInputRef.current?.focus())
    }
    window.addEventListener('akoenet-composer-insert', onComposerInsert)
    return () => window.removeEventListener('akoenet-composer-insert', onComposerInsert)
  }, [channelId, channelType])

  useEffect(() => {
    threadRootIdRef.current = threadRootId
  }, [threadRootId])

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

  /** Messages whose text starts with the current composer prefix (oldest first). */
  const composerHistoryMatches = useMemo(() => {
    if (channelType === 'voice' || !channelId) return []
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
  }, [messages, text, channelType, channelId])

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
    if (!channelId) {
      setMessages([])
      setFailedAvatarKeys(new Set())
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const params = threadRootId ? { thread_root: threadRootId } : {}
        const { data } = await api.get(`/messages/channel/${channelId}`, { params })
        if (!cancelled) setMessages(data)
      } catch {
        if (!cancelled) setMessages([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [channelId, threadRootId])

  useEffect(() => {
    const s = getSocket()
    if (!s || !channelId) return

    s.emit('join_channel', channelId)

    const onMsg = (msg) => {
      if (String(msg.channel_id) !== String(channelId)) return
      const tr = threadRootIdRef.current
      if (tr == null) {
        if (msg.thread_root_message_id) {
          const rootId = Number(msg.thread_root_message_id)
          setMessages((prev) =>
            prev.map((m) =>
              Number(m.id) === rootId
                ? { ...m, thread_reply_count: (Number(m.thread_reply_count) || 0) + 1 }
                : m
            )
          )
          return
        }
      } else if (Number(msg.id) !== Number(tr) && Number(msg.thread_root_message_id) !== Number(tr)) {
        return
      }
      setMessages((prev) => {
        const cleaned = prev.filter((m) => {
          if (!m._optimistic) return true
          if (Number(m.user_id) !== Number(msg.user_id)) return true
          return String(m.content).trim() !== String(msg.content).trim()
        })
        if (cleaned.some((m) => m.id === msg.id)) return cleaned
        const next = [...cleaned, msg]
        if (
          tr != null &&
          Number(msg.thread_root_message_id) === Number(tr) &&
          Number(msg.id) !== Number(tr)
        ) {
          return next.map((m) =>
            Number(m.id) === Number(tr)
              ? { ...m, thread_reply_count: (Number(m.thread_reply_count) || 0) + 1 }
              : m
          )
        }
        return next
      })
    }
    const onDeleted = ({ id, channel_id: chId }) => {
      if (String(chId) !== String(channelId)) return
      setMessages((prev) => prev.filter((m) => m.id !== id))
    }
    const onUpdated = (msg) => {
      if (String(msg.channel_id) !== String(channelId)) return
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? {
                ...m,
                ...msg,
                reactions: Array.isArray(msg.reactions) ? msg.reactions : m.reactions,
              }
            : m
        )
      )
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
    const onReconnect = () => {
      const params = threadRootIdRef.current ? { thread_root: threadRootIdRef.current } : {}
      api
        .get(`/messages/channel/${channelId}`, { params })
        .then(({ data }) => setMessages(data))
        .catch(() => {})
    }
    s.on('reconnect', onReconnect)
    return () => {
      s.off('reconnect', onReconnect)
      s.off('receive_message', onMsg)
      s.off('message_deleted', onDeleted)
      s.off('message_updated', onUpdated)
      s.off('message_reactions_updated', onReactionsUpdated)
      s.off('channel_typing', onTyping)
      s.emit('leave_channel', channelId)
    }
  }, [channelId, threadRootId])

  useEffect(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
    setReplyTo(null)
    setThreadRootId(null)
    setEditingMessageId(null)
    setEditingDraft('')
    setEditHistoryModalOpen(false)
    setEditHistoryEntries([])
    setComposerHistoryIndex(0)
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
    setComposerHistoryIndex(0)
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
    const toSend = text.trim()
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const rawReplyId = replyTo?.id
    const replyId =
      rawReplyId != null &&
      (typeof rawReplyId === 'number' || (typeof rawReplyId === 'string' && /^\d+$/.test(rawReplyId)))
        ? Number(rawReplyId)
        : null
    const optimistic = {
      id: `pending-${clientId}`,
      _optimistic: true,
      _clientId: clientId,
      channel_id: channelId,
      user_id: user?.id,
      username: user?.username || 'You',
      content: toSend,
      created_at: new Date().toISOString(),
      reactions: [],
      avatar_url: user?.avatar_url || null,
      reply_to_id: replyId,
      reply_preview_username: replyTo?.username || null,
      reply_preview_content: replyTo?.snippet || null,
    }
    const savedReply = replyTo
    setMessages((prev) => [...prev, optimistic])
    setText('')
    setPickerOpen(false)
    setReplyTo(null)
    s.emit(
      'send_message',
      {
        channel_id: channelId,
        content: toSend,
        ...(replyId ? { reply_to_message_id: replyId } : {}),
        ...(threadRootId ? { thread_root_message_id: threadRootId } : {}),
      },
      (ack) => {
        setMessages((prev) => prev.filter((m) => m._clientId !== clientId))
        if (ack?.error === 'rate_limited') {
          setSendError('Slow down a little — you are sending a bit too fast.')
          setText(toSend)
          setReplyTo(savedReply)
          return
        }
        if (ack?.error === 'blocked_content') {
          setSendError('That message contains prohibited language.')
          setText(toSend)
          setReplyTo(savedReply)
          return
        }
        if (ack?.error === 'duplicate_message') {
          setSendError(ack?.message || 'Duplicate message; wait a moment before sending again.')
          setText(toSend)
          setReplyTo(savedReply)
          return
        }
        if (ack?.error === 'save_failed') {
          setSendError('Message could not be saved. Try again.')
          setText(toSend)
          setReplyTo(savedReply)
          return
        }
        if (ack?.ok && ack.message) {
          setMessages((prev) => {
            let next = prev
            if (!next.some((m) => m.id === ack.message.id)) {
              next = [...next, { ...ack.message, reactions: ack.message.reactions || [] }]
            }
            if (ack.scheduler_reply && !next.some((m) => m.id === ack.scheduler_reply.id)) {
              next = [...next, { ...ack.scheduler_reply, reactions: ack.scheduler_reply.reactions || [] }]
            }
            return next
          })
        }
      }
    )
  }

  function insertEmojiShortcode(name) {
    const shortcode = `:${name}:`
    setText((prev) => {
      if (!prev.trim()) return `${shortcode} `
      return `${prev} ${shortcode} `
    })
  }

  function deleteMessage(messageId) {
    if (typeof messageId === 'string' && messageId.startsWith('pending-')) {
      setMessages((prev) => prev.filter((m) => m.id !== messageId))
      return
    }
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

  async function runSearch(e) {
    e?.preventDefault?.()
    const q = searchQuery.trim()
    if (q.length < 2 || !channelId) return
    setSearchBusy(true)
    try {
      const { data } = await api.get(`/messages/channel/${channelId}/search`, { params: { q } })
      setSearchResults(Array.isArray(data) ? data : [])
    } catch {
      setSearchResults([])
    } finally {
      setSearchBusy(false)
    }
  }

  function startReply(m) {
    const snippet =
      m.content && m.content !== '(imagen)'
        ? m.content.slice(0, 120)
        : m.image_url
          ? 'Image'
          : ''
    setReplyTo({ id: m.id, username: m.username, snippet })
  }

  function cancelEdit() {
    setEditingMessageId(null)
    setEditingDraft('')
  }

  async function showEditHistory(messageId) {
    try {
      const { data } = await api.get(`/messages/${messageId}/edit-history`)
      const items = Array.isArray(data) ? data : []
      setEditHistoryEntries(items.slice(0, 50))
      setEditHistoryModalOpen(true)
    } catch (err) {
      if (err?.response?.status === 403) {
        setSendError('You do not have permission to view edit history.')
        return
      }
      setSendError('Could not load edit history.')
    }
  }

  function saveEdit() {
    if (!editingMessageId || !editingDraft.trim()) return
    const s = getSocket()
    if (!s) return
    setSendError('')
    const id = editingMessageId
    const content = editingDraft.trim()
    s.emit('edit_message', { message_id: id, content }, (ack) => {
      if (ack?.error === 'blocked_content') {
        setSendError('That message contains prohibited language.')
        return
      }
      if (ack?.error === 'forbidden' || ack?.error === 'not_found') {
        setSendError("You can't edit that message.")
        return
      }
      if (ack?.ok) {
        cancelEdit()
      }
    })
  }

  async function reportMessage(messageId) {
    const reason = window.prompt('Why are you reporting this message? (required)')
    if (!reason || !reason.trim()) return
    try {
      await api.post(`/messages/${messageId}/report`, { reason: reason.trim() })
      setSendError('Report sent. Moderators will review it.')
    } catch (err) {
      const msg =
        err?.response?.status === 429
          ? 'You are reporting too fast. Try again later.'
          : err?.response?.data?.error || 'Could not send report'
      setSendError(msg)
    }
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

  async function refreshLatestMessages() {
    if (!channelId || channelType === 'voice') return
    try {
      const latestId = messages.reduce((max, m) => {
        const n = Number(m?.id)
        return Number.isFinite(n) ? Math.max(max, n) : max
      }, 0)
      const params = threadRootId ? { thread_root: threadRootId } : {}
      if (latestId > 0) params.after = latestId
      const { data } = await api.get(`/messages/channel/${channelId}`, { params })
      const incoming = Array.isArray(data) ? data : []
      if (!incoming.length) return
      setMessages((prev) => {
        const map = new Map(prev.map((m) => [String(m.id), m]))
        for (const m of incoming) map.set(String(m.id), m)
        return [...map.values()].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      })
    } catch {
      setSendError('Could not refresh messages right now.')
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

  async function uploadChannelImage(file) {
    if (!file || !channelId) return
    const fileError = validateUploadFile(file)
    if (fileError) {
      setSendError(fileError)
      return
    }
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
          ...(threadRootId ? { thread_root_message_id: threadRootId } : {}),
        },
        (ack) => {
          if (ack?.error === 'rate_limited') {
            setSendError('Slow down a little — you are sending a bit too fast.')
          }
          if (ack?.error === 'blocked_content') {
            setSendError('That message contains prohibited language.')
          }
        }
      )
    } catch {
      /* ignore */
    } finally {
      setUploading(false)
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    await uploadChannelImage(file)
  }

  function onChatDragEnter(e) {
    if (!channelId || channelType === 'voice') return
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    fileDragDepthRef.current += 1
    setFileDragOver(true)
  }

  function onChatDragLeave(e) {
    fileDragDepthRef.current -= 1
    if (fileDragDepthRef.current <= 0) {
      fileDragDepthRef.current = 0
      setFileDragOver(false)
    }
  }

  function onChatDragOver(e) {
    if (!channelId || channelType === 'voice') return
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  async function onChatDrop(e) {
    if (!channelId || channelType === 'voice') return
    fileDragDepthRef.current = 0
    setFileDragOver(false)
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    await uploadChannelImage(file)
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
    <main
      className={`chat-panel${fileDragOver ? ' chat-panel--file-drag' : ''}`}
      onDragEnter={onChatDragEnter}
      onDragLeave={onChatDragLeave}
      onDragOver={onChatDragOver}
      onDrop={onChatDrop}
    >
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
          {!isVoice && (
            <button type="button" className="btn ghost small" onClick={refreshLatestMessages} title="Refresh messages">
              Refresh
            </button>
          )}
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
          {channelId && typeof onOpenMembersPanel === 'function' && (
            <button
              type="button"
              className="btn ghost small chat-members-trigger"
              onClick={onOpenMembersPanel}
              title="Server members"
              aria-label={`Open server members list (${membersCount} members)`}
            >
              <span className="chat-members-trigger-text">Members</span>
              {membersCount > 0 && (
                <span className="chat-members-badge" aria-hidden="true">
                  {membersCount > 99 ? '99+' : membersCount}
                </span>
              )}
            </button>
          )}
          {!isVoice && (
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setSearchOpen((o) => !o)}
              title="Search messages"
              aria-expanded={searchOpen}
            >
              🔎
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

      {threadRootId && !isVoice && (
        <div className="thread-banner" role="region" aria-label="Thread">
          <button type="button" className="btn ghost small" onClick={() => setThreadRootId(null)}>
            ← Back to channel
          </button>
          <span className="thread-banner-label">
            Thread
            {(() => {
              const root = messages.find((m) => Number(m.id) === Number(threadRootId))
              const n = Number(root?.thread_reply_count)
              if (!n || n < 1) return null
              return (
                <span className="thread-banner-count">
                  {' '}
                  · {n} {n === 1 ? 'respuesta' : 'respuestas'}
                </span>
              )
            })()}
          </span>
        </div>
      )}

      {!isVoice && (
      <>
      {searchOpen && (
        <section className="chat-search-panel" aria-label="Search in channel">
          <form className="chat-search-form" onSubmit={runSearch}>
            <input
              className="composer-input chat-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in this channel (2+ characters)"
              aria-label="Search query"
            />
            <button type="submit" className="btn secondary small" disabled={searchBusy || searchQuery.trim().length < 2}>
              {searchBusy ? '…' : 'Search'}
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => {
                setSearchOpen(false)
                setSearchResults([])
              }}
            >
              Close
            </button>
          </form>
          {searchResults.length > 0 && (
            <ul className="chat-search-results">
              {searchResults.map((sm) => (
                <li key={sm.id}>
                  <button
                    type="button"
                    className="chat-search-hit"
                    onClick={() => {
                      jumpToMessage(sm.id)
                      setSearchOpen(false)
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
            className={`message-row${m._optimistic ? ' message-row--optimistic' : ''}${
              composerHighlightId != null && String(m.id) === String(composerHighlightId)
                ? ' message-row--composer-history-match'
                : ''
            }`}
            id={
              composerHighlightId != null && String(m.id) === String(composerHighlightId)
                ? `hist-msg-${m.id}`
                : undefined
            }
            ref={(el) => {
              if (el) messageNodeRef.current.set(m.id, el)
              else messageNodeRef.current.delete(m.id)
            }}
          >
            {(m.avatar_url || memberAvatarByUserId.get(Number(m.user_id))) &&
            !failedAvatarKeys.has(`${m.id}:${m.avatar_url || memberAvatarByUserId.get(Number(m.user_id))}`) ? (
              <img
                className="avatar avatar-img"
                src={resolveImageUrl(m.avatar_url || memberAvatarByUserId.get(Number(m.user_id)))}
                alt={`${m.username || 'User'} avatar`}
                onError={() =>
                  setFailedAvatarKeys((prev) => {
                    const next = new Set(prev)
                    next.add(`${m.id}:${m.avatar_url || memberAvatarByUserId.get(Number(m.user_id))}`)
                    return next
                  })
                }
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
                {m.edited_at && <span className="edited-badge">(edited)</span>}
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
                        saveEdit()
                      }
                      if (e.key === 'Escape') cancelEdit()
                    }}
                  />
                  <div className="message-edit-actions">
                    <button type="button" className="btn primary small" onClick={saveEdit}>
                      Save
                    </button>
                    <button type="button" className="btn ghost small" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
              {m.content && m.content !== '(imagen)' && (
                <p className="message-body">
                  <RichMessageText text={m.content} emojis={emojiMap} />
                </p>
              )}
              {m.content && m.content !== '(imagen)' && (
                <MessageVideoEmbeds content={m.content} />
              )}
              {m.content && m.content !== '(imagen)' && (
                <MessageLinkPreview content={m.content} />
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
                </>
              )}
              <div
                className="reaction-row"
                ref={reactionPickerId === m.id ? reactionPickerWrapRef : undefined}
              >
                {!m._optimistic && editingMessageId !== m.id &&
                (m.reactions || []).map((r) => (
                  <button
                    key={`${m.id}-${r.key}`}
                    type="button"
                    className={`reaction-chip ${r.reacted ? 'active' : ''}`}
                    onClick={() => toggleReaction(m.id, r.key, !r.reacted)}
                  >
                    <EmojiText text={r.key} emojis={emojiMap} /> <span>{r.count}</span>
                  </button>
                ))}
                {!m._optimistic && editingMessageId !== m.id && reactionPickerId === m.id && (
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
                {!m._optimistic && editingMessageId !== m.id && (
                  <button
                    type="button"
                    className="message-action-icon"
                    title="Reply"
                    aria-label="Reply to message"
                    onClick={() => startReply(m)}
                  >
                    ↩
                  </button>
                )}
                {!m._optimistic && !threadRootId && channelType === 'text' && (
                  <button
                    type="button"
                    className="message-action-icon message-thread-btn"
                    title={
                      Number(m.thread_reply_count) > 0
                        ? `Abrir hilo (${m.thread_reply_count} respuestas)`
                        : 'Abrir hilo'
                    }
                    aria-label="Abrir hilo"
                    onClick={() => setThreadRootId(Number(m.id))}
                  >
                    <span className="message-thread-btn-inner" aria-hidden>
                      #
                      {Number(m.thread_reply_count) > 0 ? (
                        <span className="thread-reply-count-pill">{m.thread_reply_count}</span>
                      ) : null}
                    </span>
                  </button>
                )}
                {!m._optimistic && (
                  <>
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
                    <button
                      type="button"
                      className="message-action-icon"
                      title="Report"
                      aria-label="Report message"
                      onClick={() => reportMessage(m.id)}
                    >
                      🚩
                    </button>
                    {user?.id != null && Number(m.user_id) === Number(user.id) && m.content && m.content !== '(imagen)' && (
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
                    {!!m.edited_at && (
                      <button
                        type="button"
                        className="message-action-icon"
                        title="View edit history"
                        aria-label="View edit history"
                        onClick={() => showEditHistory(m.id)}
                      >
                        🕘
                      </button>
                    )}
                  </>
                )}
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
        {replyTo && (
          <div className="reply-context-bar">
            <div className="reply-context-text">
              <span className="reply-context-label">Replying to {replyTo.username}</span>
              {replyTo.snippet ? (
                <p className="reply-context-snippet">{replyTo.snippet}</p>
              ) : null}
            </div>
            <button type="button" className="btn ghost small" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
              ✕
            </button>
          </div>
        )}
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
        <StandardEmojiPicker
          inputRef={composerInputRef}
          text={text}
          setText={setText}
          disabled={!channelId}
        />
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
          ref={composerInputRef}
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
              send()
            }
          }}
          aria-autocomplete="list"
          aria-controls="chat-composer-history-hint"
          aria-activedescendant={
            composerHighlightId != null ? `hist-msg-${composerHighlightId}` : undefined
          }
        />
        <button
          type="button"
          className="btn primary chat-send-btn"
          onClick={send}
          disabled={isVoice || uploading || !text.trim()}
        >
          {isForum ? 'Post' : 'Send'}
        </button>
        {!isVoice && text.trim().length > 0 && composerHistoryMatches.length > 0 && (
          <div
            id="chat-composer-history-hint"
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
              {String(composerHistoryMatches[composerHistorySafeIndex]?.content || '').length > 120 ? '…' : ''}
            </span>
            {composerHistoryMatches.length > 1 ? (
              <span className="composer-history-hint-keys muted small">↑ ↓</span>
            ) : null}
          </div>
        )}
      </footer>
      <EditHistoryModal
        open={editHistoryModalOpen}
        title="Message edit history"
        entries={editHistoryEntries}
        onClose={() => {
          setEditHistoryModalOpen(false)
          setEditHistoryEntries([])
        }}
      />
    </main>
  )
}
