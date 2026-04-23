import { isCapacitorNative } from '../lib/mobile-runtime'
import { resolveMobileAppUrlToRoute } from '../lib/mobile-deep-links'
import { setAccessToken, setRefreshToken } from './session-store'

async function loadNativeModules() {
  const [appMod, pushMod] = await Promise.all([
    import('@capacitor/app').catch(() => null),
    import('@capacitor/push-notifications').catch(() => null),
  ])
  return {
    App: appMod?.App || null,
    PushNotifications: pushMod?.PushNotifications || null,
  }
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
  const { App, PushNotifications } = await loadNativeModules()
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

  if (PushNotifications) {
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
