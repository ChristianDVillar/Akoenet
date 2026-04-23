let capacitorCorePromise = null

async function getCapacitorCore() {
  if (!capacitorCorePromise) {
    capacitorCorePromise = import('@capacitor/core')
      .then((mod) => mod?.Capacitor || null)
      .catch(() => null)
  }
  return capacitorCorePromise
}

export function isCapacitorNative() {
  const platform = typeof window !== 'undefined' ? window.Capacitor?.getPlatform?.() : null
  return platform === 'android' || platform === 'ios'
}

export async function addNativeAppStateListener(onActive) {
  if (typeof onActive !== 'function') return () => {}
  const Capacitor = await getCapacitorCore()
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
