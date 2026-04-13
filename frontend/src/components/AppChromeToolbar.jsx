import { useTranslation } from 'react-i18next'
import NotificationBell from './NotificationBell'

export default function AppChromeToolbar() {
  const { t } = useTranslation()
  return (
    <div className="app-chrome-toolbar" aria-label={t('language.ariaLabelToolbar')}>
      <button
        type="button"
        className="btn ghost small app-chrome-search-btn"
        title={t('language.searchShortcutTitle')}
        onClick={() => {
          window.dispatchEvent(new CustomEvent('akoenet-open-global-search'))
        }}
      >
        🔎
      </button>
      <NotificationBell />
    </div>
  )
}
