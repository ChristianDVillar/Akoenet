import NotificationBell from './NotificationBell'
import GlobalSearchModal from './GlobalSearchModal'

export default function AppChrome({ children }) {
  return (
    <>
      <div className="app-chrome-actions" aria-label="Global actions">
        <button
          type="button"
          className="btn ghost small app-chrome-search-btn"
          title="Search all your channels (Ctrl+K)"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('akoenet-open-global-search'))
          }}
        >
          🔎
        </button>
        <NotificationBell />
      </div>
      <GlobalSearchModal />
      {children}
    </>
  )
}
