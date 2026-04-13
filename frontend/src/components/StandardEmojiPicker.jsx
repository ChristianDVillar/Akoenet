import { createElement, forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react'

const EmojiPickerCustomElement = forwardRef(function EmojiPickerCustomElement(_props, ref) {
  return createElement('emoji-picker', { ref })
})

let emojiPickerElementPromise = null
let emojiPickerLibLoaded = false

function loadEmojiPickerElement() {
  if (!emojiPickerElementPromise) {
    emojiPickerElementPromise = import('emoji-picker-element')
  }
  return emojiPickerElementPromise
}

/**
 * Unicode emoji picker (emoji-picker-element, Apache-2.0).
 * Inserts the chosen glyph into the composer at the caret position captured when opening.
 */
export default function StandardEmojiPicker({ inputRef, text, setText, disabled }) {
  const [open, setOpen] = useState(false)
  const [pickerLibReady, setPickerLibReady] = useState(false)
  const wrapRef = useRef(null)
  const pickerRef = useRef(null)
  const rangeRef = useRef({ start: 0, end: 0 })

  useEffect(() => {
    if (!open) return
    if (emojiPickerLibLoaded) {
      setPickerLibReady(true)
      return
    }
    let cancelled = false
    loadEmojiPickerElement().then(() => {
      if (!cancelled) {
        emojiPickerLibLoaded = true
        setPickerLibReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !pickerLibReady) return
    const picker = pickerRef.current
    if (!picker) return
    picker.classList.add('dark')
    const onPick = (e) => {
      const unicode = e.detail?.unicode
      if (typeof unicode !== 'string') return
      const { start, end } = rangeRef.current
      setText((prev) => {
        const p = prev ?? ''
        const next = p.slice(0, start) + unicode + p.slice(end)
        requestAnimationFrame(() => {
          const el = inputRef?.current
          if (!el) return
          try {
            el.focus()
            const pos = start + unicode.length
            el.setSelectionRange(pos, pos)
          } catch {
            /* ignore */
          }
        })
        return next
      })
      setOpen(false)
    }
    picker.addEventListener('emoji-click', onPick)
    return () => picker.removeEventListener('emoji-click', onPick)
  }, [open, pickerLibReady, setText, inputRef])

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(ev) {
      if (wrapRef.current && !wrapRef.current.contains(ev.target)) {
        setOpen(false)
      }
    }
    function onKey(ev) {
      if (ev.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle() {
    if (disabled) return
    setOpen((was) => {
      const next = !was
      if (next) {
        const el = inputRef?.current
        if (
          el &&
          document.activeElement === el &&
          typeof el.selectionStart === 'number' &&
          typeof el.selectionEnd === 'number'
        ) {
          rangeRef.current = { start: el.selectionStart, end: el.selectionEnd }
        } else {
          const len = text?.length ?? 0
          rangeRef.current = { start: len, end: len }
        }
      }
      return next
    })
  }

  return (
    <div className="standard-emoji-picker-wrap" ref={wrapRef}>
      <button
        type="button"
        className="btn ghost small standard-emoji-picker-trigger"
        title="Emoji"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={toggle}
      >
        ☺
      </button>
      {open && (
        <div className="standard-emoji-picker-panel" role="dialog" aria-label="Emoji picker">
          {pickerLibReady ? <EmojiPickerCustomElement ref={pickerRef} /> : <p className="muted small">Loading…</p>}
        </div>
      )}
    </div>
  )
}
