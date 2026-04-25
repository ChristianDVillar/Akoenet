import { Preferences } from '@capacitor/preferences'
import { isCapacitorNative } from '../lib/mobile-runtime'

const DEVICE_ID_KEY = 'mobile_device_id'

function readLocal(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocal(key, value) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function createDeviceId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch {
    /* ignore */
  }
  const rand = Math.random().toString(16).slice(2)
  return `dev_${Date.now().toString(36)}_${rand}`
}

export async function getOrCreateDeviceId() {
  const fromLocal = String(readLocal(DEVICE_ID_KEY) || '').trim()
  if (fromLocal) return fromLocal

  if (isCapacitorNative()) {
    try {
      const nativeRes = await Preferences.get({ key: DEVICE_ID_KEY })
      const nativeValue = String(nativeRes?.value || '').trim()
      if (nativeValue) {
        writeLocal(DEVICE_ID_KEY, nativeValue)
        return nativeValue
      }
    } catch {
      /* ignore */
    }
  }

  const generated = createDeviceId()
  writeLocal(DEVICE_ID_KEY, generated)
  if (isCapacitorNative()) {
    try {
      await Preferences.set({ key: DEVICE_ID_KEY, value: generated })
    } catch {
      /* ignore */
    }
  }
  return generated
}
