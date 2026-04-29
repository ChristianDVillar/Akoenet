/**
 * Atribución de derechos de autor del cliente web AkoeNet.
 * Dakinys Systems constituye la titularidad de marca y despliegue referenciada en el pie legal.
 */

export const COPYRIGHT_HOLDER = 'Dakinys Systems'

function isSpanishCopyrightLocale(locale) {
  return String(locale ?? 'en').toLowerCase().startsWith('es')
}

function copyrightTradingNameSuffix(locale) {
  return isSpanishCopyrightLocale(locale)
    ? 'Todos los derechos reservados.'
    : 'All rights reserved.'
}

function getCopyrightDisplayYear() {
  return new Date().getFullYear()
}

/**
 * Partes del pie © usadas en SiteFooter y AuthLegalStrip (nombre titular + sufijo legal).
 * @param {string} [locale] Código BCP 47 (`es`, `en`, `es-ES`, etc.)
 */
export function clientCopyrightLineParts(locale) {
  return {
    year: getCopyrightDisplayYear(),
    holder: COPYRIGHT_HOLDER,
    suffix: copyrightTradingNameSuffix(locale),
  }
}

/**
 * Línea © con marca Dakinys para pie / textos planos (paridad con Streamer Scheduler `dakinisCopyrightNotice`).
 * @param {string} [locale]
 */
export function dakinisCopyrightNotice(locale = 'en') {
  const { year, holder, suffix } = clientCopyrightLineParts(locale)
  return `© ${year} ${holder} ${suffix}`
}
