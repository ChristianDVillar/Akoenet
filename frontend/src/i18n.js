import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { LANDING_LOCALE_STORAGE_KEY } from './lib/landingLocale.js'
import en from './locales/en.js'
import es from './locales/es.js'
import enServerUi from './locales/enServerUi.js'
import esServerUi from './locales/esServerUi.js'
import { deepMergeTranslations } from './locales/mergeTranslations.js'
import { isCapacitorNative } from './lib/mobile-runtime.js'

const resources = {
  en: { translation: deepMergeTranslations(en, enServerUi) },
  es: { translation: deepMergeTranslations(es, esServerUi) },
}

const mobileNative = isCapacitorNative()

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // Mobile app: force English on startup.
    lng: mobileNative ? 'en' : undefined,
    fallbackLng: 'en',
    supportedLngs: ['en', 'es'],
    interpolation: { escapeValue: false },
    detection: {
      order: mobileNative ? [] : ['localStorage', 'navigator'],
      lookupLocalStorage: LANDING_LOCALE_STORAGE_KEY,
      caches: mobileNative ? [] : ['localStorage'],
    },
  })

export default i18n
