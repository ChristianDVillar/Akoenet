import { useEffect, useState } from 'react'

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
      <section className="perm-panel">
        <header>Channel permissions</header>
        <p className="muted small">Select a channel to edit permissions.</p>
      </section>
    )
  }

  return (
    <section className="perm-panel">
      <header>
        Permissions: <strong>{channelName}</strong>
      </header>
      <div className="perm-user-box">
        <h4>Channel settings</h4>
        <div className="perm-list">
          <label>
            Name
            <input
              id={`ch-settings-name-${activeChannel?.id || 'none'}`}
              name="channel_name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </label>
          <label>
            Category
            <select
              id={`ch-settings-category-${activeChannel?.id || 'none'}`}
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
          <label className="invite-toggle" style={{ marginTop: 0 }}>
            <input
              id={`ch-settings-private-${activeChannel?.id || 'none'}`}
              name="channel_is_private"
              type="checkbox"
              checked={editPrivate}
              onChange={(e) => setEditPrivate(e.target.checked)}
            />
            <span>private channel</span>
          </label>
          {channelType === 'voice' && (
            <label>
              Max users in voice
              <input
                id={`ch-settings-voice-limit-${activeChannel?.id || 'none'}`}
                name="voice_user_limit"
                type="number"
                min={1}
                max={99}
                placeholder="Unlimited"
                value={editVoiceUserLimit}
                onChange={(e) => setEditVoiceUserLimit(e.target.value.replace(/[^\d]/g, ''))}
              />
              <span className="muted small" style={{ display: 'block', marginTop: 4 }}>
                Leave empty for no limit. Admins and moderators can change this.
              </span>
            </label>
          )}
          <button
            type="button"
            className="btn small secondary"
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
                if (channelType === 'voice') {
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
      <div className="perm-list">
        {permissions.map((role) => (
          <article key={role.id} className="perm-row">
            <div className="perm-role">{role.name}</div>
            <label>
              <input
                id={`ch-perm-${activeChannel?.id ?? 'none'}-role-${role.id}-view`}
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
              view
            </label>
            <label>
              <input
                id={`ch-perm-${activeChannel?.id ?? 'none'}-role-${role.id}-send`}
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
              send
            </label>
            {channelType === 'voice' && (
              <label>
                <input
                  id={`ch-perm-${activeChannel?.id ?? 'none'}-role-${role.id}-connect`}
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
                connect
              </label>
            )}
          </article>
        ))}
      </div>
      <div className="perm-user-box">
        <h4>Per-user permissions</h4>
        <select
          id={`ch-perm-member-select-${activeChannel?.id || 'none'}`}
          name="channel_perm_member"
          className="select-inline"
          value={selectedMemberId}
          onChange={(e) => setSelectedMemberId(e.target.value)}
        >
          <option value="">Select member</option>
          {members.map((m) => (
            <option key={m.id} value={String(m.id)}>
              {m.username}
            </option>
          ))}
        </select>
        {selectedMemberId && (
          <div className="perm-row">
            <div className="perm-role">
              {members.find((m) => String(m.id) === String(selectedMemberId))?.username}
            </div>
            {(() => {
              const selected = userPermissions.find(
                (up) => String(up.user_id) === String(selectedMemberId)
              ) || {
                can_view: true,
                can_send: true,
                can_connect: true,
              }
              return (
                <>
                  <label>
                    <input
                      id={`ch-user-perm-${activeChannel?.id ?? 'none'}-u-${selectedMemberId}-view`}
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
                    view
                  </label>
                  <label>
                    <input
                      id={`ch-user-perm-${activeChannel?.id ?? 'none'}-u-${selectedMemberId}-send`}
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
                    send
                  </label>
                  {channelType === 'voice' && (
                    <label>
                      <input
                        id={`ch-user-perm-${activeChannel?.id ?? 'none'}-u-${selectedMemberId}-connect`}
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
                      connect
                    </label>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>
    </section>
  )
}
