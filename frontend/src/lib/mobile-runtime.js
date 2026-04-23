import { Capacitor } from '@capacitor/core'

/**
 * Import estático de @capacitor/core: un único módulo en el grafo.
 * Un `import('@capacitor/core')` dinámico aparte empaquetaba otra copia (p. ej. dist-*.js),
 * volvía a ejecutar initCapacitorGlobal y rompía plugins como Preferences ("…then() is not implemented").
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
  const AppMod = await import('@capacitor/app').catch(() => null)
  const App = AppMod?.App
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
