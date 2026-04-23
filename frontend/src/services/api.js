import axios from 'axios'
import { getApiBaseUrl } from '../lib/apiBase'
import {
  clearSessionTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from './session-store'

const baseURL = getApiBaseUrl()

const api = axios.create({ baseURL })
const rawApi = axios.create({ baseURL })

let refreshInFlight = null
let keepAliveTimer = null

/** Decode JWT payload (no signature verify) — used only to schedule refresh before exp. */
function decodeJwtPayload(token) {
  try {
    const parts = String(token).split('.')
    if (parts.length < 2) return null
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const json = atob(b64)
    return JSON.parse(json)
  } catch {
    return null
  }
}

/** Single in-flight refresh for interceptor, keep-alive, and foreground — backend rotates refresh tokens. */
async function sharedRefresh() {
  const refresh = getRefreshToken()
  if (!refresh) throw new Error('no_refresh')
  if (!refreshInFlight) {
    refreshInFlight = rawApi
      .post('/auth/refresh', { refresh_token: refresh })
      .then((res) => res.data)
      .finally(() => {
        refreshInFlight = null
      })
  }
  const data = await refreshInFlight
  if (data?.token) setAccessToken(data.token)
  if (data?.refresh_token) setRefreshToken(data.refresh_token)
  startSessionKeepAlive()
  return data
}

async function refreshAccessTokenSilently() {
  try {
    await sharedRefresh()
    return true
  } catch {
    return false
  }
}

function clearKeepAliveTimer() {
  if (keepAliveTimer) {
    clearTimeout(keepAliveTimer)
    keepAliveTimer = null
  }
}

/** Renueva el access token antes de caducar y reprograma el siguiente ciclo. */
export function startSessionKeepAlive() {
  clearKeepAliveTimer()
  const refresh = getRefreshToken()
  const token = getAccessToken()
  if (!refresh || !token) return

  const payload = decodeJwtPayload(token)
  const expMs = payload?.exp ? payload.exp * 1000 : Date.now() + 25 * 60 * 1000
  const skewMs = 2 * 60 * 1000
  let delay = expMs - skewMs - Date.now()
  if (delay < 15_000) delay = 15_000
  if (delay > 24 * 60 * 60 * 1000) delay = 24 * 60 * 60 * 1000

  keepAliveTimer = setTimeout(async () => {
    keepAliveTimer = null
    const ok = await refreshAccessTokenSilently()
    if (!ok) {
      stopSessionKeepAlive()
      clearSessionTokens()
      window.dispatchEvent(new CustomEvent('akoenet:session-lost'))
    }
  }, delay)
}

export function stopSessionKeepAlive() {
  clearKeepAliveTimer()
}

/** Tras volver de segundo plano o suspensión, refresca solo si el JWT está caducado o próximo a caducar. */
export async function refreshSessionAfterForeground() {
  const refresh = getRefreshToken()
  if (!refresh) return
  const token = getAccessToken()
  const payload = decodeJwtPayload(token)
  const expMs = payload?.exp ? payload.exp * 1000 : 0
  const now = Date.now()
  if (expMs > now + 5 * 60 * 1000) return
  await refreshAccessTokenSilently()
}

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const status = err.response?.status
    if (status === 403 && err.response?.data?.error === 'terms_acceptance_required') {
      window.dispatchEvent(new CustomEvent('akoenet:terms-required'))
    }
    const cfg = err.config
    if (
      status !== 401 ||
      !cfg ||
      cfg._retry ||
      String(cfg.url || '').includes('/auth/refresh') ||
      String(cfg.url || '').includes('/auth/login')
    ) {
      return Promise.reject(err)
    }
    const refresh = getRefreshToken()
    if (!refresh) return Promise.reject(err)
    cfg._retry = true
    try {
      const data = await sharedRefresh()
      cfg.headers.Authorization = `Bearer ${data.token}`
      return api(cfg)
    } catch (e) {
      stopSessionKeepAlive()
      clearSessionTokens()
      return Promise.reject(e)
    }
  }
)

export default api
