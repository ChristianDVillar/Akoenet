import { useTranslation } from 'react-i18next'
import { useLandingLocale } from '../hooks/useLandingLocale'

/**
 * EN / ES toggle — updates `LandingLocaleProvider` + i18next (`akoenet_landing_locale` in localStorage).
 * @param {object} props
 * @param {string} [props.className] — e.g. `landing-lang-toggle` on marketing pages
 * @param {string} [props.ariaLabel] — override default aria-label from i18n
 */
export default function LanguageSwitcher({ className = '', ariaLabel: ariaLabelProp }) {
  const { locale, setLocale } = useLandingLocale()
  const { t } = useTranslation()
  const ariaLabel = ariaLabelProp ?? t('language.ariaLabel')
  const rootClass = ['landing-lang-toggle', className].filter(Boolean).join(' ')

  return (
    <div className={rootClass} role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className={`landing-lang-btn${locale === 'en' ? ' is-active' : ''}`}
        onClick={() => setLocale('en')}
        aria-pressed={locale === 'en'}
      >
        EN
      </button>
      <button
        type="button"
        className={`landing-lang-btn${locale === 'es' ? ' is-active' : ''}`}
        onClick={() => setLocale('es')}
        aria-pressed={locale === 'es'}
      >
        ES
      </button>
    </div>
  )
}
