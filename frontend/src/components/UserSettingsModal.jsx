import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { resolveImageUrl } from '../lib/resolveImageUrl'
import ServerEmojiManager from './ServerEmojiManager'

function toNullable(value) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export default function UserSettingsModal({ open, onClose }) {
  const { user, refreshUser } = useAuth()
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [accentColor, setAccentColor] = useState('#7c3aed')
  const [bio, setBio] = useState('')
  const [presenceStatus, setPresenceStatus] = useState('online')
  const [customStatus, setCustomStatus] = useState('')
  const [schedulerStreamerUsername, setSchedulerStreamerUsername] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [servers, setServers] = useState([])
  const [emojiServerId, setEmojiServerId] = useState('')
  const [emojiList, setEmojiList] = useState([])

  const loadEmojisForServer = useCallback(async (serverId) => {
    if (!serverId) {
      setEmojiList([])
      return
    }
    try {
      const { data } = await api.get(`/servers/${serverId}/emojis`)
      setEmojiList(data)
    } catch {
      setEmojiList([])
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setUsername(user?.username || '')
    setAvatarUrl(user?.avatar_url || '')
    setBannerUrl(user?.banner_url || '')
    setAccentColor(user?.accent_color || '#7c3aed')
    setBio(user?.bio || '')
    setPresenceStatus(user?.presence_status || 'online')
    setCustomStatus(user?.custom_status || '')
    setSchedulerStreamerUsername(user?.scheduler_streamer_username || '')
    setCurrentPassword('')
    setNewPassword('')
    setError('')
    setInfo('')
    ;(async () => {
      try {
        const { data } = await api.get('/servers')
        setServers(data)
        setEmojiServerId((prev) => {
          const ids = new Set(data.map((s) => String(s.id)))
          if (prev && ids.has(prev)) return prev
          return data[0]?.id != null ? String(data[0].id) : ''
        })
      } catch {
        setServers([])
        setEmojiServerId('')
      }
    })()
  }, [open, user])

  useEffect(() => {
    if (!open || !emojiServerId) {
      setEmojiList([])
      return
    }
    loadEmojisForServer(emojiServerId)
  }, [open, emojiServerId, loadEmojisForServer])

  const previewStyle = useMemo(
    () => ({
      border: `1px solid ${accentColor || '#7c3aed'}`,
      borderRadius: '10px',
      overflow: 'hidden',
      background: '#111827',
      marginBottom: '0.7rem',
    }),
    [accentColor]
  )

  async function onSubmit(e) {
    e.preventDefault()
    if (!username.trim()) {
      setError('Username is required')
      return
    }
    if (newPassword && !currentPassword) {
      setError('Current password is required to set a new password')
      return
    }
    setSaving(true)
    setError('')
    setInfo('')
    try {
      await api.patch('/auth/me', {
        username: username.trim(),
        avatar_url: toNullable(avatarUrl),
        banner_url: toNullable(bannerUrl),
        accent_color: toNullable(accentColor),
        bio: toNullable(bio),
        presence_status: presenceStatus,
        custom_status: toNullable(customStatus),
        scheduler_streamer_username: toNullable(schedulerStreamerUsername),
        current_password: newPassword ? currentPassword : undefined,
        new_password: newPassword || undefined,
      })
      await refreshUser()
      setCurrentPassword('')
      setNewPassword('')
      setInfo('Settings saved')
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3>User settings</h3>
          <button type="button" className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </header>

        {error && <div className="error-banner inline">{error}</div>}
        {info && <div className="info-banner">{info}</div>}

        <div style={previewStyle}>
          <div
            style={{
              height: 86,
              backgroundImage: bannerUrl
                ? `url("${resolveImageUrl(bannerUrl).replace(/"/g, '\\"')}")`
                : 'linear-gradient(120deg, #1f2937, #0f172a)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 0.75rem' }}>
            <img
              src={avatarUrl ? resolveImageUrl(avatarUrl) : '/vite.svg'}
              alt="avatar preview"
              style={{ width: 42, height: 42, borderRadius: '999px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.2)' }}
              onError={(e) => {
                e.currentTarget.src = '/vite.svg'
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '999px',
                    display: 'inline-block',
                    background:
                      presenceStatus === 'online'
                        ? '#22c55e'
                        : presenceStatus === 'idle'
                          ? '#f59e0b'
                          : presenceStatus === 'dnd'
                            ? '#ef4444'
                            : '#6b7280',
                  }}
                />
                {username || 'User'}
              </div>
              <div className="muted small" style={{ margin: 0 }}>
                {customStatus || bio || 'No bio/status set'}
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="form-stack">
          <label>
            Username
            <input
              id="settings-username"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={40}
            />
          </label>
          <label>
            Avatar URL
            <input
              id="settings-avatar-url"
              name="avatar_url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>
          <label>
            Banner URL
            <input
              id="settings-banner-url"
              name="banner_url"
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>
          <label>
            Accent color
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                id="settings-accent-color-picker"
                name="accent_color_picker"
                type="color"
                value={/^#([0-9a-fA-F]{6})$/.test(accentColor || '') ? accentColor : '#7c3aed'}
                onChange={(e) => setAccentColor(e.target.value)}
                style={{ width: 48, height: 34, padding: 2 }}
              />
              <input
                id="settings-accent-color-text"
                name="accent_color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                placeholder="#7c3aed"
                maxLength={7}
              />
            </div>
          </label>
          <label>
            Presence
            <select
              id="settings-presence-status"
              name="presence_status"
              value={presenceStatus}
              onChange={(e) => setPresenceStatus(e.target.value)}
              className="select-inline"
            >
              <option value="online">Online</option>
              <option value="idle">Idle</option>
              <option value="dnd">Do Not Disturb</option>
              <option value="invisible">Invisible</option>
            </select>
          </label>
          <label>
            Custom status
            <input
              id="settings-custom-status"
              name="custom_status"
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value)}
              maxLength={120}
              placeholder="What are you up to?"
            />
          </label>
          <label>
            Bio
            <input
              id="settings-bio"
              name="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={240}
              placeholder="About you..."
            />
          </label>
          <label>
            Streamer Scheduler username (public slug)
            <input
              id="settings-scheduler-slug"
              name="scheduler_streamer_username"
              value={schedulerStreamerUsername}
              onChange={(e) => setSchedulerStreamerUsername(e.target.value)}
              maxLength={80}
              placeholder="e.g. Test — must match /streamer/… on Streamer Scheduler"
              autoComplete="off"
            />
            <span className="muted small" style={{ display: 'block', marginTop: 4 }}>
              If your Twitch login differs from your Scheduler profile URL, set the Scheduler account name here so the sidebar schedule and !schedule use the correct API.
            </span>
          </label>
          <label>
            Current password (required only to change password)
            <input
              id="settings-current-password"
              name="current_password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label>
            New password
            <input
              id="settings-new-password"
              name="new_password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </form>

        <div className="user-settings-emoji-block" style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <h4 style={{ margin: '0 0 0.35rem', fontSize: '1rem' }}>Server emojis</h4>
          <p className="muted small" style={{ margin: '0 0 0.65rem' }}>
            Create or delete custom emojis for a server where you have permission (e.g. admin).
          </p>
          {servers.length === 0 ? (
            <p className="muted small">Join or create a server to manage emojis.</p>
          ) : (
            <>
              <label style={{ display: 'block', marginBottom: '0.65rem' }}>
                <span className="muted small" style={{ display: 'block', marginBottom: 4 }}>
                  Server
                </span>
                <select
                  id="settings-emoji-server"
                  name="emoji_server_id"
                  className="select-inline"
                  value={emojiServerId}
                  onChange={(e) => setEmojiServerId(e.target.value)}
                  style={{ width: '100%', maxWidth: 320 }}
                >
                  {servers.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {emojiServerId ? (
                <ServerEmojiManager
                  serverId={Number(emojiServerId)}
                  emojis={emojiList}
                  onReload={() => loadEmojisForServer(emojiServerId)}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
