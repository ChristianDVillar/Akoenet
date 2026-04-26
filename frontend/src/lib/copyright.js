/**
 * Atribución de derechos de autor del cliente web AkoeNet.
 * Dakinis Systems constituye la titularidad de marca y despliegue referenciada en el pie legal.
 */

export const COPYRIGHT_HOLDER = 'Dakinis Systems'

function isSpanishCopyrightLocale(locale) {
  return String(locale ?? 'en').toLowerCase().startsWith('es')
}

function copyrightTradingNameSuffix(locale) {
  return isSpanishCopyrightLocale(locale)
    ? 'Marca comercial de Christian Villar. Todos los derechos reservados.'
    : 'Trading name of Christian Villar. All rights reserved.'
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
 * Línea © con marca Dakinis para pie / textos planos (paridad con Streamer Scheduler `dakinisCopyrightNotice`).
 * @param {string} [locale]
 */
export function dakinisCopyrightNotice(locale = 'en') {
  const { year, holder, suffix } = clientCopyrightLineParts(locale)
  return `© ${year} ${holder} ${suffix}`
}
