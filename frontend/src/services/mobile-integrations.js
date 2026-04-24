import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { isCapacitorNative } from '../lib/mobile-runtime'
import { resolveMobileAppUrlToRoute } from '../lib/mobile-deep-links'
import { setAccessToken, setRefreshToken } from './session-store'

/**
 * En Android, permisos + `register()` activan FCM y exigen Firebase (`google-services.json` + plugin `google-services`).
 * Sin eso el plugin nativo puede tumbar el proceso. En iOS se sigue intentando el flujo habitual.
 */
function mayUseNativePush() {
  if (Capacitor.getPlatform() !== 'android') return true
  const v = String(import.meta.env?.VITE_ANDROID_FCM_REGISTER || '').trim().toLowerCase()
  return v === '1' || v === 'true'
}

function dispatchPushToken(token) {
  if (!token) return
  const platform = String(window?.Capacitor?.getPlatform?.() || '').toLowerCase()
  window.dispatchEvent(new CustomEvent('akoenet:mobile-push-token', { detail: { token, platform } }))
}

function maybePersistTokensFromRoute(route) {
  if (!route || !route.startsWith('/auth/twitch/callback')) return
  const q = route.includes('?') ? route.slice(route.indexOf('?') + 1) : ''
  const p = new URLSearchParams(q)
  const token = p.get('token')
  const refresh = p.get('refresh_token')
  if (token) setAccessToken(token)
  if (refresh) setRefreshToken(refresh)
}

export async function initMobileIntegrations(navigate) {
  if (!isCapacitorNative() || typeof navigate !== 'function') return () => {}
  const removers = []

  if (App?.addListener) {
    const urlHandle = await App.addListener('appUrlOpen', ({ url }) => {
      const route = resolveMobileAppUrlToRoute(url)
      if (!route) return
      maybePersistTokensFromRoute(route)
      navigate(route)
    })
    removers.push(() => {
      try {
        urlHandle?.remove?.()
      } catch {
        /* ignore */
      }
    })
  }

  if (PushNotifications && mayUseNativePush()) {
    try {
      let perm = await PushNotifications.checkPermissions()
      if (perm.receive !== 'granted') {
        perm = await PushNotifications.requestPermissions()
      }
      if (perm.receive === 'granted') {
        const regHandle = await PushNotifications.addListener('registration', (token) => {
          dispatchPushToken(token?.value)
        })
        const regErrHandle = await PushNotifications.addListener('registrationError', () => {})
        await PushNotifications.register()
        removers.push(() => {
          try {
            regHandle?.remove?.()
          } catch {
            /* ignore */
          }
        })
        removers.push(() => {
          try {
            regErrHandle?.remove?.()
          } catch {
            /* ignore */
          }
        })
      }
    } catch {
      /* ignore */
    }
  }

  return () => {
    removers.forEach((fn) => fn())
  }
}
