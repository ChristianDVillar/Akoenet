import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import './i18n.js'
import './index.css'
import { applyTheme, loadTheme } from './lib/themePreferences.js'
import { isTauri } from './lib/isTauri.js'
import { runDesktopUpdateCheck } from './lib/desktopUpdates.js'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { LandingLocaleProvider } from './context/LandingLocaleProvider.jsx'

const AppRouter = __SPA_HASH_ROUTER__ ? HashRouter : BrowserRouter

const TWITCH_OAUTH_ERR_KEY = 'akoenet_twitch_oauth_error'

/** Runs before React so /?twitch_token= or /#/?twitch_token= (HashRouter) works on static hosts. */
function consumeTwitchOAuthFromUrl() {
  try {
    let params = new URLSearchParams(window.location.search)
    let token = params.get('twitch_token')
    let err = params.get('twitch_error')
    if (!token && !err && window.location.hash?.includes('?')) {
      const qi = window.location.hash.indexOf('?')
      const inHash = new URLSearchParams(window.location.hash.slice(qi + 1))
      token = inHash.get('twitch_token')
      err = inHash.get('twitch_error')
      if (token || err) params = inHash
    }
    if (!token && !err) return
    if (token) localStorage.setItem('token', token)
    const refresh = params.get('refresh_token')
    if (refresh) localStorage.setItem('refresh_token', refresh)
    if (err) sessionStorage.setItem(TWITCH_OAUTH_ERR_KEY, err)
    const path = err ? '/login' : window.location.pathname || '/'
    const cleanHash =
      window.location.hash?.includes('?') && (token || err)
        ? window.location.hash.replace(/\?.*$/, '') || '#/'
        : window.location.hash || ''
    window.history.replaceState({}, '', path + cleanHash)
  } catch {
    /* ignore */
  }
}

consumeTwitchOAuthFromUrl()

/** Apply saved UI theme before React paints (reduces flash; accent syncs after /auth/me). */
function bootstrapThemeEarly() {
  try {
    const uid = localStorage.getItem('akoenet_ui_theme_active_uid')
    applyTheme(loadTheme(uid || undefined), { accentColor: null })
  } catch {
    /* ignore */
  }
}
bootstrapThemeEarly()

if (isTauri() && import.meta.env.DEV) {
  import('@tauri-apps/plugin-log')
    .then(({ attachConsole }) => attachConsole())
    .catch(() => {})
}

void runDesktopUpdateCheck()

/** PWA: manifest + minimal SW so Chrome/Edge can offer install (HTTPS or localhost). */
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL || '/'
    const swPath = `${base.replace(/\/?$/, '/') }sw.js`.replace(/([^:]\/)\/+/g, '$1')
    navigator.serviceWorker.register(swPath).catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRouter>
      <LandingLocaleProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LandingLocaleProvider>
    </AppRouter>
  </StrictMode>
)
