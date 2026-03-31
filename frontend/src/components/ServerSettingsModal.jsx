import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import {
  INVITE_TEMP_EXPIRY_HOURS,
  INVITE_TEMP_MAX_USES_MULTI,
  buildInviteCreatePayload,
  formatInviteSummary,
  getInviteShareOrigin,
  inviteFullUrl,
  summarizeInvitePolicy,
} from '../lib/invites'
import ServerEmojiManager from './ServerEmojiManager'

export default function ServerSettingsModal({ open, onClose, serverId, serverName }) {
  const [inviteType, setInviteType] = useState('temporary')
  /** For 7-day links only: one person vs up to N. */
  const [tempUsesMode, setTempUsesMode] = useState('multi')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [lastInviteSummary, setLastInviteSummary] = useState('')
  const [activeInvites, setActiveInvites] = useState([])
  const [emojiList, setEmojiList] = useState([])
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [copyNotice, setCopyNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const copyTimerRef = useRef(null)

  const shareOrigin = getInviteShareOrigin()

  useEffect(() => {
    setInviteLink('')
    setInviteToken('')
    setLastInviteSummary('')
  }, [inviteType, tempUsesMode])

  function flashCopy(message) {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    setCopyNotice(message)
    copyTimerRef.current = window.setTimeout(() => setCopyNotice(''), 2000)
  }

  useEffect(() => {
    if (!open || !serverId) return
    loadInvites()
    loadEmojis()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, serverId])

  async function loadInvites() {
    if (!serverId) return
    try {
      const { data } = await api.get(`/servers/${serverId}/invites`)
      setActiveInvites(data)
      setError('')
    } catch {
      setActiveInvites([])
      setError('Could not load invites for this server')
    }
  }

  async function loadEmojis() {
    if (!serverId) return
    try {
      const { data } = await api.get(`/servers/${serverId}/emojis`)
      setEmojiList(data)
    } catch {
      setEmojiList([])
    }
  }

  async function createInvite(e) {
    e.preventDefault()
    if (!serverId) {
      setError('Missing server selection')
      return
    }
    setError('')
    setInfo('')
    setCopyNotice('')
    setBusy(true)
    try {
      const payload = buildInviteCreatePayload(inviteType, tempUsesMode === 'single')
      const { data } = await api.post(`/servers/${serverId}/invites`, payload)
      const token = String(data?.token || '').trim()
      setInviteToken(token)
      setInviteLink(token ? inviteFullUrl(shareOrigin, token) : '')
      setLastInviteSummary(summarizeInvitePolicy(data))
      setInfo('Invite created. Copy the link or code below to share.')
      await loadInvites()
    } catch (err) {
      const msg =
        err.response?.status === 403
          ? 'You do not have permission to create invites'
          : 'Could not create invite'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  async function revokeInvite(inviteId) {
    if (!serverId || !inviteId) return
    setError('')
    setInfo('')
    try {
      await api.delete(`/servers/${serverId}/invites/${inviteId}`)
      setInfo('Invite revoked')
      await loadInvites()
    } catch {
      setError('Could not revoke invite')
    }
  }

  async function copyText(value, successLabel) {
    try {
      await navigator.clipboard.writeText(value)
      flashCopy(successLabel || 'Copied')
    } catch {
      setError('Could not copy to clipboard')
    }
  }

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3>Server settings · {serverName || 'Server'}</h3>
          <button type="button" className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </header>

        {error && <div className="error-banner inline">{error}</div>}
        {info && <div className="info-banner">{info}</div>}

        <form onSubmit={createInvite} className="form-stack invite-create-form">
          <div>
            <label htmlFor="server-invite-type">Invite link type</label>
            <select
              id="server-invite-type"
              name="invite_type"
              value={inviteType}
              onChange={(e) => setInviteType(e.target.value)}
              className="select-inline"
            >
              <option value="temporary">7-day link (good for events or trials)</option>
              <option value="permanent">Never expires (until you revoke)</option>
            </select>
            <p className="muted small invite-type-hint">
              {inviteType === 'temporary'
                ? `Expires after ${INVITE_TEMP_EXPIRY_HOURS / 24} days. Choose whether one person or up to ${INVITE_TEMP_MAX_USES_MULTI} people can use it.`
                : 'Anyone with the link can join until you revoke it. Use when you want a long-lived invite.'}
            </p>
          </div>

          {inviteType === 'temporary' ? (
            <fieldset className="invite-audience-fieldset">
              <legend className="invite-audience-legend">Who can use this link?</legend>
              <label className="invite-toggle">
                <input
                  id="server-invite-uses-single"
                  name="temp_uses_mode"
                  type="radio"
                  checked={tempUsesMode === 'single'}
                  onChange={() => setTempUsesMode('single')}
                />
                <span>One person only (first redeem wins)</span>
              </label>
              <label className="invite-toggle">
                <input
                  id="server-invite-uses-multi"
                  name="temp_uses_mode"
                  type="radio"
                  checked={tempUsesMode === 'multi'}
                  onChange={() => setTempUsesMode('multi')}
                />
                <span>Up to {INVITE_TEMP_MAX_USES_MULTI} people</span>
              </label>
            </fieldset>
          ) : null}

          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Generating…' : 'Generate invite link'}
          </button>
          <p className="muted small invite-share-explainer">
            Share the full link for one-click join. People can also paste the invite code on the home or dashboard
            “Join with invite” field if they only have the token.
          </p>
        </form>

        {inviteLink ? (
          <div className="invite-link-box invite-link-box-generated">
            <label htmlFor="server-invite-link-output" className="sr-only">
              Invite link URL
            </label>
            <input id="server-invite-link-output" name="invite_link" value={inviteLink} readOnly />
            <div className="invite-share-actions">
              <button type="button" className="btn ghost" onClick={() => copyText(inviteLink, 'Link copied')}>
                Copy link
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => inviteToken && copyText(inviteToken, 'Code copied')}
                disabled={!inviteToken}
              >
                Copy code only
              </button>
              {copyNotice ? (
                <span className="invite-copy-notice" role="status">
                  {copyNotice}
                </span>
              ) : null}
            </div>
            {lastInviteSummary ? <p className="muted small invite-policy-echo">{lastInviteSummary}</p> : null}
          </div>
        ) : null}

        <div className="invite-list">
          <h3>Active invites</h3>
          {activeInvites.length === 0 ? (
            <p className="muted small">No active invites yet.</p>
          ) : (
            <ul>
              {activeInvites.map((inv) => {
                const full = inviteFullUrl(shareOrigin, inv.token)
                const tok = String(inv.token || '')
                return (
                  <li key={inv.id}>
                    <div className="invite-meta">
                      <input id={`server-invite-active-${inv.id}`} name={`invite_token_${inv.id}`} value={full} readOnly />
                      <small className="muted">{formatInviteSummary(inv)}</small>
                    </div>
                    <div className="invite-active-actions">
                      <button type="button" className="btn small ghost" onClick={() => copyText(full, 'Link copied')}>
                        Copy link
                      </button>
                      <button
                        type="button"
                        className="btn small ghost"
                        onClick={() => tok && copyText(tok, 'Code copied')}
                        disabled={!tok}
                      >
                        Copy code
                      </button>
                      <button type="button" className="btn small secondary" onClick={() => revokeInvite(inv.id)}>
                        Revoke
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="invite-list" style={{ marginTop: '1rem' }}>
          <h3>Server emojis</h3>
          <p className="muted small" style={{ margin: '0 0 0.6rem' }}>
            Manage emojis for this server here.
          </p>
          {serverId ? (
            <ServerEmojiManager serverId={Number(serverId)} emojis={emojiList} onReload={loadEmojis} />
          ) : null}
        </div>
      </div>
    </div>
  )
}
