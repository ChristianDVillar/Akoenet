import { Preferences } from '@capacitor/preferences'
import { isCapacitorNative } from '../lib/mobile-runtime'

const TOKEN_KEY = 'token'
const REFRESH_TOKEN_KEY = 'refresh_token'

async function setNativeValue(key, value) {
  if (!isCapacitorNative()) return
  try {
    if (value) {
      await Preferences.set({ key, value })
    } else {
      await Preferences.remove({ key })
    }
  } catch {
    /* native store opcional */
  }
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
  if (!isCapacitorNative()) return
  try {
    const tokenRes = await Preferences.get({ key: TOKEN_KEY })
    const refreshRes = await Preferences.get({ key: REFRESH_TOKEN_KEY })
    setLocalValue(TOKEN_KEY, tokenRes?.value || null)
    setLocalValue(REFRESH_TOKEN_KEY, refreshRes?.value || null)
  } catch {
    /* sin copia nativa o plugin no listo */
  }
}
