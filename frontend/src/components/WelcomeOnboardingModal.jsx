import { Trans, useTranslation } from 'react-i18next'

const STORAGE_KEY = 'akoenet_onboarding_v1'

export function hasSeenOnboarding() {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY))
  } catch {
    return true
  }
}

export function dismissOnboarding() {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* ignore */
  }
}

export default function WelcomeOnboardingModal({ open, onClose }) {
  const { t } = useTranslation()
  if (!open) return null
  return (
    <div
      className="welcome-onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-onboarding-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          dismissOnboarding()
          onClose()
        }
      }}
    >
      <div className="welcome-onboarding-card card">
        <h2 id="welcome-onboarding-title">{t('onboarding.title')}</h2>
        <p className="muted small">
          <Trans
            i18nKey="onboarding.lead"
            components={{ sched: <strong /> }}
          />
        </p>
        <ul className="welcome-onboarding-list">
          <li>
            <Trans i18nKey="onboarding.bulletServer" components={{ b: <strong /> }} />
          </li>
          <li>
            <Trans
              i18nKey="onboarding.bulletScheduler"
              components={{
                sched: <strong />,
                b2: <strong />,
                code1: <code className="inline-code" />,
                code2: <code className="inline-code" />,
              }}
            />
          </li>
          <li>
            <Trans
              i18nKey="onboarding.bulletMentions"
              components={{
                sched: <strong />,
                codeu: <code className="inline-code" />,
                codee: <code className="inline-code" />,
              }}
            />
          </li>
          <li>
            <Trans
              i18nKey="onboarding.bulletSearch"
              components={{
                sched: <strong />,
                kbd1: <kbd className="kbd" />,
                kbd2: <kbd className="kbd" />,
                kbd3: <kbd className="kbd" />,
                kbd4: <kbd className="kbd" />,
              }}
            />
          </li>
        </ul>
        <div className="welcome-onboarding-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              dismissOnboarding()
              onClose()
            }}
          >
            {t('onboarding.gotIt')}
          </button>
        </div>
      </div>
    </div>
  )
}
