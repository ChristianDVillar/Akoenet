/** True when the bundle runs inside the Tauri webview (desktop), not in a normal browser tab. */
export function isTauri() {
  if (typeof window === 'undefined') return false
  return Object.prototype.hasOwnProperty.call(window, '__TAURI_INTERNALS__')
}
