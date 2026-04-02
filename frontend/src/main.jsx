import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'

const AppRouter = __SPA_HASH_ROUTER__ ? HashRouter : BrowserRouter
import './i18n.js'
import './index.css'
import { applyTheme, loadTheme } from './lib/themePreferences.js'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { LandingLocaleProvider } from './context/LandingLocaleProvider.jsx'

const TWITCH_OAUTH_ERR_KEY = 'akoenet_twitch_oauth_error'

/** Runs before React so /?twitch_token= works on static hosts without a SPA rewrite for deep links. */
function consumeTwitchOAuthFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('twitch_token')
    const err = params.get('twitch_error')
    if (!token && !err) return
    if (token) localStorage.setItem('token', token)
    const refresh = params.get('refresh_token')
    if (refresh) localStorage.setItem('refresh_token', refresh)
    if (err) sessionStorage.setItem(TWITCH_OAUTH_ERR_KEY, err)
    params.delete('twitch_token')
    params.delete('refresh_token')
    params.delete('twitch_error')
    const q = params.toString()
    const path = err ? '/login' : window.location.pathname || '/'
    window.history.replaceState({}, '', path + (q ? `?${q}` : '') + (window.location.hash || ''))
  } catch (_) {
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
