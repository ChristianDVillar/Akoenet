import { useEffect } from 'react'

export default function EditHistoryModal({ open, title = 'Edit history', entries = [], onClose }) {
  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card edit-history-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </header>

        {!entries.length ? (
          <p className="muted small">No edit history for this message.</p>
        ) : (
          <ol className="edit-history-list">
            {entries.map((entry, idx) => (
              <li key={`${entry.id || idx}-${entry.edited_at || ''}`} className="edit-history-item">
                <div className="edit-history-item-meta">
                  <strong>#{idx + 1}</strong>
                  <span>{entry.edited_at ? new Date(entry.edited_at).toLocaleString() : 'Unknown time'}</span>
                  <span>by {entry.edited_by_username || 'user'}</span>
                </div>
                <div className="edit-history-change">
                  <p className="edit-history-label">From</p>
                  <p className="edit-history-text">{entry.old_content || '(empty)'}</p>
                </div>
                <div className="edit-history-change">
                  <p className="edit-history-label">To</p>
                  <p className="edit-history-text">{entry.new_content || '(empty)'}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
