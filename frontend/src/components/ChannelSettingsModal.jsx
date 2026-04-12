import ChannelPermissionsPanel from './ChannelPermissionsPanel'

function channelTypeLabel(type) {
  if (type === 'voice') return 'Voice'
  if (type === 'text') return 'Text'
  return 'Channel'
}

export default function ChannelSettingsModal({
  open,
  onClose,
  activeChannel,
  permissions,
  onTogglePermission,
  members,
  userPermissions,
  selectedMemberId,
  setSelectedMemberId,
  onToggleUserPermission,
  categories,
  onUpdateChannel,
}) {
  if (!open) return null

  const t = activeChannel?.type

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card channel-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header channel-settings-modal-header">
          <div className="channel-settings-modal-header-text">
            <p className="channel-settings-modal-kicker">Channel settings</p>
            <h3 id="channel-settings-title" className="channel-settings-modal-title">
              <span className="channel-settings-modal-name">{activeChannel?.name || 'Channel'}</span>
              <span
                className={`channel-settings-type-badge${t === 'voice' ? ' channel-settings-type-badge--voice' : ''}`}
              >
                {channelTypeLabel(t)}
              </span>
            </h3>
          </div>
          <button type="button" className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </header>

        <ChannelPermissionsPanel
          channelName={activeChannel?.name}
          channelType={activeChannel?.type}
          permissions={permissions}
          onTogglePermission={onTogglePermission}
          members={members}
          userPermissions={userPermissions}
          selectedMemberId={selectedMemberId}
          setSelectedMemberId={setSelectedMemberId}
          onToggleUserPermission={onToggleUserPermission}
          categories={categories}
          activeChannel={activeChannel}
          onUpdateChannel={onUpdateChannel}
        />
      </div>
    </div>
  )
}
