import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

/**
 * Imports estáticos de @capacitor/*: un solo grafo; los `import()` dinámicos a @capacitor/app
 * u otros paquetes hacían que Vite emitiera otro chunk con otra copia de @capacitor/core
 * y rompía Preferences ("…then() is not implemented on android").
 */
export function isCapacitorNative() {
  try {
    const platform = Capacitor.getPlatform()
    return platform === 'android' || platform === 'ios'
  } catch {
    return false
  }
}

export async function addNativeAppStateListener(onActive) {
  if (typeof onActive !== 'function') return () => {}
  if (!Capacitor?.isNativePlatform?.()) return () => {}
  if (!App?.addListener) return () => {}
  const handle = await App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) onActive()
  })
  return () => {
    try {
      handle?.remove?.()
    } catch {
      /* ignore */
    }
  }
}
