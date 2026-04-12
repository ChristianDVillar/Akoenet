/** Copy for the public landing page (EN default, ES alternate). */

/** Public marketing / company site (Dakinis Systems). */
export const DAKINIS_SYSTEMS_URL = 'https://dakinissystems.onrender.com/'

export const landingContent = {
  en: {
    nav: {
      features: 'Features',
      app: 'App',
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
    presenceSection: {
      eyebrow: 'Live game presence',
      title: 'See what your server is playing — without juggling apps',
      lead:
        'AkoeNet shows who is in which game: connect Steam for automatic “now playing”, type a manual status for any store or console, or opt in to desktop detection in the Windows app. Sharing is off until you enable it; auto-detection stays off by default.',
      bullets: [
        'Per-server trending list (“who is playing what” right now)',
        'Steam via official Web API when you link your account',
        'Manual line for Epic, Riot, consoles, or games Steam does not surface',
      ],
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
        a: 'No installer is required: it runs in the browser. Optionally install it as a PWA from the “App” section — that is not a browser extension. You need an account and, for voice, microphone permission (and camera if you use it).',
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
        a: 'Use the footer links: Terms of Service, Privacy Policy, Cookie policy, and Legal notice. You can accept or reject non-essential storage in the cookie banner.',
      },
      {
        q: 'Why does Windows or Chrome warn that the desktop download is dangerous?',
        a: 'The desktop .exe is not signed with a commercial code-signing certificate. Browsers and Windows SmartScreen commonly flag unknown publishers. If you trust this site, you can keep the file; on SmartScreen use “More info” → “Run anyway,” or use the web app / PWA instead. Signing the build with Authenticode (paid certificate) reduces those warnings.',
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
    appSection: {
      title: 'Install the app',
      lead:
        'The usual “install” is the PWA (left): same app in its own window. On the right you can download the Windows desktop installer (Tauri) when we host it, or build from source. None of these is a browser extension.',
      standaloneNote: "You're already using AkoeNet as an installed app.",
      desktop: {
        pwaTitle: 'From the browser (Chrome / Edge)',
        pwaBody:
          'Add AkoeNet as its own window with a taskbar or dock icon. This is progressive web app install — not a Chrome/Edge extension and not an add-on from a store.',
        installCta: 'Install AkoeNet',
        installFallback:
          'If you don’t see a button, use the install icon in the address bar, or the browser menu → Install / Install page as app.',
        installAccepted: 'Installation started — check your applications or taskbar.',
        installDismissed: 'You can install anytime from the browser menu.',
        standalonePwaTitle: 'Web app (already installed)',
        standalonePwaLead:
          'You opened AkoeNet from the installed shortcut or home screen. The browser install banner is hidden here by design.',
        nativeTitle: 'Native desktop (Windows, Tauri)',
        nativeBody:
          'There is no pre-built installer to download from this site. To produce a .exe / .app / installer, clone the repo, install Rust, configure frontend/.env, then run npm run tauri:build in frontend/. See frontend/README.md. Still not a browser extension.',
        nativeBodyHosted:
          'Windows installer below. Same web client in a native window — not a browser extension. You can also build from source.',
        nativeDownloadCta: 'Download Windows installer (x64)',
        nativeDocsCta: 'Open build instructions',
        installerVersionHint: 'Installer linked from this button: v{{v}}',
      },
      mobile: {
        pwaTitle: 'Add to your home screen',
        pwaBodyAndroid:
          'Open this site in Chrome. Tap the menu (⋮) → Add to Home screen or Install app. You’ll get a full-screen shortcut like a native app.',
        pwaBodyIOS:
          'Open this site in Safari. Tap the Share button → Add to Home Screen. On iOS, installing from the home screen works best with Safari.',
        pwaBodyOther:
          'Use your browser’s menu to add this page to your home screen or install it as an app, if your browser supports it.',
        roadmapTitle: 'App stores (roadmap)',
        roadmapBody:
          'A Capacitor build for Google Play and the App Store is planned for richer push and store discovery; the PWA works today without a store.',
      },
    },
  },
  es: {
    nav: {
      features: 'Funciones',
      app: 'App',
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
    presenceSection: {
      eyebrow: 'Presencia de juego en vivo',
      title: 'Ve qué juega tu servidor sin abrir más apps',
      lead:
        'AkoeNet muestra quién está en qué juego: conecta Steam para el “jugando ahora”, escribe un estado manual para cualquier tienda o consola, o activa la detección en el escritorio (app Windows). Tú decides qué compartir; la detección automática va desactivada por defecto.',
      bullets: [
        'Tendencias por servidor (quién juega a qué en este momento)',
        'Steam con la API oficial cuando enlazas la cuenta',
        'Línea manual para Epic, Riot, consolas o juegos que Steam no publica',
      ],
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
        a: 'No hace falta un instalador clásico: el cliente es web. Opcionalmente puedes instalarla como PWA desde la sección “App” — eso no es una extensión del navegador. Necesitas cuenta y, para voz, permiso de micrófono (y cámara si la usas).',
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
        a: 'En el pie de página: Términos, Privacidad, Política de cookies, Moderación de contenidos y aviso legal. Puedes aceptar o rechazar lo no esencial en el banner de cookies.',
      },
      {
        q: '¿Por qué Windows o Chrome dicen que la descarga de escritorio es peligrosa?',
        a: 'El .exe no está firmado con un certificado de firma de código de un editor comercial. Es normal que el navegador y Windows SmartScreen adviertan por “editor desconocido”. Si confías en este sitio, puedes conservar el archivo; en SmartScreen: “Más información” → “Ejecutar de todas formas”, o usa la web/PWA. Para repartir la app con menos avisos hay que firmar el ejecutable con Authenticode (certificado de pago).',
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
    appSection: {
      title: 'Instalar la app',
      lead:
        'La forma habitual de “instalar” es la PWA (columna izquierda): misma app en ventana propia. A la derecha puedes descargar el instalador de escritorio para Windows (Tauri) cuando lo ofrecemos, o compilar desde el código. Ninguna opción es una extensión del navegador.',
      standaloneNote: 'Ya estás usando AkoeNet como app instalada.',
      desktop: {
        pwaTitle: 'Desde el navegador (Chrome / Edge)',
        pwaBody:
          'Añade AkoeNet como ventana propia con icono en la barra de tareas o el dock. Es instalación PWA: no es una extensión de Chrome ni de Edge ni un complemento de tienda.',
        installCta: 'Instalar AkoeNet',
        installFallback:
          'Si no ves el botón, usa el icono de instalación en la barra de direcciones o el menú del navegador → Instalar página como aplicación.',
        installAccepted: 'Instalación iniciada: revisa aplicaciones o la barra de tareas.',
        installDismissed: 'Puedes instalar cuando quieras desde el menú del navegador.',
        standalonePwaTitle: 'App web (ya instalada)',
        standalonePwaLead:
          'Abriste AkoeNet desde el acceso instalado o la pantalla de inicio. El aviso de instalación del navegador no aplica aquí.',
        nativeTitle: 'Escritorio nativo (Windows, Tauri)',
        nativeBody:
          'Desde esta web no se ofrece un instalador listo para descargar. Para obtener .exe / .app / instalador, clona el repositorio, instala Rust, configura frontend/.env y ejecuta npm run tauri:build en frontend/. Detalle en frontend/README.md. Tampoco es una extensión del navegador.',
        nativeBodyHosted:
          'Instalador para Windows más abajo. Mismo cliente web en ventana nativa — no es extensión del navegador. También puedes compilar desde el código.',
        nativeDownloadCta: 'Descargar instalador Windows (x64)',
        nativeDocsCta: 'Ver instrucciones de compilación',
        installerVersionHint: 'Instalador del enlace de este botón: v{{v}}',
      },
      mobile: {
        pwaTitle: 'Añadir a la pantalla de inicio',
        pwaBodyAndroid:
          'Abre este sitio en Chrome. Menú (⋮) → Añadir a la pantalla de inicio o Instalar aplicación. Tendrás un acceso a pantalla completa parecido a una app nativa.',
        pwaBodyIOS:
          'Abre este sitio en Safari. Compartir → Añadir a pantalla de inicio. En iOS conviene usar Safari para la instalación.',
        pwaBodyOther:
          'Usa el menú del navegador para añadir esta página al inicio o instalarla como app, si tu navegador lo permite.',
        roadmapTitle: 'Tiendas de apps (hoja de ruta)',
        roadmapBody:
          'Se plantea un empaquetado con Capacitor para Google Play y App Store (notificaciones y descubrimiento); la PWA ya funciona sin tienda.',
      },
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
    cookies: 'Cookie policy',
    moderation: 'Content moderation',
    legalContact: 'Legal & DSA contact',
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
    cookies: 'Política de cookies',
    moderation: 'Moderación de contenidos',
    legalContact: 'Contacto legal y DSA',
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
