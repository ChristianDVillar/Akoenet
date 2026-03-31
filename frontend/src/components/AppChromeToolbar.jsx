import NotificationBell from './NotificationBell'

export default function AppChromeToolbar() {
  return (
    <div className="app-chrome-toolbar" aria-label="Global actions">
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
  )
}
