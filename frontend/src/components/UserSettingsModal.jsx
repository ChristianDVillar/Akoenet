import { useEffect, useMemo, useRef, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}
import { resolveImageUrl } from '../lib/resolveImageUrl'
import { getVoiceAudioConstraints } from '../lib/voiceConstraints'
import { getSavedVoiceSettings } from './VoiceSettingsModal'
import {
  DARK_THEME,
  LIGHT_THEME,
  applyTheme,
  loadTheme,
  sanitizeFull,
  saveTheme,
} from '../lib/themePreferences'

function toNullable(value) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function getVoiceStorageKey(userId) {
  return `akoenet_voice_settings_${userId || 'anon'}`
}

export default function UserSettingsModal({ open, onClose, initialSection = 'profile' }) {
  const { user, refreshUser, logout, logoutAllDevices } = useAuth()
  const [activeSection, setActiveSection] = useState('profile')
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [accentColor, setAccentColor] = useState('#7c3aed')
  const [bio, setBio] = useState('')
  const [presenceStatus, setPresenceStatus] = useState('online')
  const [customStatus, setCustomStatus] = useState('')
  const [schedulerStreamerUsername, setSchedulerStreamerUsername] = useState('')
  const [avatarPreviewFailed, setAvatarPreviewFailed] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [testing, setTesting] = useState(false)
  const [eraseConfirm, setEraseConfirm] = useState('')
  const [exportBusy, setExportBusy] = useState(false)
  const [eraseBusy, setEraseBusy] = useState(false)
  const [logoutAllBusy, setLogoutAllBusy] = useState(false)
  const [totpSetupSecret, setTotpSetupSecret] = useState('')
  const [totpEnableCode, setTotpEnableCode] = useState('')
  const [disable2faPassword, setDisable2faPassword] = useState('')
  const [disable2faCode, setDisable2faCode] = useState('')
  const [micLevel, setMicLevel] = useState(0)
  const [micGain, setMicGain] = useState(100)
  const [monitorMic, setMonitorMic] = useState(true)
  const [startWithCamera, setStartWithCamera] = useState(false)
  const [startMuted, setStartMuted] = useState(false)
  const [startDeafened, setStartDeafened] = useState(false)
  const [uiTheme, setUiTheme] = useState(() => sanitizeFull({}))
  const [themeReady, setThemeReady] = useState(false)
  const streamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const dataRef = useRef(null)
  const gainNodeRef = useRef(null)
  const monitorGainRef = useRef(null)
  const loopRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setActiveSection(initialSection || 'profile')
    setUsername(user?.username || '')
    setAvatarUrl(user?.avatar_url || '')
    setAvatarPreviewFailed(false)
    setBannerUrl(user?.banner_url || '')
    setAccentColor(user?.accent_color || '#7c3aed')
    setBio(user?.bio || '')
    setPresenceStatus(user?.presence_status || 'online')
    setCustomStatus(user?.custom_status || '')
    setSchedulerStreamerUsername(user?.scheduler_streamer_username || '')
    setCurrentPassword('')
    setNewPassword('')
    setEraseConfirm('')
    setError('')
    setInfo('')
    const voice = getSavedVoiceSettings(user?.id)
    setMicGain(voice.micGain)
    setMonitorMic(voice.monitorMic)
    setStartWithCamera(voice.startWithCamera)
    setStartMuted(voice.startMuted)
    setStartDeafened(voice.startDeafened)
  }, [open, user, initialSection])

  useEffect(() => {
    if (!open) {
      setThemeReady(false)
      return
    }
    setUiTheme(loadTheme(user?.id))
    setThemeReady(true)
  }, [open, user?.id])

  useEffect(() => {
    if (!open || !themeReady) return
    if (activeSection === 'appearance') {
      const t = saveTheme(user?.id, uiTheme)
      applyTheme(t, { accentColor: accentColor || user?.accent_color })
    } else {
      applyTheme(loadTheme(user?.id), { accentColor: accentColor || user?.accent_color })
    }
  }, [open, themeReady, activeSection, uiTheme, accentColor, user?.accent_color, user?.id])

  useEffect(() => {
    setAvatarPreviewFailed(false)
  }, [avatarUrl])

  useEffect(() => {
    if (!open) stopMicTest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    try {
      localStorage.setItem(
        getVoiceStorageKey(user?.id),
        JSON.stringify({
          micGain,
          monitorMic,
          startWithCamera,
          cameraEnabled: startWithCamera,
          startMuted,
          startDeafened,
        }),
      )
    } catch {
      /* ignore storage errors */
    }
    if (gainNodeRef.current) gainNodeRef.current.gain.value = micGain / 100
    if (monitorGainRef.current) monitorGainRef.current.gain.value = monitorMic ? 1 : 0
  }, [open, user?.id, micGain, monitorMic, startWithCamera, startMuted, startDeafened])

  const previewStyle = useMemo(
    () => ({
      border: `1px solid ${accentColor || '#7c3aed'}`,
      borderRadius: '10px',
      overflow: 'hidden',
      background: '#111827',
      marginBottom: '0.7rem',
    }),
    [accentColor],
  )

  async function downloadMyData() {
    setExportBusy(true)
    setError('')
    setInfo('')
    try {
      const { data } = await api.get('/auth/me/export', { responseType: 'blob' })
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `akoenet-user-${user?.id}-export.json`
      a.click()
      window.URL.revokeObjectURL(url)
      setInfo('Data export downloaded.')
    } catch {
      setError('Could not download your data export.')
    } finally {
      setExportBusy(false)
    }
  }

  async function eraseMyAccount() {
    if (eraseConfirm.trim().toUpperCase() !== 'DELETE') {
      setError('Type DELETE in the box to confirm account erasure.')
      return
    }
    setEraseBusy(true)
    setError('')
    setInfo('')
    try {
      await api.delete('/auth/me', { data: { reason: 'User requested self-service account erasure (Settings).' } })
      onClose()
      logout()
    } catch {
      setError('Could not erase account. Try again or contact support.')
    } finally {
      setEraseBusy(false)
    }
  }

  async function saveUserSettings() {
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
      const code = err.response?.data?.error
      setError(
        code === 'blocked_content'
          ? err.response?.data?.message || 'That text is not allowed.'
          : err.response?.data?.error || 'Could not save settings'
      )
    } finally {
      setSaving(false)
    }
  }

  function computeLevel() {
    const analyser = analyserRef.current
    const data = dataRef.current
    if (!analyser || !data) return 0
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i += 1) {
      const centered = (data[i] - 128) / 128
      sum += centered * centered
    }
    return Math.sqrt(sum / data.length)
  }

  function startLoop() {
    if (loopRef.current) return
    loopRef.current = window.setInterval(() => {
      const level = computeLevel()
      setMicLevel(Math.min(1, level * 4))
    }, 120)
  }

  function stopLoop() {
    if (!loopRef.current) return
    window.clearInterval(loopRef.current)
    loopRef.current = null
  }

  async function startMicTest() {
    if (testing) return
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: getVoiceAudioConstraints() })
      streamRef.current = stream
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) {
        setError('AudioContext is not supported in this browser')
        stopMicTest()
        return
      }
      const ctx = new Ctx()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      await ctx.resume()
      const gain = ctx.createGain()
      gain.gain.value = micGain / 100
      const monitorGain = ctx.createGain()
      monitorGain.gain.value = monitorMic ? 1 : 0
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.5
      source.connect(gain)
      gain.connect(analyser)
      gain.connect(monitorGain)
      monitorGain.connect(ctx.destination)
      gainNodeRef.current = gain
      monitorGainRef.current = monitorGain
      analyserRef.current = analyser
      dataRef.current = new Uint8Array(analyser.fftSize)
      startLoop()
      setTesting(true)
    } catch {
      setError('Microphone access is not available for the test')
    }
  }

  function stopMicTest() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {})
    }
    audioCtxRef.current = null
    analyserRef.current = null
    dataRef.current = null
    gainNodeRef.current = null
    monitorGainRef.current = null
    stopLoop()
    setMicLevel(0)
    setTesting(false)
  }

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card user-settings-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3>User settings</h3>
          <button type="button" className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </header>

        {error && <div className="error-banner inline">{error}</div>}
        {info && <div className="info-banner">{info}</div>}

        <div className="settings-split-layout">
          <aside className="settings-split-nav">
            <button type="button" className={`settings-split-nav-btn ${activeSection === 'profile' ? 'active' : ''}`} onClick={() => setActiveSection('profile')}>Profile</button>
            <button type="button" className={`settings-split-nav-btn ${activeSection === 'appearance' ? 'active' : ''}`} onClick={() => setActiveSection('appearance')}>Appearance</button>
            <button type="button" className={`settings-split-nav-btn ${activeSection === 'account' ? 'active' : ''}`} onClick={() => setActiveSection('account')}>Account</button>
            <button type="button" className={`settings-split-nav-btn ${activeSection === 'voice' ? 'active' : ''}`} onClick={() => setActiveSection('voice')}>Voice</button>
          </aside>

          <section className="settings-split-content">
            {activeSection === 'profile' && (
              <form onSubmit={(e) => { e.preventDefault(); saveUserSettings() }} className="form-stack">
                <div style={previewStyle}>
                  <div style={{ height: 86, backgroundImage: bannerUrl ? `url("${resolveImageUrl(bannerUrl).replace(/"/g, '\\"')}")` : 'linear-gradient(120deg, #1f2937, #0f172a)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 0.75rem' }}>
                    {avatarUrl && !avatarPreviewFailed ? (
                      <img
                        src={resolveImageUrl(avatarUrl)}
                        alt="avatar preview"
                        style={{ width: 42, height: 42, borderRadius: '999px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.2)' }}
                        onError={() => setAvatarPreviewFailed(true)}
                      />
                    ) : (
                      <span
                        className="user-avatar-fallback"
                        aria-hidden="true"
                        style={{ width: 42, height: 42, borderRadius: '999px', border: '1px solid rgba(255,255,255,0.2)' }}
                      >
                        {String(username || user?.username || 'U').trim().charAt(0).toUpperCase() || 'U'}
                      </span>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '999px', display: 'inline-block', background: presenceStatus === 'online' ? '#22c55e' : presenceStatus === 'idle' ? '#f59e0b' : presenceStatus === 'dnd' ? '#ef4444' : '#6b7280' }} />
                        {username || 'User'}
                      </div>
                      <div className="muted small" style={{ margin: 0 }}>{customStatus || bio || 'No bio/status set'}</div>
                    </div>
                  </div>
                </div>
                <label>Username<input id="settings-username" name="username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={40} /></label>
                <label>Avatar URL<input id="settings-avatar-url" name="avatar_url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." /></label>
                <label>Banner URL<input id="settings-banner-url" name="banner_url" value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://..." /></label>
                <label>Accent color<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input id="settings-accent-color-picker" name="accent_color_picker" type="color" value={/^#([0-9a-fA-F]{6})$/.test(accentColor || '') ? accentColor : '#7c3aed'} onChange={(e) => setAccentColor(e.target.value)} style={{ width: 48, height: 34, padding: 2 }} /><input id="settings-accent-color-text" name="accent_color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} placeholder="#7c3aed" maxLength={7} /></div></label>
                <label>Presence<select id="settings-presence-status" name="presence_status" value={presenceStatus} onChange={(e) => setPresenceStatus(e.target.value)} className="select-inline"><option value="online">Online</option><option value="idle">Idle</option><option value="dnd">Do Not Disturb</option><option value="invisible">Invisible</option></select></label>
                <label>Custom status<input id="settings-custom-status" name="custom_status" value={customStatus} onChange={(e) => setCustomStatus(e.target.value)} maxLength={120} placeholder="What are you up to?" /></label>
                <label>Bio<input id="settings-bio" name="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={240} placeholder="About you..." /></label>
                <label>Streamer Scheduler username (public slug)<input id="settings-scheduler-slug" name="scheduler_streamer_username" value={schedulerStreamerUsername} onChange={(e) => setSchedulerStreamerUsername(e.target.value)} maxLength={80} placeholder="e.g. Test — must match /streamer/… on Streamer Scheduler" autoComplete="off" /><span className="muted small" style={{ display: 'block', marginTop: 4 }}>If your Twitch login differs from your Scheduler profile URL, set the Scheduler account name here so the sidebar schedule and !schedule use the correct API.</span></label>
                <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
              </form>
            )}

            {activeSection === 'appearance' && (
              <div className="form-stack appearance-theme-panel">
                <p className="muted small" style={{ margin: '0 0 0.5rem' }}>
                  Choose light or dark appearance, or match your system. Custom colors apply only when Dark or Light is selected. Accent for buttons is saved on your profile (Profile tab).
                </p>
                <div className="theme-mode-row" role="group" aria-label="Appearance mode">
                  {[
                    { id: 'system', label: 'System' },
                    { id: 'light', label: 'Light' },
                    { id: 'dark', label: 'Dark' },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      className={`theme-mode-btn ${uiTheme.colorMode === id ? 'is-active' : ''}`}
                      onClick={() => {
                        if (id === 'system') {
                          setUiTheme((prev) => ({ ...prev, colorMode: 'system' }))
                          return
                        }
                        if (id === 'light') {
                          setUiTheme(sanitizeFull({ colorMode: 'light', ...LIGHT_THEME }))
                          return
                        }
                        setUiTheme(sanitizeFull({ colorMode: 'dark', ...DARK_THEME }))
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {uiTheme.colorMode === 'system' && (
                  <p className="info-banner inline" style={{ marginBottom: '0.65rem' }}>
                    Interface follows your OS light/dark setting. Pick Light or Dark above to customize colors below.
                  </p>
                )}
                {[
                  { key: 'bg', label: 'Page background' },
                  { key: 'panel', label: 'Panels & cards' },
                  { key: 'rail', label: 'Sidebar rail' },
                  { key: 'text', label: 'Main text' },
                  { key: 'muted', label: 'Muted text' },
                  { key: 'echonet', label: 'Secondary accent (links, focus)' },
                  { key: 'danger', label: 'Danger / errors' },
                ].map(({ key, label }) => {
                  const hex = uiTheme[key]
                  const ok = /^#([0-9a-fA-F]{6})$/.test(hex || '')
                  return (
                    <label key={key} className="theme-color-row">
                      <span className="theme-color-label">{label}</span>
                      <div className="theme-color-inputs">
                        <input
                          type="color"
                          aria-label={`${label} color`}
                          value={ok ? hex : '#000000'}
                          disabled={uiTheme.colorMode === 'system'}
                          onChange={(e) => setUiTheme((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="theme-color-swatch"
                        />
                        <input
                          type="text"
                          value={hex}
                          disabled={uiTheme.colorMode === 'system'}
                          onChange={(e) => setUiTheme((prev) => ({ ...prev, [key]: e.target.value }))}
                          maxLength={7}
                          placeholder="#000000"
                          className="theme-color-hex"
                          spellCheck={false}
                          autoComplete="off"
                        />
                      </div>
                    </label>
                  )
                })}
                <label className="theme-color-row">
                  <span className="theme-color-label">Border tint</span>
                  <div className="theme-color-inputs">
                    <input
                      type="color"
                      aria-label="Border color"
                      value={/^#([0-9a-fA-F]{6})$/.test(uiTheme.borderColor || '') ? uiTheme.borderColor : '#ffffff'}
                      disabled={uiTheme.colorMode === 'system'}
                      onChange={(e) => setUiTheme((prev) => ({ ...prev, borderColor: e.target.value }))}
                      className="theme-color-swatch"
                    />
                    <input
                      type="text"
                      value={uiTheme.borderColor}
                      disabled={uiTheme.colorMode === 'system'}
                      onChange={(e) => setUiTheme((prev) => ({ ...prev, borderColor: e.target.value }))}
                      maxLength={7}
                      className="theme-color-hex"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                </label>
                <div className="theme-border-opacity-row">
                  <label htmlFor="theme-border-opacity">Border visibility ({uiTheme.borderOpacity}%)</label>
                  <input
                    id="theme-border-opacity"
                    type="range"
                    min={0}
                    max={40}
                    value={uiTheme.borderOpacity}
                    disabled={uiTheme.colorMode === 'system'}
                    onChange={(e) =>
                      setUiTheme((prev) => ({ ...prev, borderOpacity: Number(e.target.value) }))
                    }
                  />
                </div>
                <div className="appearance-theme-actions">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      let next
                      if (uiTheme.colorMode === 'system') {
                        next = sanitizeFull({ colorMode: 'dark', ...DARK_THEME })
                      } else if (uiTheme.colorMode === 'light') {
                        next = sanitizeFull({ colorMode: 'light', ...LIGHT_THEME })
                      } else {
                        next = sanitizeFull({ colorMode: 'dark', ...DARK_THEME })
                      }
                      setUiTheme(next)
                      saveTheme(user?.id, next)
                      applyTheme(next, { accentColor: accentColor || user?.accent_color })
                      setInfo('Theme reset to defaults')
                    }}
                  >
                    Reset to defaults
                  </button>
                </div>
              </div>
            )}

            {activeSection === 'account' && (
              <div className="form-stack">
                <form onSubmit={(e) => { e.preventDefault(); saveUserSettings() }} className="form-stack">
                  <label>Current password (required only to change password)<input id="settings-current-password" name="current_password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
                  <label>New password<input id="settings-new-password" name="new_password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
                  <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save account settings'}</button>
                </form>
                <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <h4 className="muted small" style={{ margin: '0 0 0.5rem' }}>Sessions</h4>
                  <p className="muted small" style={{ margin: '0 0 0.5rem' }}>
                    Sign out everywhere. Other devices lose refresh access; this browser session ends now.
                  </p>
                  <button
                    type="button"
                    className="btn secondary small"
                    disabled={logoutAllBusy}
                    onClick={async () => {
                      setError('')
                      setInfo('')
                      setLogoutAllBusy(true)
                      try {
                        await logoutAllDevices()
                        onClose()
                      } catch {
                        setError('Could not sign out all devices.')
                      } finally {
                        setLogoutAllBusy(false)
                      }
                    }}
                  >
                    {logoutAllBusy ? 'Signing out…' : 'Sign out all devices'}
                  </button>
                </div>
                <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <h4 className="muted small" style={{ margin: '0 0 0.5rem' }}>Two-factor authentication</h4>
                  {user?.totp_enabled ? (
                    <div className="form-stack">
                      <p className="muted small">2FA is enabled.</p>
                      <label>
                        Current password
                        <input
                          type="password"
                          value={disable2faPassword}
                          onChange={(e) => setDisable2faPassword(e.target.value)}
                          autoComplete="current-password"
                        />
                      </label>
                      <label>
                        Authenticator code
                        <input value={disable2faCode} onChange={(e) => setDisable2faCode(e.target.value)} />
                      </label>
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={async () => {
                          setError('')
                          try {
                            await api.post('/auth/2fa/disable', {
                              password: disable2faPassword,
                              code: disable2faCode,
                            })
                            setDisable2faPassword('')
                            setDisable2faCode('')
                            await refreshUser()
                            setInfo('2FA disabled.')
                          } catch {
                            setError('Could not disable 2FA.')
                          }
                        }}
                      >
                        Disable 2FA
                      </button>
                    </div>
                  ) : (
                    <div className="form-stack">
                      {!totpSetupSecret ? (
                        <button
                          type="button"
                          className="btn secondary small"
                          onClick={async () => {
                            setError('')
                            try {
                              const { data } = await api.post('/auth/2fa/setup')
                              setTotpSetupSecret(data.secret)
                              setInfo('Enter the secret in your authenticator app, then confirm with a code.')
                            } catch {
                              setError('Could not start 2FA setup.')
                            }
                          }}
                        >
                          Set up authenticator
                        </button>
                      ) : (
                        <>
                          <p className="muted small" style={{ wordBreak: 'break-all' }}>
                            Secret: {totpSetupSecret}
                          </p>
                          <label>
                            6-digit code
                            <input value={totpEnableCode} onChange={(e) => setTotpEnableCode(e.target.value)} />
                          </label>
                          <button
                            type="button"
                            className="btn primary small"
                            onClick={async () => {
                              setError('')
                              try {
                                await api.post('/auth/2fa/enable', { code: totpEnableCode })
                                setTotpSetupSecret('')
                                setTotpEnableCode('')
                                await refreshUser()
                                setInfo('2FA enabled.')
                              } catch {
                                setError('Invalid code.')
                              }
                            }}
                          >
                            Enable 2FA
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  <h4 className="muted small" style={{ margin: '1rem 0 0.5rem' }}>Browser notifications</h4>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={async () => {
                      setError('')
                      try {
                        const { data } = await api.get('/auth/push/vapid-public-key')
                        if (!data?.publicKey) {
                          setError('Push not configured (set VAPID keys on server).')
                          return
                        }
                        const reg = await navigator.serviceWorker.register('/sw.js')
                        const sub = await reg.pushManager.subscribe({
                          userVisibleOnly: true,
                          applicationServerKey: urlBase64ToUint8Array(data.publicKey),
                        })
                        const j = sub.toJSON()
                        await api.post('/auth/push/subscribe', {
                          endpoint: j.endpoint,
                          keys: { p256dh: j.keys.p256dh, auth: j.keys.auth },
                        })
                        setInfo('Push notifications enabled for this browser.')
                      } catch {
                        setError('Could not enable push (HTTPS + VAPID required).')
                      }
                    }}
                  >
                    Enable push notifications
                  </button>
                </div>
                <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <h4 className="muted small" style={{ margin: '0 0 0.5rem' }}>Data & privacy</h4>
                  <p className="muted small" style={{ margin: '0 0 0.75rem' }}>
                    Download a JSON copy of your profile, memberships, and messages you sent (portability). Account deletion anonymizes your account per our retention policy.
                  </p>
                  <button type="button" className="btn secondary" disabled={exportBusy} onClick={downloadMyData}>
                    {exportBusy ? 'Preparing…' : 'Download my data'}
                  </button>
                </div>
                <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(239,68,68,0.25)' }}>
                  <h4 className="muted small" style={{ margin: '0 0 0.5rem', color: '#fca5a5' }}>Delete account</h4>
                  <p className="muted small" style={{ margin: '0 0 0.75rem' }}>
                    This cannot be undone. Type <strong>DELETE</strong> to confirm, then erase your account.
                  </p>
                  <label>
                    Confirmation
                    <input
                      id="settings-erase-confirm"
                      name="erase_confirm"
                      type="text"
                      value={eraseConfirm}
                      onChange={(e) => setEraseConfirm(e.target.value)}
                      placeholder="DELETE"
                      autoComplete="off"
                    />
                  </label>
                  <button type="button" className="btn danger" disabled={eraseBusy} onClick={eraseMyAccount}>
                    {eraseBusy ? 'Erasing…' : 'Erase my account'}
                  </button>
                </div>
              </div>
            )}

            {activeSection === 'voice' && (
              <>
                <p className="muted small">Choose how voice starts by default and test your microphone without leaving this modal.</p>
                <div className="voice-settings-row"><label>Microphone volume ({micGain}%)</label><input id="voice-settings-mic-gain" name="mic_gain" type="range" min="0" max="200" value={micGain} onChange={(e) => setMicGain(Number(e.target.value))} /></div>
                <div className="voice-setting-toggle-row" style={{ marginTop: '0.5rem' }}><span className="voice-setting-toggle-label">Mic monitor while testing</span><button id="voice-settings-monitor-mic" name="monitor_mic" type="button" className={`voice-setting-toggle-btn ${monitorMic ? 'is-active' : ''}`} onClick={() => setMonitorMic((prev) => !prev)}><span className="voice-setting-toggle-icon" aria-hidden>{monitorMic ? '🎧' : '📊'}</span><span>{monitorMic ? 'On - hear mic' : 'Off - meter only'}</span></button></div>
                <div className="voice-setting-toggle-row"><span className="voice-setting-toggle-label">Start with camera</span><button id="voice-settings-camera-enabled" name="camera_enabled" type="button" className={`voice-setting-toggle-btn ${startWithCamera ? 'is-active' : ''}`} onClick={() => setStartWithCamera((prev) => !prev)}><span className="voice-setting-toggle-icon" aria-hidden>{startWithCamera ? '📷' : '🚫'}</span><span>{startWithCamera ? 'Camera on' : 'Camera off'}</span></button></div>
                <div className="voice-setting-toggle-row"><span className="voice-setting-toggle-label">Start muted</span><button id="voice-settings-start-muted" name="start_muted" type="button" className={`voice-setting-toggle-btn ${startMuted ? 'is-active' : ''}`} onClick={() => setStartMuted((prev) => { const next = !prev; if (!next) setStartDeafened(false); return next })}><span className="voice-setting-toggle-icon" aria-hidden>{startMuted ? '🔇' : '🎙️'}</span><span>{startMuted ? 'Muted' : 'Unmuted'}</span></button></div>
                <div className="voice-setting-toggle-row"><span className="voice-setting-toggle-label">Start deafened</span><button id="voice-settings-start-deafened" name="start_deafened" type="button" className={`voice-setting-toggle-btn ${startDeafened ? 'is-active' : ''}`} onClick={() => setStartDeafened((prev) => { const next = !prev; if (next) setStartMuted(true); return next })}><span className="voice-setting-toggle-icon" aria-hidden>{startDeafened ? '🙉' : '👂'}</span><span>{startDeafened ? 'Deafened' : 'Listening'}</span></button></div>
                <div className="mic-status"><span className="muted small">{testing ? monitorMic ? 'Listening to mic — adjust volume; meter shows input level' : 'Meter only — enable “Hear microphone” to listen' : 'Start test to hear the mic and see level'}</span><div className="mic-meter"><span className="mic-meter-fill" style={{ width: `${Math.max(6, Math.round(micLevel * 100))}%` }} /></div></div>
                <div className="voice-controls">{!testing ? <button type="button" className="btn secondary" onClick={startMicTest}>Test microphone</button> : <button type="button" className="btn ghost" onClick={stopMicTest}>Stop test</button>}</div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
