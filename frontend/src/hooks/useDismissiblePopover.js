import { useEffect, useRef } from 'react'

/**
 * Closes popover on outside mousedown or Escape. Only attaches listeners while open.
 * Pass a stable onClose (e.g. useCallback) to avoid re-attaching listeners.
 */
export function useDismissiblePopover(open, onClose) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDocumentClick(event) {
      if (!ref.current?.contains(event.target)) onClose()
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocumentClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocumentClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  return ref
}
