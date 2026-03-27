import { useCallback, useState } from 'react'
import { useDismissiblePopover } from '../hooks/useDismissiblePopover'

export default function ChannelList({
  serverName,
  categories,
  channels,
  activeChannelId,
  onSelectChannel,
  newCategory,
  setNewCategory,
  onAddCategory,
  onDeleteCategory,
  newChannel,
  setNewChannel,
  newChannelType,
  setNewChannelType,
  selectedCategory,
  setSelectedCategory,
  onAddChannel,
  onDeleteChannel,
  onMoveChannel,
  onMoveCategory,
  collapsedCategories,
  onToggleCategory,
  user,
  onLogout,
  onOpenUserSettings,
  onOpenVoiceSettings,
  onOpenServerSettings,
  onOpenAdminDashboard,
}) {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const closeUserMenu = useCallback(() => setUserMenuOpen(false), [])
  const userMenuRef = useDismissiblePopover(userMenuOpen, closeUserMenu)
  const grouped = categories.map((category) => ({
    ...category,
    channels: channels.filter((c) => c.category_id === category.id),
  }))
  const uncategorized = channels.filter((c) => !c.category_id)

  return (
    <aside className="channel-column">
      <header className="channel-header">
        <h2>{serverName || 'Server'}</h2>
        <div className="channel-header-row">
          <div className="user-bar" ref={userMenuRef}>
            <button
              type="button"
              className="btn ghost small user-menu-trigger"
              onClick={() => setUserMenuOpen((v) => !v)}
            >
              <span className="user-trigger-content">
                <img
                  className="user-avatar-tiny"
                  src={user?.avatar_url || '/vite.svg'}
                  alt="User avatar"
                  onError={(e) => {
                    e.currentTarget.src = '/vite.svg'
                  }}
                />
                <span>{user?.username || 'User'}</span>
              </span>
            </button>
            {userMenuOpen && (
              <div className="user-menu-popover">
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
                    onOpenVoiceSettings?.()
                  }}
                >
                  Voice settings
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
          <div className="channel-header-actions">
            <button
              type="button"
              className="btn ghost small"
              title="Server settings"
              onClick={onOpenServerSettings}
            >
              ⚙
            </button>
          </div>
        </div>
      </header>
      <div className="channel-section-label">Channels</div>
      <ul
        className="channel-list"
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
        {uncategorized.map((c) => (
          <li
            key={c.id}
            className="draggable-item"
            draggable
            onDragStart={(e) => {
              e.currentTarget.classList.add('is-dragging')
              e.dataTransfer.setData(
                'text/plain',
                JSON.stringify({ kind: 'channel', id: c.id })
              )
            }}
            onDragEnd={(e) => e.currentTarget.classList.remove('is-dragging')}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const raw = e.dataTransfer.getData('text/plain')
              if (!raw) return
              const payload = JSON.parse(raw)
              if (payload.kind === 'channel') {
                onMoveChannel(payload.id, c.id, null)
              }
            }}
          >
            <div
              role="button"
              tabIndex={0}
              className={`channel-item ${activeChannelId === c.id ? 'active' : ''}`}
              onClick={() => onSelectChannel(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelectChannel(c.id)
              }}
            >
              <span className="hash">{c.type === 'voice' ? '🔊' : c.type === 'forum' ? '🗂' : '#'}</span>
              <span className="channel-name">{c.name}</span>
              <button
                type="button"
                className="channel-delete"
                title="Delete channel"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteChannel(c.id)
                }}
              >
                🗑
              </button>
            </div>
          </li>
        ))}
        {grouped.map((group) => (
          <li
            key={group.id}
            className="category-block"
            draggable
            onDragStart={(e) => {
              e.currentTarget.classList.add('is-dragging')
              e.dataTransfer.setData(
                'text/plain',
                JSON.stringify({ kind: 'category', id: group.id })
              )
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
            <button
              type="button"
              className="category-title-btn"
              onClick={() => onToggleCategory(group.id)}
            >
              <span className="category-title">
                {collapsedCategories.includes(group.id) ? '▸' : '▾'} {group.name}
              </span>
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
            <ul
              className={`category-channels ${
                collapsedCategories.includes(group.id) ? 'collapsed' : ''
              }`}
            >
              {group.channels.map((c) => (
                <li
                  key={c.id}
                  className="draggable-item"
                  draggable
                  onDragStart={(e) => {
                    e.currentTarget.classList.add('is-dragging')
                    e.dataTransfer.setData(
                      'text/plain',
                      JSON.stringify({ kind: 'channel', id: c.id })
                    )
                  }}
                  onDragEnd={(e) => e.currentTarget.classList.remove('is-dragging')}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const raw = e.dataTransfer.getData('text/plain')
                    if (!raw) return
                    const payload = JSON.parse(raw)
                    if (payload.kind === 'channel') {
                      onMoveChannel(payload.id, c.id, group.id)
                    }
                  }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className={`channel-item ${activeChannelId === c.id ? 'active' : ''}`}
                    onClick={() => onSelectChannel(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') onSelectChannel(c.id)
                    }}
                  >
                    <span className="hash">{c.type === 'voice' ? '🔊' : c.type === 'forum' ? '🗂' : '#'}</span>
                    <span className="channel-name">{c.name}</span>
                    <button
                      type="button"
                      className="channel-delete"
                      title="Delete channel"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteChannel(c.id)
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <form className="new-category-form" onSubmit={onAddCategory}>
        <input
          placeholder="New category"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
        />
        <button type="submit" className="btn small secondary">
          +
        </button>
      </form>
      <form className="new-channel-form" onSubmit={onAddChannel}>
        <input
          placeholder="New channel"
          value={newChannel}
          onChange={(e) => setNewChannel(e.target.value)}
        />
        <select
          value={newChannelType}
          onChange={(e) => setNewChannelType(e.target.value)}
          className="select-inline"
        >
          <option value="text">text</option>
          <option value="voice">voice</option>
          <option value="forum">forum</option>
        </select>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="select-inline"
        >
          <option value="">no category</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn small primary">
          +
        </button>
      </form>
    </aside>
  )
}
