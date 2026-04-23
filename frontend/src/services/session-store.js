import { isCapacitorNative } from '../lib/mobile-runtime'

const TOKEN_KEY = 'token'
const REFRESH_TOKEN_KEY = 'refresh_token'

let preferencesPromise = null

async function getPreferences() {
  if (!isCapacitorNative()) return null
  if (!preferencesPromise) {
    preferencesPromise = import('@capacitor/preferences')
      .then((mod) => mod?.Preferences || null)
      .catch(() => null)
  }
  return preferencesPromise
}

async function setNativeValue(key, value) {
  const Preferences = await getPreferences()
  if (!Preferences) return
  if (value) {
    await Preferences.set({ key, value })
    return
  }
  await Preferences.remove({ key })
}

function getLocalValue(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function setLocalValue(key, value) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function getAccessToken() {
  return getLocalValue(TOKEN_KEY)
}

export function getRefreshToken() {
  return getLocalValue(REFRESH_TOKEN_KEY)
}

export function setAccessToken(token) {
  setLocalValue(TOKEN_KEY, token || null)
  void setNativeValue(TOKEN_KEY, token || null)
}

export function setRefreshToken(token) {
  setLocalValue(REFRESH_TOKEN_KEY, token || null)
  void setNativeValue(REFRESH_TOKEN_KEY, token || null)
}

export function clearSessionTokens() {
  setAccessToken(null)
  setRefreshToken(null)
}

export async function hydrateSessionFromNativeStorage() {
  const Preferences = await getPreferences()
  if (!Preferences) return
  const [tokenRes, refreshRes] = await Promise.all([
    Preferences.get({ key: TOKEN_KEY }),
    Preferences.get({ key: REFRESH_TOKEN_KEY }),
  ])
  setLocalValue(TOKEN_KEY, tokenRes?.value || null)
  setLocalValue(REFRESH_TOKEN_KEY, refreshRes?.value || null)
}
