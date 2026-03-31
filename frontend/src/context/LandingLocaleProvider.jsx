import { useCallback, useEffect, useMemo, useState } from 'react'
import { LandingLocaleContext } from './landingLocaleContext'

const STORAGE_KEY = 'akoenet_landing_locale'

/** Default UI language is English; Spanish is opt-in via landing toggle or localStorage. */
function readStoredLocale() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'es' || v === 'en') return v
  } catch {
    /* ignore */
  }
  return 'en'
}

export function LandingLocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() =>
    typeof window !== 'undefined' ? readStoredLocale() : 'en',
  )

  const setLocale = useCallback((next) => {
    const v = next === 'es' ? 'es' : 'en'
    setLocaleState(v)
    try {
      localStorage.setItem(STORAGE_KEY, v)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = locale === 'es' ? 'es' : 'en'
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])

  return <LandingLocaleContext.Provider value={value}>{children}</LandingLocaleContext.Provider>
}
