import { useEffect, useState } from 'react'
import api from '../services/api'
import {
  buildInviteCreatePayload,
  formatInviteExpiration,
  formatInviteRemainingUses,
  inviteFullUrl,
} from '../lib/invites'

export default function ServerSettingsModal({ open, onClose, serverId, serverName }) {
  const [inviteType, setInviteType] = useState('temporary')
  const [inviteSingleUse, setInviteSingleUse] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [activeInvites, setActiveInvites] = useState([])
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  useEffect(() => {
    if (!open || !serverId) return
    loadInvites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, serverId])

  async function loadInvites() {
    if (!serverId) return
    try {
      const { data } = await api.get(`/servers/${serverId}/invites`)
      setActiveInvites(data)
    } catch {
      setActiveInvites([])
      setError('Could not load invites for this server')
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
    setBusy(true)
    try {
      const payload = buildInviteCreatePayload(inviteType, inviteSingleUse)
      const { data } = await api.post(`/servers/${serverId}/invites`, payload)
      setInviteLink(inviteFullUrl(origin, data.token))
      setInfo('Invite created successfully')
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

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value)
      setInfo('Copied to clipboard')
      window.setTimeout(() => setInfo(''), 1200)
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

        <form onSubmit={createInvite} className="form-stack">
          <label>
            Invite type
            <select
              id="server-invite-type"
              name="invite_type"
              value={inviteType}
              onChange={(e) => setInviteType(e.target.value)}
              className="select-inline"
            >
              <option value="temporary">Temporary (1 week)</option>
              <option value="permanent">Permanent</option>
            </select>
          </label>

          <label className="invite-toggle">
            <input
              id="server-invite-single-use"
              name="invite_single_use"
              type="checkbox"
              checked={inviteSingleUse}
              disabled={inviteType !== 'temporary'}
              onChange={(e) => setInviteSingleUse(e.target.checked)}
            />
            <span>
              {inviteType !== 'temporary'
                ? 'Single-use (temporary only)'
                : inviteSingleUse
                  ? 'Single-use enabled'
                  : 'Single-use (temporary only)'}
            </span>
          </label>

          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Generating…' : 'Generate invite link'}
          </button>
        </form>

        {inviteLink && (
          <div className="invite-link-box">
            <input id="server-invite-link-output" name="invite_link" value={inviteLink} readOnly />
            <button type="button" className="btn ghost" onClick={() => copyText(inviteLink)}>
              Copy
            </button>
          </div>
        )}

        <div className="invite-list">
          <h3>Active invites</h3>
          {activeInvites.length === 0 ? (
            <p className="muted small">No active invites yet.</p>
          ) : (
            <ul>
              {activeInvites.map((inv) => {
                const full = inviteFullUrl(origin, inv.token)
                return (
                  <li key={inv.id}>
                    <div className="invite-meta">
                      <input id={`server-invite-active-${inv.id}`} name={`invite_token_${inv.id}`} value={full} readOnly />
                      <small className="muted">
                        Expires: {formatInviteExpiration(inv.expires_at)} · Uses:{' '}
                        {formatInviteRemainingUses(inv)}
                      </small>
                    </div>
                    <button type="button" className="btn small ghost" onClick={() => copyText(full)}>
                      Copy
                    </button>
                    <button type="button" className="btn small secondary" onClick={() => revokeInvite(inv.id)}>
                      Revoke
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
