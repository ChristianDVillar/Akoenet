/** @returns {'desktop' | 'mobile' | 'tablet'} */
export function getLandingDeviceKind() {
  if (typeof window === 'undefined') return 'desktop'
  try {
    const ud = navigator.userAgentData
    if (ud && typeof ud.mobile === 'boolean') {
      if (ud.mobile) return /iPad/i.test(navigator.userAgent) ? 'tablet' : 'mobile'
      return 'desktop'
    }
  } catch {
    /* ignore */
  }
  const ua = navigator.userAgent || ''
  if (/iPad|Tablet/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'tablet'
  }
  if (/Mobi|Android.*Mobile|iPhone|iPod/i.test(ua)) return 'mobile'
  return 'desktop'
}

export function isIosBrowser() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/i.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

export function isAndroidBrowser() {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
  } catch {
    /* ignore */
  }
  return Boolean(window.navigator.standalone)
}
