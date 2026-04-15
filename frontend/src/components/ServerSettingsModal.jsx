import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import ServerCustomContentSettings from './ServerCustomContentSettings'
import ServerRolesTab from './ServerRolesTab'

export default function ServerSettingsModal({
  open,
  onClose,
  serverId,
  serverName,
  members = [],
  serverOwnerId = null,
  onMembersRefresh = null,
}) {
  const { t } = useTranslation()
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
  const [canManageServer, setCanManageServer] = useState(false)
  const [canManageMemberRoles, setCanManageMemberRoles] = useState(false)
  const [serverBans, setServerBans] = useState([])
  const [activeSection, setActiveSection] = useState(
    /** @type {'invites' | 'emojis' | 'roles' | 'commands' | 'events' | 'announcements' | 'bans'} */ ('invites')
  )
  const copyTimerRef = useRef(null)

  const shareOrigin = getInviteShareOrigin()

  useEffect(() => {
    setInviteLink('')
    setInviteToken('')
    setLastInviteSummary('')
  }, [inviteType, tempUsesMode])

  useEffect(() => {
    if (open) setActiveSection('invites')
  }, [open])

  function flashCopy(message) {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    setCopyNotice(message)
    copyTimerRef.current = window.setTimeout(() => setCopyNotice(''), 2000)
  }

  useEffect(() => {
    if (!open || !serverId) return
    loadInvites()
    loadEmojis()
    loadBans()
    api
      .get(`/servers/${serverId}/my-permissions`)
      .then((r) => {
        setCanManageServer(Boolean(r.data?.can_manage_channels))
        setCanManageMemberRoles(Boolean(r.data?.can_manage_member_roles))
      })
      .catch(() => {
        setCanManageServer(false)
        setCanManageMemberRoles(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, serverId])

  useEffect(() => {
    if (!open || !serverId || activeSection !== 'bans') return
    loadBans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, open, serverId])

  async function loadInvites() {
    if (!serverId) return
    try {
      const { data } = await api.get(`/servers/${serverId}/invites`)
      setActiveInvites(data)
      setError('')
    } catch {
      setActiveInvites([])
      setError(t('serverModal.errLoadInvites'))
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

  async function loadBans() {
    if (!serverId) return
    try {
      const { data } = await api.get(`/servers/${serverId}/bans`)
      setServerBans(Array.isArray(data) ? data : [])
    } catch {
      setServerBans([])
    }
  }

  async function unbanUser(userId) {
    if (!serverId || !userId || !canManageServer) return
    setError('')
    setInfo('')
    try {
      await api.delete(`/servers/${serverId}/bans/${userId}`)
      setInfo(t('serverModal.banRemovedOk'))
      await loadBans()
    } catch {
      setError(t('serverModal.errUnban'))
    }
  }

  async function createInvite(e) {
    e.preventDefault()
    if (!serverId) {
      setError(t('serverModal.errMissingServer'))
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
      setInfo(t('serverModal.inviteCreatedInfo'))
      await loadInvites()
    } catch (err) {
      const msg =
        err.response?.status === 403 ? t('serverModal.errCreateForbidden') : t('serverModal.errCreate')
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
      setInfo(t('serverModal.inviteRevoked'))
      await loadInvites()
    } catch {
      setError(t('serverModal.errRevoke'))
    }
  }

  async function copyText(value, successLabel) {
    try {
      await navigator.clipboard.writeText(value)
      flashCopy(successLabel || t('serverModal.copied'))
    } catch {
      setError(t('serverModal.errClipboard'))
    }
  }

  if (!open) return null

  const navBtn = (id, label) => (
    <button
      key={id}
      type="button"
      className={`settings-split-nav-btn ${activeSection === id ? 'active' : ''}`}
      onClick={() => setActiveSection(id)}
    >
      {label}
    </button>
  )

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card user-settings-modal server-settings-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h3>{t('serverModal.title', { name: serverName || t('channelList.serverFallback') })}</h3>
          <button type="button" className="btn ghost small" onClick={onClose}>
            {t('serverModal.close')}
          </button>
        </header>

        {error && <div className="error-banner inline">{error}</div>}
        {info && <div className="info-banner">{info}</div>}

        <div className="settings-split-layout">
          <aside className="settings-split-nav" aria-label={t('serverModal.navAria')}>
            {navBtn('invites', t('serverModal.navInvites'))}
            {navBtn('emojis', t('serverModal.navEmojis'))}
            {navBtn('roles', t('serverModal.navRoles'))}
            {navBtn('commands', t('serverModal.navCommands'))}
            {navBtn('events', t('serverModal.navEvents'))}
            {navBtn('announcements', t('serverModal.navAnnouncements'))}
            {navBtn('bans', t('serverModal.navBans'))}
          </aside>

          <section className="settings-split-content">
            {activeSection === 'invites' && (
              <div className="server-settings-tab-pane">
                <form onSubmit={createInvite} className="form-stack invite-create-form">
                  <div>
                    <label htmlFor="server-invite-type">{t('serverModal.inviteTypeLabel')}</label>
                    <select
                      id="server-invite-type"
                      name="invite_type"
                      value={inviteType}
                      onChange={(e) => setInviteType(e.target.value)}
                      className="select-inline"
                    >
                      <option value="temporary">{t('serverModal.inviteTemp')}</option>
                      <option value="permanent">{t('serverModal.invitePermanent')}</option>
                    </select>
                    <p className="muted small invite-type-hint">
                      {inviteType === 'temporary'
                        ? t('serverModal.inviteTempHint', {
                            days: INVITE_TEMP_EXPIRY_HOURS / 24,
                            max: INVITE_TEMP_MAX_USES_MULTI,
                          })
                        : t('serverModal.invitePermanentHint')}
                    </p>
                  </div>

                  {inviteType === 'temporary' ? (
                    <fieldset className="invite-audience-fieldset">
                      <legend className="invite-audience-legend">{t('serverModal.whoCanUse')}</legend>
                      <label className="invite-toggle">
                        <input
                          id="server-invite-uses-single"
                          name="temp_uses_mode"
                          type="radio"
                          checked={tempUsesMode === 'single'}
                          onChange={() => setTempUsesMode('single')}
                        />
                        <span>{t('serverModal.inviteSingle')}</span>
                      </label>
                      <label className="invite-toggle">
                        <input
                          id="server-invite-uses-multi"
                          name="temp_uses_mode"
                          type="radio"
                          checked={tempUsesMode === 'multi'}
                          onChange={() => setTempUsesMode('multi')}
                        />
                        <span>{t('serverModal.inviteMulti', { max: INVITE_TEMP_MAX_USES_MULTI })}</span>
                      </label>
                    </fieldset>
                  ) : null}

                  <button type="submit" className="btn primary" disabled={busy}>
                    {busy ? t('serverModal.generateBusy') : t('serverModal.generateCta')}
                  </button>
                  <p className="muted small invite-share-explainer">{t('serverModal.inviteShareExplainer')}</p>
                </form>

                {inviteLink ? (
                  <div className="invite-link-box invite-link-box-generated">
                    <label htmlFor="server-invite-link-output" className="sr-only">
                      {t('serverModal.inviteLinkSr')}
                    </label>
                    <input id="server-invite-link-output" name="invite_link" value={inviteLink} readOnly />
                    <div className="invite-share-actions">
                      <button type="button" className="btn ghost" onClick={() => copyText(inviteLink, t('serverModal.copyLinkOk'))}>
                        {t('serverModal.copyLink')}
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => inviteToken && copyText(inviteToken, t('serverModal.copyCodeOk'))}
                        disabled={!inviteToken}
                      >
                        {t('serverModal.copyCodeOnly')}
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
                  <h3>{t('serverModal.activeInvites')}</h3>
                  {activeInvites.length === 0 ? (
                    <p className="muted small">{t('serverModal.noActiveInvites')}</p>
                  ) : (
                    <ul>
                      {activeInvites.map((inv) => {
                        const full = inviteFullUrl(shareOrigin, inv.token)
                        const tok = String(inv.token || '')
                        return (
                          <li key={inv.id}>
                            <div className="invite-meta">
                              <input
                                id={`server-invite-active-${inv.id}`}
                                name={`invite_token_${inv.id}`}
                                value={full}
                                readOnly
                              />
                              <small className="muted">{formatInviteSummary(inv)}</small>
                            </div>
                            <div className="invite-active-actions">
                              <button
                                type="button"
                                className="btn small ghost"
                                onClick={() => copyText(full, t('serverModal.copyLinkOk'))}
                              >
                                {t('serverModal.copyLink')}
                              </button>
                              <button
                                type="button"
                                className="btn small ghost"
                                onClick={() => tok && copyText(tok, t('serverModal.copyCodeOk'))}
                                disabled={!tok}
                              >
                                {t('serverModal.copyCode')}
                              </button>
                              <button type="button" className="btn small secondary" onClick={() => revokeInvite(inv.id)}>
                                {t('serverModal.revoke')}
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {activeSection === 'emojis' && serverId ? (
              <div className="server-settings-tab-pane">
                <h2 className="server-settings-panel-title">{t('serverModal.emojisTitle')}</h2>
                <p className="muted small" style={{ margin: '0 0 0.75rem' }}>
                  {t('serverModal.emojisLead')}
                </p>
                <ServerEmojiManager serverId={Number(serverId)} emojis={emojiList} onReload={loadEmojis} />
              </div>
            ) : null}

            {activeSection === 'roles' && serverId ? (
              <ServerRolesTab
                serverId={serverId}
                members={members}
                canManageMemberRoles={canManageMemberRoles}
                serverOwnerId={serverOwnerId}
                onMembersRefresh={onMembersRefresh}
              />
            ) : null}

            {(activeSection === 'commands' || activeSection === 'events' || activeSection === 'announcements') &&
            serverId ? (
              <ServerCustomContentSettings
                serverId={Number(serverId)}
                canManage={canManageServer}
                tab={activeSection}
              />
            ) : null}

            {activeSection === 'bans' && serverId ? (
              <div className="server-settings-tab-pane">
                <h2 className="server-settings-panel-title">{t('serverModal.bansTitle')}</h2>
                <p className="muted small">{t('serverModal.bansLead')}</p>
                {serverBans.length === 0 ? (
                  <p className="muted small">{t('serverModal.noBans')}</p>
                ) : (
                  <ul className="server-custom-list">
                    {serverBans.map((ban) => (
                      <li key={ban.id}>
                        <strong>{ban.username || `user_${ban.user_id}`}</strong>
                        <span className="muted small">
                          ID: {ban.user_id}
                          {ban.reason ? ` · ${t('serverModal.reason')}: ${ban.reason}` : ''}
                        </span>
                        {ban.expires_at ? (
                          <span className="muted small">
                            {t('serverModal.expires')}: {new Date(ban.expires_at).toLocaleString()}
                          </span>
                        ) : (
                          <span className="muted small">{t('serverModal.permanent')}</span>
                        )}
                        {canManageServer ? (
                          <button
                            type="button"
                            className="btn small secondary"
                            onClick={() => unbanUser(ban.user_id)}
                          >
                            {t('serverModal.unban')}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {!canManageServer ? (
                  <p className="muted small">{t('serverModal.bansReadOnly')}</p>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
