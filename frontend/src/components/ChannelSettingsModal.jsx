import { useTranslation } from 'react-i18next'
import ChannelPermissionsPanel from './ChannelPermissionsPanel'

function channelTypeLabel(type, t) {
  if (type === 'voice') return t('channelSettings.typeVoice')
  if (type === 'text') return t('channelSettings.typeText')
  return t('channelSettings.typeChannel')
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
  const { t } = useTranslation()
  if (!open) return null

  const channelType = activeChannel?.type

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
            <p className="channel-settings-modal-kicker">{t('channelSettings.kicker')}</p>
            <h3 id="channel-settings-title" className="channel-settings-modal-title">
              <span className="channel-settings-modal-name">
                {activeChannel?.name || t('channelSettings.fallbackName')}
              </span>
              <span
                className={`channel-settings-type-badge${channelType === 'voice' ? ' channel-settings-type-badge--voice' : ''}`}
              >
                {channelTypeLabel(channelType, t)}
              </span>
            </h3>
          </div>
          <button type="button" className="btn ghost small" onClick={onClose}>
            {t('common.close')}
          </button>
        </header>

        <ChannelPermissionsPanel
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
