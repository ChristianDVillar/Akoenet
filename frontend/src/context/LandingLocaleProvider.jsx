import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import i18n from '../i18n.js'
import { getLandingLocaleOrDefault, LANDING_LOCALE_STORAGE_KEY } from '../lib/landingLocale.js'
import { LandingLocaleContext } from './landingLocaleContext'

/** Default UI language is English; Spanish is opt-in via landing toggle or localStorage. */
export function LandingLocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() =>
    typeof window !== 'undefined' ? getLandingLocaleOrDefault() : 'en',
  )

  const setLocale = useCallback((next) => {
    const v = next === 'es' ? 'es' : 'en'
    setLocaleState(v)
    try {
      localStorage.setItem(LANDING_LOCALE_STORAGE_KEY, v)
    } catch {
      /* ignore */
    }
    void i18n.changeLanguage(v)
  }, [])

  useLayoutEffect(() => {
    const short = String(i18n.language || '').split('-')[0]
    if (short !== locale) void i18n.changeLanguage(locale)
  }, [locale])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = locale === 'es' ? 'es' : 'en'
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])

  return <LandingLocaleContext.Provider value={value}>{children}</LandingLocaleContext.Provider>
}
