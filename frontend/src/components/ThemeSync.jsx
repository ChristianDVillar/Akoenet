import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { applyTheme, loadTheme } from '../lib/themePreferences'

/** Applies saved UI colors + profile accent whenever the session user or accent changes. */
export default function ThemeSync() {
  const { user } = useAuth()

  useEffect(() => {
    try {
      if (user?.id != null) {
        localStorage.setItem('akoenet_ui_theme_active_uid', String(user.id))
      } else {
        localStorage.removeItem('akoenet_ui_theme_active_uid')
      }
    } catch {
      /* ignore */
    }
    const t = loadTheme(user?.id)
    applyTheme(t, { accentColor: user?.accent_color })
  }, [user?.id, user?.accent_color])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onSchemeChange = () => {
      const t = loadTheme(user?.id)
      if (t.colorMode !== 'system') return
      applyTheme(t, { accentColor: user?.accent_color })
    }
    mq.addEventListener('change', onSchemeChange)
    return () => mq.removeEventListener('change', onSchemeChange)
  }, [user?.id, user?.accent_color])

  return null
}
