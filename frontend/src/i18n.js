import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { LANDING_LOCALE_STORAGE_KEY } from './lib/landingLocale.js'

const resources = {
  en: {
    translation: {
      login: {
        title: 'Sign in',
        signingIn: 'Signing in…',
        home: 'Home',
        email: 'Email',
        password: 'Password',
        signIn: 'Sign in',
        signUp: 'Sign up',
        noAccount: 'Do not have an account?',
        twoFactorTitle: 'Two-factor authentication',
        twoFactorHint: 'Enter the 6-digit code from your authenticator app.',
        twoFactorCode: 'Authentication code',
        verify: 'Verify',
        back: 'Back',
      },
      common: {
        loading: 'Loading…',
      },
      dashboard: {
        steamLinked: 'Steam account linked.',
        steamError: 'Steam link did not complete ({{code}}). Try again from User settings → Game activity.',
        twitchLinked: 'Twitch account linked.',
        twitchError:
          'Twitch link did not complete ({{code}}). Try again from User settings → Game activity.',
      },
      userSettings: {
        activity: {
          navTab: 'Game activity',
          intro:
            'Let people in your servers see what you are playing. You can turn this off anytime.',
          shareLabel: 'Share game activity with my servers',
          twitchHeading: 'Twitch',
          twitchLinkedAs: 'Connected as @{{username}}',
          twitchNotLinked: 'Not connected',
          connectTwitch: 'Connect Twitch',
          reconnectTwitch: 'Reconnect Twitch',
          unlinkTwitch: 'Unlink Twitch',
          twitchUnavailableHint:
            'Twitch linking is not configured on this server (missing Twitch OAuth credentials).',
          errorTwitchUnavailable: 'Twitch linking is not available right now.',
          errorTwitchStart: 'Could not start Twitch linking.',
          errorTwitchUnlink: 'Could not unlink Twitch.',
          twitchUnlinkedInfo: 'Twitch account unlinked.',
          steamHeading: 'Steam',
          steamLinked: 'Linked',
          steamNotLinked: 'Not linked',
          connectSteam: 'Connect Steam',
          reconnectSteam: 'Reconnect Steam',
          unlinkSteam: 'Unlink Steam',
          redirecting: 'Redirecting…',
          manualGame: 'Manual game',
          manualGamePh: 'e.g. Fortnite',
          manualPlatform: 'Platform / store (optional)',
          manualPlatformPh: 'Epic, Xbox, Switch…',
          desktopAuto: 'Update my game automatically on Windows',
          desktopAppHint: '(desktop app)',
          save: 'Save game activity',
          saving: 'Saving…',
          savedInfo: 'Game activity settings saved.',
          unlinkedInfo: 'Steam account unlinked.',
          errorSave: 'Could not save game activity settings.',
          errorUnavailable: 'That option isn’t available right now.',
          errorSteamStart: 'Could not start Steam linking.',
          errorUnlink: 'Could not unlink Steam.',
          errorBlocked: 'That text is not allowed.',
        },
      },
    },
  },
  es: {
    translation: {
      login: {
        title: 'Iniciar sesión',
        signingIn: 'Entrando…',
        home: 'Inicio',
        email: 'Correo',
        password: 'Contraseña',
        signIn: 'Entrar',
        signUp: 'Registrarse',
        noAccount: '¿No tienes cuenta?',
        twoFactorTitle: 'Autenticación en dos pasos',
        twoFactorHint: 'Introduce el código de 6 dígitos de tu app de autenticación.',
        twoFactorCode: 'Código',
        verify: 'Verificar',
        back: 'Volver',
      },
      common: {
        loading: 'Cargando…',
      },
      dashboard: {
        steamLinked: 'Cuenta de Steam vinculada.',
        steamError:
          'No se completó el enlace con Steam ({{code}}). Vuelve a intentarlo en Ajustes de usuario → Actividad de juego.',
        twitchLinked: 'Cuenta de Twitch vinculada.',
        twitchError:
          'No se completó el enlace con Twitch ({{code}}). Vuelve a intentarlo en Ajustes de usuario → Actividad de juego.',
      },
      userSettings: {
        activity: {
          navTab: 'Actividad de juego',
          intro:
            'Permite que en tus servidores vean a qué estás jugando. Puedes desactivarlo cuando quieras.',
          shareLabel: 'Compartir actividad de juego con mis servidores',
          twitchHeading: 'Twitch',
          twitchLinkedAs: 'Conectado como @{{username}}',
          twitchNotLinked: 'Sin conectar',
          connectTwitch: 'Conectar Twitch',
          reconnectTwitch: 'Volver a conectar Twitch',
          unlinkTwitch: 'Desvincular Twitch',
          twitchUnavailableHint:
            'La vinculación con Twitch no está configurada en este servidor (faltan credenciales OAuth de Twitch).',
          errorTwitchUnavailable: 'La vinculación con Twitch no está disponible ahora mismo.',
          errorTwitchStart: 'No se pudo iniciar la vinculación con Twitch.',
          errorTwitchUnlink: 'No se pudo desvincular Twitch.',
          twitchUnlinkedInfo: 'Cuenta de Twitch desvinculada.',
          steamHeading: 'Steam',
          steamLinked: 'Vinculada',
          steamNotLinked: 'Sin vincular',
          connectSteam: 'Conectar Steam',
          reconnectSteam: 'Volver a conectar Steam',
          unlinkSteam: 'Desvincular Steam',
          redirecting: 'Redirigiendo…',
          manualGame: 'Juego manual',
          manualGamePh: 'p. ej. Fortnite',
          manualPlatform: 'Plataforma / tienda (opcional)',
          manualPlatformPh: 'Epic, Xbox, Switch…',
          desktopAuto: 'Actualizar mi juego automáticamente en Windows',
          desktopAppHint: '(app de escritorio)',
          save: 'Guardar actividad de juego',
          saving: 'Guardando…',
          savedInfo: 'Ajustes de actividad de juego guardados.',
          unlinkedInfo: 'Cuenta de Steam desvinculada.',
          errorSave: 'No se pudieron guardar los ajustes de actividad de juego.',
          errorUnavailable: 'Esa opción no está disponible ahora mismo.',
          errorSteamStart: 'No se pudo iniciar la vinculación con Steam.',
          errorUnlink: 'No se pudo desvincular Steam.',
          errorBlocked: 'Ese texto no está permitido.',
        },
      },
    },
  },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'es'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANDING_LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  })

export default i18n
