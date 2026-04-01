import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

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
    },
  },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

export default i18n
