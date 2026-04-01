/** Copy for the public landing page (EN default, ES alternate). */
export const landingContent = {
  en: {
    nav: {
      features: 'Features',
      faq: 'FAQ',
      terms: 'Terms',
      privacy: 'Privacy',
      signIn: 'Sign in',
      signUp: 'Create account',
      langLabel: 'Language',
    },
    hero: {
      eyebrow: 'Communities + streaming',
      title: 'Organize your community and your streaming schedule',
      lead:
        'Built-in Streamer Scheduler commands (`!schedule`, `!next`), servers with text and voice, DMs, mentions, and roles — more than a chat platform, built for communities and streamers.',
      ctaPrimary: 'Get started',
      ctaSecondary: 'I already have an account',
    },
    featuresTitle: 'What you get',
    featureCards: [
      {
        title: 'Streamer Scheduler',
        body: 'Show upcoming streams from the public Scheduler API with simple chat commands; set your slug in user settings.',
      },
      {
        title: 'Live chat',
        body: 'Instant channel messages, reactions, pins, mentions, search, and history export.',
      },
      {
        title: 'Voice & camera',
        body: 'WebRTC voice rooms with mute, level meter, and per-participant volume.',
      },
      {
        title: 'Roles & permissions',
        body: 'Control who can view, send, or connect in each channel.',
      },
      {
        title: 'Direct messages',
        body: 'Private conversations between members without leaving the app.',
      },
    ],
    faqTitle: 'Frequently asked questions',
    faq: [
      {
        q: 'What is AkoeNet?',
        a: 'A community-style platform with servers, text and voice channels, direct messages, and role-based permissions — built for groups that want real-time chat and WebRTC voice.',
      },
      {
        q: 'Do I need to install anything?',
        a: 'No. It runs in the browser. You only need an account and, for voice, microphone permission (and camera if you use it).',
      },
      {
        q: 'How do voice channels work?',
        a: 'They use WebRTC between browsers, with signaling over Socket.IO. On restrictive networks you may need TURN servers configured in the frontend (VITE_ICE_SERVERS).',
      },
      {
        q: 'Can I sign in with Twitch?',
        a: 'If the deployment admin has configured Twitch OAuth on the backend, you will see it on the sign-in screen.',
      },
      {
        q: 'Where are the terms and privacy policy?',
        a: 'Use the footer links: Terms of Service, Privacy Policy, and Legal notice. Cookies and local storage are described in the Privacy Policy.',
      },
    ],
    apiOfflineBanner: {
      message:
        'We can’t reach the API server. Sign-in may not work until the backend is available (check VITE_API_URL or wait for the service to wake up).',
      retry: 'Retry connection',
    },
    inviteJoin: {
      title: 'Have an invite?',
      hint: 'Paste the full link or the short code from your host. You can sign in or create an account on the next screen.',
      placeholder: 'Invite link or code',
      button: 'Continue',
      error: 'Paste a link or invite code.',
    },
  },
  es: {
    nav: {
      features: 'Funciones',
      faq: 'FAQ',
      terms: 'Términos',
      privacy: 'Privacidad',
      signIn: 'Entrar',
      signUp: 'Crear cuenta',
      langLabel: 'Idioma',
    },
    hero: {
      eyebrow: 'Comunidades + streaming',
      title: 'Organiza tu comunidad y tu calendario de streams',
      lead:
        'Integración con Streamer Scheduler (`!schedule`, `!next`), servidores con texto y voz, DM, menciones y roles — una plataforma amplia, pensada para comunidades y streamers.',
      ctaPrimary: 'Empezar gratis',
      ctaSecondary: 'Ya tengo cuenta',
    },
    featuresTitle: 'Funciones principales',
    featureCards: [
      {
        title: 'Streamer Scheduler',
        body: 'Muestra próximos streams desde la API pública del Scheduler con comandos en el chat; configura tu slug en ajustes de usuario.',
      },
      {
        title: 'Chat en vivo',
        body: 'Mensajes por canal, reacciones, pins, menciones, búsqueda y exportación de historial.',
      },
      {
        title: 'Voz y cámara',
        body: 'Canales de voz WebRTC con mute, medidor y volumen por participante.',
      },
      {
        title: 'Roles y permisos',
        body: 'Control de quién ve, escribe o se conecta a cada canal.',
      },
      {
        title: 'Mensajes directos',
        body: 'Conversaciones privadas entre miembros sin salir del flujo de la app.',
      },
    ],
    faqTitle: 'Preguntas frecuentes',
    faq: [
      {
        q: '¿Qué es AkoeNet?',
        a: 'Una plataforma tipo comunidad con servidores, canales de texto y voz, mensajes directos y permisos por roles. Pensada para grupos que quieren chat en tiempo real y salas de voz con WebRTC.',
      },
      {
        q: '¿Necesito instalar algo?',
        a: 'No. El cliente es web (navegador). Solo necesitas una cuenta y, para voz, permitir micrófono (y cámara si la usas).',
      },
      {
        q: '¿Cómo funcionan los canales de voz?',
        a: 'Usan WebRTC entre navegadores, con señalización por Socket.IO. En redes restringidas puede hacer falta configurar servidores TURN en el frontend (variable VITE_ICE_SERVERS).',
      },
      {
        q: '¿Puedo usar Twitch para entrar?',
        a: 'Si el administrador del despliegue ha configurado OAuth de Twitch en el backend, verás la opción en la pantalla de inicio de sesión.',
      },
      {
        q: '¿Dónde leo términos y privacidad?',
        a: 'En el pie de página: Términos del servicio, Política de privacidad y aviso legal. Las cookies y el almacenamiento local se describen en la política de privacidad.',
      },
    ],
    apiOfflineBanner: {
      message:
        'No hay conexión con el servidor. El inicio de sesión puede fallar hasta que el backend esté disponible (revisa VITE_API_URL o espera a que el servicio arranque).',
      retry: 'Reintentar',
    },
    inviteJoin: {
      title: '¿Tienes una invitación?',
      hint: 'Pega el enlace completo o el código que te pasó el anfitrión. Si no tienes cuenta, podrás crearla en el siguiente paso.',
      placeholder: 'Enlace o código de invitación',
      button: 'Continuar',
      error: 'Pega un enlace o un código de invitación.',
    },
  },
}

export const footerContent = {
  en: {
    versionTitle: 'Web client version',
    legalNav: 'Legal links',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    legal: 'Legal notice',
    dmca: 'DMCA',
    dpo: 'Data protection',
    status: 'System status',
    copyrightReserved: 'All rights reserved.',
    copyrightSubject: 'Use is subject to',
    copyrightBetweenLinks: 'and',
    independentNotice: 'AkoeNet is independent software and is not affiliated with Discord Inc.',
    twitchDisclaimer:
      'Twitch is a trademark of Twitch Interactive, Inc. This service is not affiliated with, endorsed by, or sponsored by Twitch.',
  },
  es: {
    versionTitle: 'Versión del cliente web',
    legalNav: 'Enlaces legales',
    terms: 'Términos del servicio',
    privacy: 'Política de privacidad',
    legal: 'Aviso legal',
    dmca: 'DMCA',
    dpo: 'Protección de datos',
    status: 'Estado del sistema',
    copyrightReserved: 'Todos los derechos reservados.',
    copyrightSubject: 'El uso está sujeto a',
    copyrightBetweenLinks: 'y',
    independentNotice: 'AkoeNet es software independiente y no está afiliado a Discord Inc.',
    twitchDisclaimer:
      'Twitch es una marca de Twitch Interactive, Inc. Este servicio no está afiliado, patrocinado ni respaldado por Twitch.',
  },
}

/** Login/register: browser language → footer-style legal line (no landing locale in tree). */
export const authFooter = {
  en: {
    copyrightReserved: 'All rights reserved.',
    copyrightSubject: 'Use is subject to',
    copyrightBetweenLinks: 'and',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
  },
  es: {
    copyrightReserved: 'Todos los derechos reservados.',
    copyrightSubject: 'El uso está sujeto a',
    copyrightBetweenLinks: 'y',
    terms: 'Términos del servicio',
    privacy: 'Política de privacidad',
  },
}

export function resolveAuthFooterLocale() {
  if (typeof navigator === 'undefined') return 'en'
  const lang = String(navigator.language || '').toLowerCase()
  return lang.startsWith('es') ? 'es' : 'en'
}
