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
}) {
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
      <div className="perm-list">
        {permissions.map((role) => (
          <article key={role.id} className="perm-row">
            <div className="perm-role">{role.name}</div>
            <label>
              <input
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
