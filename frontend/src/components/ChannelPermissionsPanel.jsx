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
        <header>Permisos del canal</header>
        <p className="muted small">Selecciona un canal para editar permisos.</p>
      </section>
    )
  }

  return (
    <section className="perm-panel">
      <header>
        Permisos: <strong>{channelName}</strong>
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
              ver
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
              escribir
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
                conectar
              </label>
            )}
          </article>
        ))}
      </div>
      <div className="perm-user-box">
        <h4>Permiso por usuario</h4>
        <select
          className="select-inline"
          value={selectedMemberId}
          onChange={(e) => setSelectedMemberId(e.target.value)}
        >
          <option value="">Seleccionar miembro</option>
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
                    ver
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
                    escribir
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
                      conectar
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
