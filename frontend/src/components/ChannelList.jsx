import { useCallback, useEffect, useState } from 'react'
import { useDismissiblePopover } from '../hooks/useDismissiblePopover'
import { resolveImageUrl } from '../lib/resolveImageUrl'
import SchedulerUpcomingWidget from './SchedulerUpcomingWidget'
import AppChromeToolbar from './AppChromeToolbar'

function VoiceSidebarMicMutedIcon() {
  return (
    <svg className="voice-channel-audio-svg" viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M19 11h-1.7c0-.74-.16-1.44-.43-2.09l1.23-1.23c.56.98.9 2.09.9 3.32zM12 14c-1.66 0-3-1.34-3-3V6c0-.36.07-.7.18-1.02L7.1 8.06A2.98 2.98 0 0 0 7 9v5a5 5 0 0 0 5 5c1.43 0 2.74-.61 3.68-1.57L13 14.83A2.98 2.98 0 0 1 12 14zm9.71-9.71L4.29 20.29 3 19l3.59-3.59A6.96 6.96 0 0 1 5 11H3a8 8 0 0 0 4.34 7.11L8.55 21H11v2h2v-2h2.45l1.79-2.89A8 8 0 0 0 21 11h-2a6.96 6.96 0 0 1-1.31 3.41l2.39-2.39 1.63 1.63z"
      />
    </svg>
  )
}

function VoiceSidebarHeadphonesDeafIcon() {
  return (
    <svg
      className="voice-channel-audio-svg"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 13a10 10 0 0 1 20 0" />
      <rect x="2" y="13" width="6" height="8" rx="2" />
      <rect x="16" y="13" width="6" height="8" rx="2" />
      <path d="M4 4l16 16" />
    </svg>
  )
}

export default function ChannelList({
  serverName,
  categories,
  channels,
  activeChannelId,
  onSelectChannel,
  onCreateChannel,
  onCreateCategory,
  onDeleteCategory,
  onDeleteChannel,
  onMoveChannel,
  onMoveCategory,
  collapsedCategories,
  onToggleCategory,
  user,
  onLogout,
  onOpenUserSettings,
  onOpenServerSettings,
  onOpenAdminDashboard,
  onSetAppearOnline,
  schedulerStreamerUsername,
  voicePresence = {},
  voiceScreenSharingUserIds = [],
}) {
  function voiceUsersForChannel(channelId) {
    const k = String(channelId)
    const raw = voicePresence[k] ?? voicePresence[channelId] ?? voicePresence[Number(channelId)]
    return Array.isArray(raw) ? raw : []
  }

  function sortedVoiceUsersForChannel(channelId) {
    const list = [...voiceUsersForChannel(channelId)]
    list.sort((a, b) => {
      const na = String(a.username || `user_${a.userId}`).toLocaleLowerCase()
      const nb = String(b.username || `user_${b.userId}`).toLocaleLowerCase()
      return na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' })
    })
    return list
  }

  function isVoiceScreenSharingUser(userId) {
    if (userId == null || !Array.isArray(voiceScreenSharingUserIds) || voiceScreenSharingUserIds.length === 0)
      return false
    const idStr = String(userId)
    return voiceScreenSharingUserIds.some((x) => String(x) === idStr)
  }

  /** Positive integer cap from API, or null if unlimited / invalid */
  function voiceChannelUserMax(channel) {
    const lim = channel?.voice_user_limit
    if (lim == null || lim === '') return null
    const n = typeof lim === 'string' ? Number(lim.trim()) : Number(lim)
    if (!Number.isFinite(n) || n < 1) return null
    return Math.min(99, Math.floor(n))
  }
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [userAvatarFailed, setUserAvatarFailed] = useState(false)
  const [voiceAvatarFailed, setVoiceAvatarFailed] = useState(() => new Set())
  const closeUserMenu = useCallback(() => setUserMenuOpen(false), [])
  const userMenuRef = useDismissiblePopover(userMenuOpen, closeUserMenu)
  const avatarInitial = String(user?.username || 'U').trim().charAt(0).toUpperCase() || 'U'

  /** null | top (channel vs section) | add channel inside category | clone type beside channel */
  const [createUI, setCreateUI] = useState(null)
  const [draftName, setDraftName] = useState('')
  const [draftType, setDraftType] = useState('text')
  const [draftCategoryId, setDraftCategoryId] = useState('')
  const [draftPrivate, setDraftPrivate] = useState(false)

  const closeCreate = useCallback(() => setCreateUI(null), [])
  const createOpen = createUI !== null
  const popoverRef = useDismissiblePopover(createOpen, closeCreate)

  useEffect(() => {
    if (!createUI) {
      setDraftName('')
      return
    }
    setDraftName('')
    if (createUI.type === 'top') {
      setDraftType('text')
      setDraftCategoryId('')
      setDraftPrivate(false)
    } else if (createUI.type === 'category') {
      setDraftType('text')
      setDraftCategoryId(String(createUI.categoryId))
      setDraftPrivate(false)
    } else if (createUI.type === 'beside') {
      const ch = channels.find((x) => x.id === createUI.channelId)
      setDraftType(ch?.type || 'text')
      setDraftCategoryId(ch?.category_id != null ? String(ch.category_id) : '')
      setDraftPrivate(Boolean(ch?.is_private))
    }
  }, [createUI, channels])

  useEffect(() => {
    setUserAvatarFailed(false)
  }, [user?.avatar_url])

  const grouped = categories.map((category) => ({
    ...category,
    channels: channels.filter((c) => c.category_id === category.id),
  }))
  const uncategorized = channels.filter((c) => !c.category_id)

  async function submitNewChannel(payload) {
    await onCreateChannel?.(payload)
    closeCreate()
  }

  function channelIcon(c) {
    if (c.type === 'voice') {
      return (
        <span className="channel-icon channel-icon--voice" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
          </svg>
        </span>
      )
    }
    if (c.type === 'forum') {
      return (
        <span className="channel-icon channel-icon--forum" aria-hidden="true">
          🗂
        </span>
      )
    }
    return (
      <span className="channel-icon channel-icon--text" aria-hidden="true">
        #
      </span>
    )
  }

  function renderChannelRow(c, { groupId } = {}) {
    const besideOpen = createUI?.type === 'beside' && createUI.channelId === c.id
    const vCount = c.type === 'voice' ? voiceUsersForChannel(c.id).length : 0
    const vMax = c.type === 'voice' ? voiceChannelUserMax(c) : null
    const vSorted = c.type === 'voice' ? sortedVoiceUsersForChannel(c.id) : []
    const showVoiceXy = c.type === 'voice' && (vMax != null || vCount > 0)
    const voiceXyFull = c.type === 'voice' && vMax != null && vCount >= vMax
    return (
      <li
        key={c.id}
        className="draggable-item"
        draggable
        onDragStart={(e) => {
          e.currentTarget.classList.add('is-dragging')
          e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'channel', id: c.id }))
        }}
        onDragEnd={(e) => e.currentTarget.classList.remove('is-dragging')}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const raw = e.dataTransfer.getData('text/plain')
          if (!raw) return
          const payload = JSON.parse(raw)
          if (payload.kind === 'channel') {
            onMoveChannel(payload.id, c.id, groupId ?? null)
          }
        }}
      >
        {c.type === 'voice' ? (
          <div className="voice-channel-discord-wrap">
            <div
              role="button"
              tabIndex={0}
              className={`channel-item channel-item-discord channel-item-discord--voice-header ${activeChannelId === c.id ? 'active' : ''}`}
              onClick={() => onSelectChannel(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelectChannel(c.id)
              }}
            >
              <span className="channel-item-main channel-item-main--voice">
                {channelIcon(c)}
                {c.is_private && (
                  <span className="channel-lock" title="Private channel">
                    🔒
                  </span>
                )}
                <span className="channel-name channel-name--voice">{c.name}</span>
                {showVoiceXy && (
                  <span
                    className={`voice-channel-xy ${voiceXyFull ? 'voice-channel-xy--full' : ''}`}
                    title={vMax != null ? `Conectados / máximo: ${vCount} / ${vMax}` : `Conectados: ${vCount}`}
                  >
                    {vMax != null ? `(${vCount}/${vMax})` : `(${vCount})`}
                  </span>
                )}
              </span>
              <span className="channel-row-tools">
                <button
                  type="button"
                  className="channel-row-add"
                  title="Add channel with same type in this section"
                  onClick={(e) => {
                    e.stopPropagation()
                    setCreateUI({ type: 'beside', channelId: c.id })
                  }}
                >
                  +
                </button>
                <button
                  type="button"
                  className="channel-row-action"
                  title="Delete channel"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteChannel(c.id)
                  }}
                >
                  🗑
                </button>
              </span>
            </div>
            <ul className="voice-channel-connected" aria-label={`Connected in ${c.name}`}>
              {vSorted.map((p) => {
                const uidKey = p.userId != null ? String(p.userId) : ''
                const showImg = p.avatar_url && !voiceAvatarFailed.has(uidKey)
                const liveSharing = isVoiceScreenSharingUser(p.userId)
                return (
                  <li key={`${c.id}-${p.userId}`} className="voice-channel-connected-user">
                    {showImg ? (
                      <img
                        className="voice-channel-connected-avatar-img"
                        src={resolveImageUrl(p.avatar_url)}
                        alt=""
                        onError={() => {
                          setVoiceAvatarFailed((prev) => new Set(prev).add(uidKey))
                        }}
                      />
                    ) : (
                      <span className="voice-channel-connected-avatar" aria-hidden>
                        {(p.username || '?').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="voice-channel-connected-name">{p.username || `User ${p.userId}`}</span>
                    <span className="voice-channel-audio-badges" aria-hidden>
                      {p.mic_muted ? (
                        <span className="voice-channel-audio-badge voice-channel-audio-badge--mute" title="Micrófono silenciado">
                          <VoiceSidebarMicMutedIcon />
                        </span>
                      ) : null}
                      {p.deafened ? (
                        <span className="voice-channel-audio-badge voice-channel-audio-badge--deaf" title="Sordina (no oye el canal)">
                          <VoiceSidebarHeadphonesDeafIcon />
                        </span>
                      ) : null}
                    </span>
                    {liveSharing ? (
                      <span className="voice-channel-live-badge" title="Compartiendo pantalla">
                        EN VIVO
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            className={`channel-item channel-item-discord ${activeChannelId === c.id ? 'active' : ''}`}
            onClick={() => onSelectChannel(c.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectChannel(c.id)
            }}
          >
            <span className="channel-item-main">
              {channelIcon(c)}
              {c.is_private && (
                <span className="channel-lock" title="Private channel">
                  🔒
                </span>
              )}
              <span className="channel-name">{c.name}</span>
            </span>
            <span className="channel-row-tools">
              <button
                type="button"
                className="channel-row-add"
                title="Add channel with same type in this section"
                onClick={(e) => {
                  e.stopPropagation()
                  setCreateUI({ type: 'beside', channelId: c.id })
                }}
              >
                +
              </button>
              <button
                type="button"
                className="channel-row-action"
                title="Delete channel"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteChannel(c.id)
                }}
              >
                🗑
              </button>
            </span>
          </div>
        )}
        {besideOpen && (
          <div ref={popoverRef} className="channel-create-inline channel-create-inline--beside">
            <p className="channel-create-inline-hint">
              New channel (same type as <strong>{c.name}</strong>)
            </p>
            <form
              className="channel-create-inline-form"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!draftName.trim()) return
                await submitNewChannel({
                  name: draftName.trim(),
                  type: c.type,
                  categoryId: c.category_id ?? null,
                  isPrivate: c.is_private,
                })
              }}
            >
              <input
                id="channel-create-beside-name"
                name="channel_name"
                autoFocus
                className="channel-create-inline-input"
                placeholder="channel-name"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
              />
              <button type="submit" className="btn small primary">
                Create
              </button>
              <button type="button" className="btn small ghost" onClick={closeCreate}>
                Cancel
              </button>
            </form>
          </div>
        )}
      </li>
    )
  }

  function renderTopCreatePanel() {
    if (createUI?.type !== 'top') return null
    const tab = createUI.tab
    return (
      <div ref={popoverRef} className="channel-create-inline channel-create-inline--top">
        <div className="channel-create-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'channel'}
            className={`channel-create-tab ${tab === 'channel' ? 'active' : ''}`}
            onClick={() => setCreateUI({ type: 'top', tab: 'channel' })}
          >
            Channel
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'section'}
            className={`channel-create-tab ${tab === 'section' ? 'active' : ''}`}
            onClick={() => setCreateUI({ type: 'top', tab: 'section' })}
          >
            Section
          </button>
        </div>
        {tab === 'section' ? (
          <form
            className="channel-create-inline-form"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!draftName.trim()) return
              await onCreateCategory?.({ name: draftName.trim() })
              closeCreate()
            }}
          >
            <input
              id="channel-create-section-name"
              name="section_name"
              autoFocus
              className="channel-create-inline-input"
              placeholder="Section name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
            <button type="submit" className="btn small primary">
              Create section
            </button>
            <button type="button" className="btn small ghost" onClick={closeCreate}>
              Cancel
            </button>
          </form>
        ) : (
          <form
            className="channel-create-inline-form channel-create-inline-form--stack"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!draftName.trim()) return
              await submitNewChannel({
                name: draftName.trim(),
                type: draftType,
                categoryId: draftCategoryId ? Number(draftCategoryId) : null,
                isPrivate: draftPrivate,
              })
            }}
          >
            <input
              id="channel-create-top-name"
              name="channel_name"
              autoFocus
              className="channel-create-inline-input"
              placeholder="channel-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
            <select
              id="channel-create-top-type"
              name="channel_type"
              className="select-friendly channel-create-select"
              value={draftType}
              onChange={(e) => setDraftType(e.target.value)}
            >
              <option value="text">Text</option>
              <option value="voice">Voice</option>
              <option value="forum">Forum</option>
            </select>
            <select
              id="channel-create-top-category"
              name="channel_category_id"
              className="select-friendly channel-create-select"
              value={draftCategoryId}
              onChange={(e) => setDraftCategoryId(e.target.value)}
            >
              <option value="">No section (top)</option>
              {categories.map((cat) => (
                <option key={cat.id} value={String(cat.id)}>
                  {cat.name}
                </option>
              ))}
            </select>
            <label className="channel-create-private">
              <input
                id="channel-create-top-private"
                name="channel_is_private"
                type="checkbox"
                checked={draftPrivate}
                onChange={(e) => setDraftPrivate(e.target.checked)}
              />
              Private
            </label>
            <div className="channel-create-inline-actions">
              <button type="submit" className="btn small primary">
                Create channel
              </button>
              <button type="button" className="btn small ghost" onClick={closeCreate}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    )
  }

  function renderCategoryCreatePanel(groupId) {
    if (createUI?.type !== 'category' || createUI.categoryId !== groupId) return null
    return (
      <div ref={popoverRef} className="channel-create-inline channel-create-inline--category">
        <form
          className="channel-create-inline-form channel-create-inline-form--stack"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!draftName.trim()) return
            await submitNewChannel({
              name: draftName.trim(),
              type: draftType,
              categoryId: groupId,
              isPrivate: draftPrivate,
            })
          }}
        >
          <input
            id={`channel-create-category-${groupId}-name`}
            name="channel_name"
            autoFocus
            className="channel-create-inline-input"
            placeholder="channel-name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
          <select
            id={`channel-create-category-${groupId}-type`}
            name="channel_type"
            className="select-friendly channel-create-select"
            value={draftType}
            onChange={(e) => setDraftType(e.target.value)}
          >
            <option value="text">Text</option>
            <option value="voice">Voice</option>
            <option value="forum">Forum</option>
          </select>
          <label className="channel-create-private">
            <input
              id={`channel-create-category-${groupId}-private`}
              name="channel_is_private"
              type="checkbox"
              checked={draftPrivate}
              onChange={(e) => setDraftPrivate(e.target.checked)}
            />
            Private
          </label>
          <div className="channel-create-inline-actions">
            <button type="submit" className="btn small primary">
              Create
            </button>
            <button type="button" className="btn small ghost" onClick={closeCreate}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <aside className="channel-column">
      <header className="channel-header">
        <div className="channel-server-bar">
          <button
            type="button"
            className="channel-server-name-btn"
            onClick={() => onOpenServerSettings?.()}
            title="Server settings"
          >
            <span className="channel-server-name">{serverName || 'Server'}</span>
            <span className="channel-server-chevron" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="channel-server-toolbar-btn"
            title="Invite & server overview"
            onClick={() => onOpenServerSettings?.()}
          >
            +
          </button>
        </div>
        <div className="channel-header-row">
          <div className="channel-header-leading">
            <AppChromeToolbar />
            <div className="user-bar" ref={userMenuRef}>
            <button
              type="button"
              className="btn ghost small user-menu-trigger channel-user-trigger"
              onClick={() => setUserMenuOpen((v) => !v)}
            >
              <span className="user-trigger-content">
                {user?.avatar_url && !userAvatarFailed ? (
                  <img
                    className="user-avatar-tiny"
                    src={resolveImageUrl(user.avatar_url)}
                    alt="User avatar"
                    onError={() => setUserAvatarFailed(true)}
                  />
                ) : (
                  <span className="user-avatar-tiny user-avatar-fallback" aria-hidden="true">
                    {avatarInitial}
                  </span>
                )}
                <span>{user?.username || 'User'}</span>
              </span>
            </button>
            {userMenuOpen && (
              <div className="user-menu-popover">
                <button
                  type="button"
                  className="btn link"
                  onClick={async () => {
                    closeUserMenu()
                    const visible = String(user?.presence_status || '').toLowerCase() !== 'invisible'
                    await onSetAppearOnline?.(!visible)
                  }}
                >
                  {String(user?.presence_status || '').toLowerCase() === 'invisible'
                    ? 'Set as online'
                    : 'Set as offline'}
                </button>
                <button
                  type="button"
                  className="btn link"
                  onClick={() => {
                    closeUserMenu()
                    onOpenUserSettings?.()
                  }}
                >
                  Settings
                </button>
                <button
                  type="button"
                  className="btn link"
                  onClick={() => {
                    closeUserMenu()
                    onOpenServerSettings?.()
                  }}
                >
                  Server settings
                </button>
                {user?.is_admin && (
                  <button
                    type="button"
                    className="btn link"
                    onClick={() => {
                      closeUserMenu()
                      onOpenAdminDashboard?.()
                    }}
                  >
                    Admin dashboard
                  </button>
                )}
                <button
                  type="button"
                  className="btn link"
                  onClick={() => {
                    closeUserMenu()
                    onLogout?.()
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
          </div>
          <div className="channel-header-actions">
            <button
              type="button"
              className="channel-server-toolbar-btn channel-server-toolbar-btn--ghost"
              title="Server settings"
              onClick={onOpenServerSettings}
            >
              ⚙
            </button>
          </div>
        </div>
      </header>
      <SchedulerUpcomingWidget streamerUsername={schedulerStreamerUsername} />
      <div className="channel-list-scroll">
        <div className="channel-list-toolbar">
          <span className="channel-list-toolbar-label">Channels</span>
          <button
            type="button"
            className="channel-list-toolbar-add"
            title="Create channel or section"
            onClick={() => setCreateUI({ type: 'top', tab: 'channel' })}
          >
            +
          </button>
        </div>
        {renderTopCreatePanel()}
        <ul
          className="channel-list channel-list-discord"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const raw = e.dataTransfer.getData('text/plain')
            if (!raw) return
            const payload = JSON.parse(raw)
            if (payload.kind === 'channel') {
              onMoveChannel(payload.id, null, null)
            }
          }}
        >
          {uncategorized.map((c) => renderChannelRow(c, { groupId: null }))}
          {grouped.map((group) => (
            <li
              key={group.id}
              className="category-block"
              draggable
              onDragStart={(e) => {
                e.currentTarget.classList.add('is-dragging')
                e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'category', id: group.id }))
              }}
              onDragEnd={(e) => e.currentTarget.classList.remove('is-dragging')}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const raw = e.dataTransfer.getData('text/plain')
                if (!raw) return
                const payload = JSON.parse(raw)
                if (payload.kind === 'category') {
                  onMoveCategory(payload.id, group.id)
                }
                if (payload.kind === 'channel') {
                  onMoveChannel(payload.id, null, group.id)
                }
              }}
            >
              <div className="category-header-discord">
                <button
                  type="button"
                  className="category-chevron-btn"
                  onClick={() => onToggleCategory(group.id)}
                  aria-expanded={!collapsedCategories.includes(group.id)}
                  aria-label={collapsedCategories.includes(group.id) ? 'Expand category' : 'Collapse category'}
                >
                  <span
                    className={`category-chevron ${collapsedCategories.includes(group.id) ? 'is-collapsed' : ''}`}
                  />
                </button>
                <button
                  type="button"
                  className="category-name-discord"
                  onClick={() => onToggleCategory(group.id)}
                >
                  {group.name}
                </button>
                <div className="category-header-actions">
                  <button
                    type="button"
                    className="category-add-btn"
                    title="Add channel in this section"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (collapsedCategories.includes(group.id)) {
                        onToggleCategory(group.id)
                      }
                      setCreateUI({ type: 'category', categoryId: group.id })
                    }}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="category-delete"
                    title="Delete category"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteCategory(group.id)
                    }}
                  >
                    🗑
                  </button>
                </div>
              </div>
              {renderCategoryCreatePanel(group.id)}
              <ul
                className={`category-channels ${
                  collapsedCategories.includes(group.id) ? 'collapsed' : ''
                }`}
              >
                {group.channels.map((c) => renderChannelRow(c, { groupId: group.id }))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
