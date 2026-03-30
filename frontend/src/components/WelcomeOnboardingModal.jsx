const STORAGE_KEY = 'akoenet_onboarding_v1'

export function hasSeenOnboarding() {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY))
  } catch {
    return true
  }
}

export function dismissOnboarding() {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* ignore */
  }
}

export default function WelcomeOnboardingModal({ open, onClose }) {
  if (!open) return null
  return (
    <div
      className="welcome-onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-onboarding-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          dismissOnboarding()
          onClose()
        }
      }}
    >
      <div className="welcome-onboarding-card card">
        <h2 id="welcome-onboarding-title">Welcome to AkoeNet</h2>
        <p className="muted small">
          AkoeNet combines Discord-style communities with a built-in <strong>Streamer Scheduler</strong> so you can share
          upcoming streams without leaving the app.
        </p>
        <ul className="welcome-onboarding-list">
          <li>
            <strong>Create or join a server</strong> — your home base for channels and voice.
          </li>
          <li>
            <strong>Scheduler:</strong> in any text channel, type <code className="inline-code">!schedule</code> or{' '}
            <code className="inline-code">!next</code>. Set your public Scheduler slug under <strong>User Settings</strong>.
          </li>
          <li>
            <strong>Mentions:</strong> use <code className="inline-code">@username</code> to ping members.{' '}
            <code className="inline-code">@everyone</code> notifies the whole server (moderators only).
          </li>
          <li>
            <strong>Search everywhere:</strong> press <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">K</kbd> (or{' '}
            <kbd className="kbd">⌘</kbd>+<kbd className="kbd">K</kbd>) from the dashboard or a server.
          </li>
        </ul>
        <div className="welcome-onboarding-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              dismissOnboarding()
              onClose()
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
