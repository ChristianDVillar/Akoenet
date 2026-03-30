import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
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
    if (err) sessionStorage.setItem(TWITCH_OAUTH_ERR_KEY, err)
    params.delete('twitch_token')
    params.delete('twitch_error')
    const q = params.toString()
    const path = err ? '/login' : window.location.pathname || '/'
    window.history.replaceState({}, '', path + (q ? `?${q}` : '') + (window.location.hash || ''))
  } catch (_) {
    /* ignore */
  }
}

consumeTwitchOAuthFromUrl()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <LandingLocaleProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LandingLocaleProvider>
    </BrowserRouter>
  </StrictMode>
)
