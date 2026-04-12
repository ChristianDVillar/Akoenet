import { useEffect, useId, useState } from 'react'

export default function ChannelPermissionsPanel({
  channelName,
  channelType,
  permissions,
  onTogglePermission,
  members,
  userPermissions,
  selectedMemberId,
  setSelectedMemberId,
  onToggleUserPermission,
  categories,
  activeChannel,
  onUpdateChannel,
}) {
  const [editName, setEditName] = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editPrivate, setEditPrivate] = useState(false)
  const [editVoiceUserLimit, setEditVoiceUserLimit] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const voiceLimitHintId = useId()
  const isVoice = channelType === 'voice'

  useEffect(() => {
    setEditName(activeChannel?.name || '')
    setEditCategoryId(activeChannel?.category_id ? String(activeChannel.category_id) : '')
    setEditPrivate(Boolean(activeChannel?.is_private))
    const lim = activeChannel?.voice_user_limit
    setEditVoiceUserLimit(lim != null && lim !== '' ? String(lim) : '')
  }, [
    activeChannel?.id,
    activeChannel?.name,
    activeChannel?.category_id,
    activeChannel?.is_private,
    activeChannel?.voice_user_limit,
  ])

  if (!permissions?.length) {
    return (
      <section className="perm-panel perm-panel--channel-settings">
        <p className="muted small channel-settings-empty">Select a channel to edit permissions.</p>
      </section>
    )
  }

  const cid = activeChannel?.id ?? 'none'

  return (
    <section className="perm-panel perm-panel--channel-settings">
      <div className="channel-settings-section">
        <h4 className="channel-settings-section-title">General</h4>
        <p className="channel-settings-section-desc">
          {isVoice
            ? 'Name, category, privacy, and optional cap on simultaneous voice participants.'
            : 'Name, category, and whether the channel is private.'}
        </p>
        <div className="channel-settings-fields">
          <label className="channel-settings-field">
            <span className="channel-settings-label">Name</span>
            <input
              id={`ch-settings-name-${cid}`}
              name="channel_name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="channel-settings-field">
            <span className="channel-settings-label">Category</span>
            <select
              id={`ch-settings-category-${cid}`}
              name="channel_category_id"
              className="select-inline"
              value={editCategoryId}
              onChange={(e) => setEditCategoryId(e.target.value)}
            >
              <option value="">Uncategorized</option>
              {(categories || []).map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="channel-settings-field channel-settings-field--inline">
            <input
              id={`ch-settings-private-${cid}`}
              name="channel_is_private"
              type="checkbox"
              checked={editPrivate}
              onChange={(e) => setEditPrivate(e.target.checked)}
            />
            <span>
              <strong>Private channel</strong>
              <span className="channel-settings-inline-hint">
                Hidden from members without access; invite or grant per-role / per-user permissions.
              </span>
            </span>
          </label>
          {isVoice && (
            <label className="channel-settings-field">
              <span className="channel-settings-label">Max users in voice</span>
              <div className="channel-settings-voice-limit-row">
                <input
                  id={`ch-settings-voice-limit-${cid}`}
                  name="voice_user_limit"
                  type="number"
                  min={1}
                  max={99}
                  placeholder="No limit"
                  aria-describedby={voiceLimitHintId}
                  value={editVoiceUserLimit}
                  onChange={(e) => setEditVoiceUserLimit(e.target.value.replace(/[^\d]/g, ''))}
                />
                <span className="channel-settings-voice-limit-suffix" aria-hidden>
                  users
                </span>
              </div>
              <p id={voiceLimitHintId} className="channel-settings-hint">
                Empty = unlimited. Admins and moderators can always adjust this cap.
              </p>
            </label>
          )}
          <div className="channel-settings-actions">
            <button
              type="button"
              className="btn primary"
              disabled={savingSettings || !activeChannel?.id || !editName.trim()}
              onClick={async () => {
                if (!activeChannel?.id) return
                setSavingSettings(true)
                try {
                  const payload = {
                    name: editName.trim(),
                    category_id: editCategoryId ? Number(editCategoryId) : null,
                    is_private: editPrivate,
                  }
                  if (isVoice) {
                    const t = editVoiceUserLimit.trim()
                    payload.voice_user_limit = t === '' ? null : Number(t)
                  }
                  await onUpdateChannel?.(activeChannel.id, payload)
                } finally {
                  setSavingSettings(false)
                }
              }}
            >
              {savingSettings ? 'Saving…' : 'Save channel'}
            </button>
          </div>
        </div>
      </div>

      <div className="channel-settings-section">
        <h4 className="channel-settings-section-title">Role permissions</h4>
        <p className="channel-settings-section-desc">
          Default access for each server role. Members get the highest role they have.
        </p>
        <div className={`perm-matrix${isVoice ? ' perm-matrix--voice' : ' perm-matrix--text'}`}>
          <div className={`perm-matrix-head${isVoice ? ' perm-matrix-head--voice' : ' perm-matrix-head--text'}`}>
            <span className="perm-matrix-corner">Role</span>
            <span>View</span>
            <span>Send</span>
            {isVoice ? <span>Connect</span> : null}
          </div>
          <div className="perm-matrix-body">
            {permissions.map((role) => (
              <div key={role.id} className={`perm-row${isVoice ? ' perm-row--voice' : ' perm-row--text'}`}>
                <div className="perm-role">{role.name}</div>
                <label className="perm-cell">
                  <input
                    id={`ch-perm-${cid}-role-${role.id}-view`}
                    name={`role_perm_${role.id}_view`}
                    type="checkbox"
                    checked={role.can_view}
                    onChange={(e) =>
                      onTogglePermission(role.id, {
                        ...role,
                        can_view: e.target.checked,
                      })
                    }
                  />
                  <span className="sr-only">{role.name}: view</span>
                </label>
                <label className="perm-cell">
                  <input
                    id={`ch-perm-${cid}-role-${role.id}-send`}
                    name={`role_perm_${role.id}_send`}
                    type="checkbox"
                    checked={role.can_send}
                    onChange={(e) =>
                      onTogglePermission(role.id, {
                        ...role,
                        can_send: e.target.checked,
                      })
                    }
                  />
                  <span className="sr-only">{role.name}: send</span>
                </label>
                {isVoice ? (
                  <label className="perm-cell">
                    <input
                      id={`ch-perm-${cid}-role-${role.id}-connect`}
                      name={`role_perm_${role.id}_connect`}
                      type="checkbox"
                      checked={role.can_connect}
                      onChange={(e) =>
                        onTogglePermission(role.id, {
                          ...role,
                          can_connect: e.target.checked,
                        })
                      }
                    />
                    <span className="sr-only">{role.name}: connect</span>
                  </label>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="channel-settings-section">
        <h4 className="channel-settings-section-title">Per-member overrides</h4>
        <p className="channel-settings-section-desc">
          Optional. Change access for one member without editing roles. Overrides apply on top of roles.
        </p>
        <label className="channel-settings-field">
          <span className="channel-settings-label">Member</span>
          <select
            id={`ch-perm-member-select-${cid}`}
            name="channel_perm_member"
            className="select-inline channel-settings-member-select"
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
          >
            <option value="">Choose a member…</option>
            {members.map((m) => (
              <option key={m.id} value={String(m.id)}>
                {m.username}
              </option>
            ))}
          </select>
        </label>
        {selectedMemberId ? (
          <div className={`perm-matrix perm-matrix--member${isVoice ? ' perm-matrix--voice' : ' perm-matrix--text'}`}>
            <div className={`perm-matrix-head${isVoice ? ' perm-matrix-head--voice' : ' perm-matrix-head--text'}`}>
              <span className="perm-matrix-corner">Member</span>
              <span>View</span>
              <span>Send</span>
              {isVoice ? <span>Connect</span> : null}
            </div>
            <div className="perm-matrix-body">
              <div className={`perm-row${isVoice ? ' perm-row--voice' : ' perm-row--text'}`}>
                <div className="perm-role">
                  {members.find((m) => String(m.id) === String(selectedMemberId))?.username ?? '—'}
                </div>
                {(() => {
                  const selected =
                    userPermissions.find((up) => String(up.user_id) === String(selectedMemberId)) || {
                      can_view: true,
                      can_send: true,
                      can_connect: true,
                    }
                  return (
                    <>
                      <label className="perm-cell">
                        <input
                          id={`ch-user-perm-${cid}-u-${selectedMemberId}-view`}
                          name={`user_perm_${selectedMemberId}_view`}
                          type="checkbox"
                          checked={selected.can_view}
                          onChange={(e) =>
                            onToggleUserPermission(Number(selectedMemberId), {
                              ...selected,
                              can_view: e.target.checked,
                            })
                          }
                        />
                        <span className="sr-only">View</span>
                      </label>
                      <label className="perm-cell">
                        <input
                          id={`ch-user-perm-${cid}-u-${selectedMemberId}-send`}
                          name={`user_perm_${selectedMemberId}_send`}
                          type="checkbox"
                          checked={selected.can_send}
                          onChange={(e) =>
                            onToggleUserPermission(Number(selectedMemberId), {
                              ...selected,
                              can_send: e.target.checked,
                            })
                          }
                        />
                        <span className="sr-only">Send</span>
                      </label>
                      {isVoice ? (
                        <label className="perm-cell">
                          <input
                            id={`ch-user-perm-${cid}-u-${selectedMemberId}-connect`}
                            name={`user_perm_${selectedMemberId}_connect`}
                            type="checkbox"
                            checked={selected.can_connect}
                            onChange={(e) =>
                              onToggleUserPermission(Number(selectedMemberId), {
                                ...selected,
                                can_connect: e.target.checked,
                              })
                            }
                          />
                          <span className="sr-only">Connect</span>
                        </label>
                      ) : null}
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        ) : (
          <p className="channel-settings-hint channel-settings-hint--spaced">
            Pick a member to set individual view, send{isVoice ? ', and connect' : ''} flags.
          </p>
        )}
      </div>
    </section>
  )
}
