/** Same key as legacy landing — also used by i18next-browser-languagedetector. */
export const LANDING_LOCALE_STORAGE_KEY = 'akoenet_landing_locale'

export function readStoredLandingLocale() {
  try {
    const v = localStorage.getItem(LANDING_LOCALE_STORAGE_KEY)
    if (v === 'es' || v === 'en') return v
  } catch {
    /* ignore */
  }
  return null
}

export function getLandingLocaleOrDefault() {
  return readStoredLandingLocale() ?? 'en'
}
