import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export default function EditHistoryModal({ open, title, entries = [], onClose }) {
  const { t } = useTranslation()
  const resolvedTitle = title ?? t('editHistory.title')
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
          <h3>{resolvedTitle}</h3>
          <button type="button" className="btn ghost small" onClick={onClose}>
            {t('editHistory.close')}
          </button>
        </header>

        {!entries.length ? (
          <p className="muted small">{t('editHistory.empty')}</p>
        ) : (
          <ol className="edit-history-list">
            {entries.map((entry, idx) => (
              <li key={`${entry.id || idx}-${entry.edited_at || ''}`} className="edit-history-item">
                <div className="edit-history-item-meta">
                  <strong>#{idx + 1}</strong>
                  <span>{entry.edited_at ? new Date(entry.edited_at).toLocaleString() : t('editHistory.unknownTime')}</span>
                  <span>
                    {t('editHistory.byPrefix')} {entry.edited_by_username || t('editHistory.userFallback')}
                  </span>
                </div>
                <div className="edit-history-change">
                  <p className="edit-history-label">{t('editHistory.from')}</p>
                  <p className="edit-history-text">{entry.old_content || t('editHistory.emptyContent')}</p>
                </div>
                <div className="edit-history-change">
                  <p className="edit-history-label">{t('editHistory.to')}</p>
                  <p className="edit-history-text">{entry.new_content || t('editHistory.emptyContent')}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
