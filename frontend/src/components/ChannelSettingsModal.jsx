import ChannelPermissionsPanel from './ChannelPermissionsPanel'

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

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card channel-settings-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h3>Channel settings · {activeChannel?.name || 'Channel'}</h3>
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
