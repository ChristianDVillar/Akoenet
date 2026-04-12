# AkoeNet - Estructura y funcionamiento actual

Este documento resume la arquitectura actual del proyecto, los flujos principales y los componentes clave de backend/frontend.

*Última revisión estructural: abril 2026 (backend **1.4.x**, frontend/desktop **0.6.x**: ajustes de servidor por pestañas como User settings; `GET /integrations/scheduler/servers` y `…/channels` para el Streamer Scheduler; sesión persistente JWT + socket; desktop, `render.yaml`, workflow Windows por tag; registro por email, DM/amistad, Resend, UX móvil y cookies).*

## Últimos cambios del documento

- **Abril 2026 (servidor + Scheduler):** **`ServerSettingsModal.jsx`** usa el mismo layout de pestañas que **`UserSettingsModal`**: Invites, Emojis, Commands, Events, Announcements. Backend **1.4.0**: OpenAPI y rutas `GET /integrations/scheduler/servers` y `GET /integrations/scheduler/servers/:serverId/channels` (secreto compartido con el webhook de streams). Documentado en §15.1.1 y §24.6.
- **Abril 2026 (sesión + desktop):** el frontend renueva el access token **antes de caducar** (`startSessionKeepAlive` en `frontend/src/services/api.js`, programado según `exp` del JWT) usando **`sharedRefresh()`** único para evitar carreras con el interceptor axios en `/auth/refresh` (el backend rota el refresh token). Al volver a la pestaña, `refreshSessionAfterForeground()` solo llama a `/auth/refresh` si el JWT expira en menos de 5 minutos o ya caducó. El **Socket.IO** usa `auth` como función que lee `localStorage` en cada handshake y reconexión (`reconnectionAttempts: Infinity`), para que tras cortes de red o suspensión el token siga siendo válido. Si el refresco falla, se dispara `akoenet:session-lost` y `AuthContext` limpia la sesión. **Desktop:** versión **0.3.1** en `package.json` / `src-tauri/tauri.conf.json`; instalador servido desde `frontend/public/releases/` y referenciado en **`render.yaml`** (`VITE_DESKTOP_INSTALLER_URL`). Publicación CI: `.github/workflows/publish-tauri-windows.yml` en push de tag `v*` (secretos `TAURI_SIGNING_PRIVATE_KEY` en GitHub Actions).
- **Fecha:** abril 2026.
- Se alineó la guía con el estado real del código: `2FA TOTP`, `refresh tokens`, `notificaciones push web`, `threads` base, `social` (amistades/bloqueos) e `i18n` base.
- Se corrigió el inventario de migraciones con `1733000019000_refresh_tokens` y `1733000020000_extended_features`.
- Se actualizó el mapa de rutas backend para incluir `\`/link-preview\`` y `\`/social\``.
- Se depuró la sección de roadmap para quitar como “pendiente” funcionalidades que ya están implementadas.
- **Registro por email verificado:** flujo `POST /auth/register/start` → correo con enlace → `GET /auth/register/pending?token=` → `POST /auth/register/complete`; tabla `registration_tokens` (migración `1733000023000_registration_email_tokens`). Correo transaccional vía **Resend** (`backend/src/lib/resend-mail.js`): logo **Akoenet.png** incrustado por **CID** (no usar `localhost` en `src` de imágenes); variables `FRONTEND_URL`, `FRONTEND_HASH_ROUTER`, `EMAIL_LOGO_URL`, `MAIL_LOGO_PATH` opcionales. En Render, si el frontend usa HashRouter, el enlace del correo debe salir como `/#/register/complete?token=...`.
- **Frontend:** rutas `/register` (solo email) y `/register/complete?token=`; `AuthContext` expone `registerStart` / `registerComplete`. Banner de cookies (`CookieConsentBanner`) fijo **arriba**; modal de onboarding (`WelcomeOnboardingModal`) con overlay más legible. Vista servidor: **sin barra inferior móvil** duplicada (solo rail izquierdo).
- **Miembros del servidor (`MembersPanel`):** al seleccionar un miembro, acciones **Add friend** (`POST /social/friends/request`) y **Message** (crea o reutiliza DM con `POST /dm/conversations` y navega a `/messages?conversation=<id>`). `DirectMessagesPanel` lee el query `conversation` y abre la conversación (móvil: chat a pantalla completa).

## 1) Stack y arquitectura

- **Despliegue público (Render):** SPA en **https://akoenet-frontend.onrender.com**; API en **https://akoenet-backend.onrender.com**. El cliente Vite en producción usa ese API por defecto si no defines `VITE_API_URL` (`frontend/src/lib/apiBase.js`). CORS en backend: `CORS_ORIGINS` debe incluir el origen del frontend; OAuth/correos: `FRONTEND_URL` / `PUBLIC_API_URL` con HTTPS reales (ver `backend/.env.example`). Para enlaces de registro por correo: en backend definir `FRONTEND_URL=https://<tu-frontend>` y alinear `FRONTEND_HASH_ROUTER` con el build del frontend (`true` si usa HashRouter, `false` si usa BrowserRouter con rewrite `/* -> /index.html`).
- **Frontend:** React + Vite + React Router + Socket.IO Client.
- **Backend:** Node.js + Express + Socket.IO + JWT; arranque vía `backend/src/index.js` tras `require("./load-env")` para cargar siempre `backend/.env` con ruta absoluta (`backend/src/load-env.js`).
- **Base de datos:** PostgreSQL (local, Docker Compose o gestionado; p. ej. **Supabase**). El pool en `backend/src/config/db.js` activa **TLS** automáticamente cuando la URL o el host indican conexión remota (`sslmode=require`, `*.supabase.co`, etc.); opcional `PGSSL_REJECT_UNAUTHORIZED=false` si un proveedor exige relajar verificación de certificado.
- **Contenedores:** Docker Compose — servicios `postgres`, `backend`, `redis`, `minio` (el frontend suele ejecutarse aparte con Vite, no en este compose).
- **Producción / proxy:** middleware `backend/src/middleware/https-redirect.js` — en `NODE_ENV=production` redirige HTTP→HTTPS salvo `FORCE_HTTPS=false`; con `TRUST_PROXY=1` respeta `X-Forwarded-Proto` detrás de reverse proxy y envía HSTS.
- **Límite global de API:** `globalIpRateLimiter` en `backend/src/middleware/rate-limit.js` (todas las rutas salvo `/health`, `/health/deps`, `/docs*`); configurable con `GLOBAL_RATE_LIMIT_MAX` (por defecto **200** req/min por IP en `NODE_ENV=production`, **400** en desarrollo).

Arquitectura general:

1. El usuario se autentica (cuenta o Twitch OAuth).
2. El frontend guarda **JWT** + **refresh token** en `localStorage`, programa renovación proactiva del access token y abre el socket (handshake autenticado; en cada reconexión se envía el token vigente).
3. El backend valida permisos para servidores/canales/DMs.
4. Mensajes y eventos en tiempo real via Socket.IO.
5. Archivos (imágenes) con `STORAGE_DRIVER=local` se guardan en `backend/uploads` y se sirven por Express; con `s3` se almacenan en el bucket y el backend redirige o firma URLs (`GET /uploads/:key`).

## 2) Estructura del repositorio (alto nivel)

- **Nombre de la carpeta del clon:** conviene `AkoeNet` (evitar el antiguo `AkoNet`). Si sigues con `AkoNet`, renómbrala con el IDE cerrado o con `scripts/rename-project-folder-AkoeNet.ps1` desde la raíz del repo.
- `backend/`
  - `src/load-env.js`: carga siempre `backend/.env` con ruta fija (no depende del directorio de trabajo del proceso).
  - `src/index.js`: importa `./load-env`, crea `http.Server`, Socket.IO, asigna `app.locals.io = io` para que rutas HTTP (p. ej. webhooks) puedan emitir eventos al chat.
  - `src/config/db.js`: pool `pg` + lectura de `DATABASE_URL`; SSL para Postgres remoto cuando aplica.
  - `src/app.js`: monta Express con `httpsRedirect`, `helmet` (headers de seguridad), CORS configurable por allowlist (`CORS_ORIGINS`), JSON, `pino-http`, **`globalIpRateLimiter`**, estáticos/`/uploads/:key` (redirect S3), **`GET /health`**, **`GET /docs`** (Swagger UI), **`GET /docs/openapi.json`**, **`GET /health/deps`**, rutas públicas **`/dmca`** (formulario DMCA) y **`/dpo`** (contacto y solicitudes RGPD), rutas bajo **`/admin`** (auth+admin) para health extendido y CRUD admin, luego **`/auth`** (y alias **`/api/user/auth`** para URLs OAuth ya registradas), **`/servers`**, **`/channels`**, **`/messages`**, **`/upload`**, **`/dm`**, **`/integrations`**, **`/link-preview`** y **`/social`**; manejadores `notFound` + `errorHandler`.
  - `src/routes/`: auth, servers, channels, messages, upload, dm, admin, **integration** (Scheduler), **link-preview** y **social** (amistades/bloqueos).
  - `src/sockets/chat.socket.js`: eventos realtime (chat, voz, directos); comandos `!schedule` / `!next` hacia API del Scheduler.
  - `src/lib/message-reactions.js`: agregación de reacciones compartida entre historial REST y Socket.
  - `src/lib/channel-message-broadcast.js`: insertar mensaje de canal y emitir por Socket.IO (webhook Scheduler y respuestas de comandos).
  - `src/lib/scheduler-client.js`: construye URL del API JSON del Scheduler (`SCHEDULER_API_BASE_URL` + path o template), `fetch`, parseo JSON (detecta HTML/SPA → `scheduler_api_invalid_response`), normalización de eventos y `formatScheduleReply`.
  - `src/lib/scheduler-resolve.js`: mapea el login de Twitch al **slug** público del Scheduler cuando el usuario tiene `scheduler_streamer_username` en perfil (misma fila que `twitch_username`).
  - `src/lib/app-events.js`: `EventEmitter` interno (p. ej. `message.created`) para enlazar lógica sin acoplar al socket.
  - `src/lib/audit-log.js`: escritura no bloqueante de filas en `admin_audit_logs`.
  - `src/lib/blocked-content.js`: filtro de lenguaje prohibido (paquete `@2toad/profanity` + palabras extra vía entorno/archivo) aplicado a mensajes (HTTP/Socket) y campos de perfil en registro/`PATCH /auth/me`.
  - `src/lib/mentions.js`: parseo de `@usuario` / `@here` / `@everyone` en texto de canal, resolución contra miembros del servidor y emisión de `in_app_notification` a salas `user:<id>` (Socket.IO). `@here` y `@everyone` solo si el emisor puede gestionar canales (admin/moderador); `@here` usa la sala Socket `channel:{id}`.
  - `src/lib/membership.js`: además de permisos por canal, expone `listReadableChannelIds(userId)` usado por la búsqueda global de mensajes (filtra canales visibles con la misma lógica que `canReadChannel`).
  - `migrations/`: migraciones versionadas con `node-pg-migrate` (`npm run migrate` usa `node -r dotenv/config` para leer `backend/.env`).
  - `supabase/akonet_schema.sql` (opcional): script SQL único equivalente al esquema migrado + Realtime en Supabase; `supabase/storage_optional.sql` para bucket Storage opcional.
- `frontend/`
  - `.env`: `VITE_API_URL` apunta al backend en local (p. ej. `http://localhost:3000`); en producción el default es `https://akoenet-backend.onrender.com` si la variable no está definida. Ver `frontend/.env.example`. Opcional: `VITE_DESKTOP_INSTALLER_URL` (ruta relativa bajo `/releases/` o URL absoluta al `.exe`).
  - `src-tauri/`: aplicación de escritorio **Tauri 2** (Windows NSIS); `Cargo.toml` / `tauri.conf.json` y versión alineadas con `package.json`. El instalador generado puede copiarse a `public/releases/` para descarga desde el sitio estático.
  - `public/releases/`: instaladores desktop servidos como estáticos (p. ej. `AkoeNet_0.6.0_x64-setup.exe`).
  - `src/App.jsx`: rutas principales.
  - `src/context/AuthContext.jsx`: estado de sesión + login/logout + `connectAkoeNet` / `disconnectAkoeNet`; tras sesión válida llama a `startSessionKeepAlive()`; en logout y pérdida de sesión `stopSessionKeepAlive()`; escucha `akoenet:session-lost`; en `visibilitychange` (pestaña visible) puede refrescar tokens vía `refreshSessionAfterForeground`.
  - `src/pages/`: Login, **Register** (paso 1: email + envío de enlace), **RegisterComplete** (token en URL: username, contraseña, fecha de nacimiento), Home (landing o `Dashboard` si hay sesión; invitaciones vía query en `Home` o ruta `/invite/:token`), `Messages` (DMs en ruta dedicada), ServerView, TwitchCallback, **`LegalDocPage`** (`/legal/:slug`), **`DmcaPage`**, **`DpoPage`**, **`InvitePage`**, **`SystemStatus`** (pública en **`/status`**: diagnóstico `GET /health` + `GET /health/deps`).
  - `src/components/`: sidebar, canales, chat, voz, **miembros** (`MembersPanel`: búsqueda, amistad, apertura de DM), permisos, directos, ajustes de usuario (`UserSettingsModal`) y de servidor (`ServerSettingsModal`: pestañas Invites / Emojis / Commands / Events / Announcements); **`AppChrome.jsx`** (monta solo `GlobalSearchModal` y `children`; el atajo Ctrl+K / ⌘+K sigue abriendo el modal vía evento `akoenet-open-global-search`); **`AppChromeToolbar.jsx`** (botón 🔎 + **`NotificationBell`**), insertado **en la cabecera** de cada vista (no fijo al viewport): en **`Dashboard`** dentro de `.home-header-actions` junto al menú de usuario; en **`Messages`** a la derecha del título; en **`ChannelList`** (vista servidor) dentro de `.channel-header-leading` antes del menú de usuario; **`NotificationBell.jsx`** (escucha `in_app_notification`); **`GlobalSearchModal.jsx`** (búsqueda global `GET /messages/search/global`); **`WelcomeOnboardingModal.jsx`** (primera visita, clave `localStorage` `akoenet_onboarding_v1`); **`RichMessageText.jsx`** / **`EmojiText.jsx`** (URLs, shortcodes `:emoji:` y resaltado de `@menciones`); **`SchedulerUpcomingWidget.jsx`** (sidebar: llama a `GET /integrations/scheduler/upcoming` con JWT; el backend resuelve streamer por Twitch + perfil o variables de entorno; mensajes de error según `error` / `httpStatus`); **`UserSettingsModal.jsx`** incluye campo **Streamer Scheduler username** (`scheduler_streamer_username`) cuando el slug del Scheduler ≠ login de Twitch.
  - `src/lib/landingContent.js`: textos de la landing pública (EN/ES); el copy destaca **Streamer Scheduler** y comunidades, no solo “otro chat”.
  - `src/services/api.js`: cliente Axios con `Authorization: Bearer` desde `localStorage`; interceptor **401** → `POST /auth/refresh` mediante **`sharedRefresh()`** (misma promesa en vuelo que la renovación programada); exporta `startSessionKeepAlive`, `stopSessionKeepAlive`, `refreshSessionAfterForeground`.
  - `src/services/socket.js`: `io()` con `auth: (cb) => cb({ token: localStorage… })` para que cada reconexión use el JWT actual; `reconnectionAttempts: Infinity` y backoff; `connectAkoeNet(token)` opcionalmente escribe el token en `localStorage` antes de conectar.
  - `src/lib/postAuthDestination.js`: destino tras login, registro u OAuth (`postAuthDestination(user)`): administradores → `/admin`, resto → `/`.
  - `src/lib/invites.js`: helpers para URLs y payloads de invitaciones.
  - `src/lib/resolveImageUrl.js`: normaliza URLs de adjuntos/emojis (p. ej. MinIO directo → `/uploads/:key` del API).
  - `src/lib/voiceConstraints.js`: constraints de audio/video para WebRTC.
  - `src/hooks/useDismissiblePopover.js`: cierre de menús de usuario (click fuera / Escape).
- `docker-compose.yml` (raíz del repo): define los **servicios** `postgres`, `backend`, `redis`, `minio`. Los **nombres de contenedor** (`container_name`) son `akonet-db`, `akonet-backend`, `akonet-redis`, `akonet-minio` (en red interna el backend resuelve Redis como `redis`, MinIO como `minio`; el hostname de Postgres es `postgres` **solo** si usas la base del compose, vía `DATABASE_URL` en `backend/.env`).
- `render.yaml` (raíz): blueprint del **static site** en Render (`akoenet-frontend`): `rootDir: frontend`, build Vite, `VITE_DESKTOP_INSTALLER_URL` y rewrite `/*` → `/index.html` para SPA.
- En Render, el frontend suele compilarse con HashRouter (`RENDER=true` en build de Vite). Si mantienes ese modo, los enlaces transaccionales deben usar `/#/` (backend `FRONTEND_HASH_ROUTER=true`).
- `.github/workflows/publish-tauri-windows.yml`: al pushear un **tag** `v*`, compila Tauri en Windows y publica release + `latest.json` para el updater (requiere secretos de firma).
- `scripts/rename-project-folder-AkoeNet.ps1` (raíz): renombra la carpeta del clon `AkoNet` → `AkoeNet` (con el IDE cerrado).
- Documentacion en `docs/`:
  - `docs/README.md` (indice de documentacion),
  - `docs/README.en.md`, `docs/README.es.md` (guias),
  - `docs/PRODUCCION.md` (checklist operativo: HTTPS, backups, CDN, TURN, escala de búsqueda),
  - `docs/legal/PRIVACIDAD.md`, `docs/legal/TERMINOS_Y_CONDICIONES.md`, `docs/legal/PROTECCION_LEGAL.md`, `docs/legal/README.md`.
- En la raiz del repo: `README.md` (portada), `LICENSE`.

## 3) Base de datos (modelo actual)

Entidades principales:

- **Usuarios y auth:** `users` (incluye `birth_date`, `age_verified_at` para cumplimiento de edad y trazabilidad).
- **Servidores:** `servers` (incluye `is_system` para servidor del sistema).
- **Membresias y roles:** `server_members`, `roles`, `user_roles`.
- **Canales y estructura:** `channel_categories`, `channels`.
- **Permisos por canal:** `channel_permissions`, `channel_user_permissions`.
- **Mensajes de canal:** `messages` (texto + `image_url`, pin, `edited_at`, `reply_to_id` opcional hacia otro mensaje del mismo canal, reacciones vía `message_reactions`). Índice GIN FTS sobre `to_tsvector('simple', coalesce(content,''))` (migración `1733000013000_message_edit_reply_fts`).
- **Mensajeria directa:** `direct_conversations`, `direct_messages` (texto + `image_url`, `edited_at`, `reply_to_id` opcional; FTS análogo en contenido).
- **Usuarios (campos de integración):** `users.twitch_username` (login Twitch en minúsculas tras OAuth), `users.scheduler_streamer_username` (slug opcional en el API público del Streamer Scheduler si difiere del login Twitch).
- **Canales de voz:** `channels.voice_user_limit` (entero opcional; tope de usuarios en sala de voz).

Notas:

- La fuente de verdad del esquema es `backend/migrations` (tabla de control `pgmigrations` creada por `node-pg-migrate`).
- Migraciones en `backend/migrations/` (orden numérico del prefijo):
  - `1733000000000_init_akonet_schema`
  - `1733000001000_add_admin_user_and_flag`
  - `1733000002000_add_server_invites`
  - `1733000003000_add_server_emojis`
  - `1733000004000_add_message_pinning`
  - `1733000005000_add_message_reactions_and_audit_logs`
  - `1733000006000_add_user_profile_settings`
  - `1733000007000_add_user_presence_status`
  - `1733000008000_add_private_channels`
  - `1733000009000_add_voice_channel_user_limit`
  - `1733000010000_add_twitch_username`
  - `1733000011000_add_scheduler_streamer_username`
  - `1733000012000_add_user_erasure_fields`
  - `1733000013000_message_edit_reply_fts`
  - `1733000014000_add_user_birth_date` — fecha de nacimiento en registro (cumplimiento de edad mínima)
  - `1733000015000_dev_admin_password_admintest` / `1733000016000_ensure_dev_admin_christiandvillar` — ajustes de entorno de desarrollo (opcional según despliegue)
  - `1733000018000_legal_dmca_dpo_age_verified` — `users.age_verified_at`, columnas `dmca_removed_at` en `messages` y `direct_messages`, tablas `dmca_takedowns` y `dpo_requests`
  - `1733000019000_refresh_tokens` — tabla `refresh_tokens` para sesiones renovables (`/auth/refresh`, `/auth/logout`)
  - `1733000020000_extended_features` — 2FA TOTP, push subscriptions, amistades/bloqueos y soporte base de threads
  - `1733000021000_server_bans` — bans por servidor con expiración opcional y revocación
  - `1733000022000_message_edit_history` — historial de ediciones para mensajes de canal y DM
  - `1733000023000_registration_email_tokens` — tabla `registration_tokens` (tokens de verificación de email para registro en dos pasos; caducidad 24 h)
- El backend en imagen Docker ejecuta `npm run migrate && node src/index.js` al arrancar (migraciones antes del servidor).
- `channels` incluye `is_private` (boolean, default `false`) para canales privados con control de visibilidad.

### 3.1 Esquema en PostgreSQL gestionado (p. ej. Supabase)

- Definir `DATABASE_URL` en `backend/.env` con contraseña **codificada en URL** si incluye caracteres especiales (p. ej. `!` → `%21`) y, si el proveedor lo pide, `?sslmode=require`.
- Aplicar migraciones: `cd backend && npm run migrate` (carga `backend/.env` vía `dotenv`).
- Alternativa: ejecutar una sola vez `backend/supabase/akonet_schema.sql` en el editor SQL del proveedor **solo en base vacía**; el script registra filas en `pgmigrations` para no duplicar migraciones al usar después `npm run migrate`, habilita extensiones `pgcrypto` / `uuid-ossp` y registra tablas en **Supabase Realtime** de forma idempotente.
- Esquemas genéricos con `auth.users`, RLS y nombres distintos (`invites`, `member_role`, etc.) **no** son compatibles con el backend actual; la fuente de verdad sigue siendo `backend/migrations`.
- Storage opcional en Supabase: `backend/supabase/storage_optional.sql` (bucket `akonet-media` + políticas básicas); el API Node sigue usando uploads propios salvo que integres el SDK de Storage.

## 4) Autenticacion y sesion

### Cuenta local

- **Registro en dos pasos (verificación de email):**
  - `POST /auth/register/start` — cuerpo `{ email, invite? }` (invitación opcional a servidor). Genera token en `registration_tokens`, envía correo con enlace (Resend). Si el email ya está registrado, responde `200` con `{ sent: true }` sin filtrar existencia. Sin `RESEND_API_KEY` en producción: **503**; en desarrollo puede devolver `dev_verify_url` para pruebas.
  - En despliegue Render, validar que el enlace generado coincida con el router del SPA:
    - HashRouter: `https://<frontend>/#/register/complete?token=...`
    - BrowserRouter: `https://<frontend>/register/complete?token=...` + rewrite `/* -> /index.html`
  - `GET /auth/register/pending?token=` — valida token (64 hex); devuelve `email_masked` e `invite` si aplica.
  - `POST /auth/register/complete` — cuerpo `{ token, username, password, birth_date }` con **`birth_date`** obligatorio (`YYYY-MM-DD`) y edad mínima (13 años). Crea el usuario y elimina el token. El **username** se valida contra lenguaje prohibido (`400` / `blocked_content` si incumple).
- Tras completar, el cliente inicia sesión con `POST /auth/login` como antes.
- `POST /auth/login` valida credenciales y devuelve JWT.
- `GET /auth/me` retorna perfil autenticado.
- `PATCH /auth/me` actualiza perfil (username, avatar, banner, acento, bio, presencia, contraseña con validación de la actual). Incluye **`scheduler_streamer_username`** (opcional): slug del Streamer Scheduler cuando no coincide con `twitch_username`. Cadenas vacías (`""`) en URL/texto opcionales se normalizan a `null`. Los campos de texto **username**, **bio**, **custom_status** y **scheduler_streamer_username** se validan contra el mismo filtro de lenguaje prohibido (`blocked_content` si incumple).
- `GET /auth/me` y `PATCH /auth/me` devuelven `twitch_username` y `scheduler_streamer_username` junto al resto del perfil.
- `GET /auth/me/export` exporta datos personales del usuario autenticado (perfil, membresías, mensajes de canal y DMs enviados).
- `DELETE /auth/me` ejecuta olvido con política de retención: anonimiza PII de cuenta (`username`, `email`, perfil, credenciales externas), marca `deleted_at/erased_at` y mantiene contenido operativo cuando aplique por seguridad/moderación.

### Twitch OAuth

- `GET /auth/twitch/status` (sin JWT): indica si el servidor tiene OAuth listo (`configured`, `checks` por variable).
- `GET /auth/twitch/start` redirige a Twitch.
  - Si faltan `TWITCH_CLIENT_ID` o `TWITCH_CLIENT_SECRET`, responde **503** con JSON (`code`, `hint`, URLs de redirect) en lugar de redirigir.
- `GET /auth/twitch/callback` intercambia code, obtiene user Twitch, crea/actualiza usuario local (`twitch_username` = `login` en minúsculas), actualiza avatar/display name y devuelve JWT al frontend vía redirect con `?token=`.
- Frontend procesa token en `TwitchCallback`, refresca usuario y navega con `postAuthDestination` (home `/` o `/admin` si `is_admin`).
- **Login (`Login.jsx`)** y flujo tras **RegisterComplete** (login automático) usan `postAuthDestination` para la primera pantalla tras autenticar.
- **Login (`Login.jsx`):** al cargar, consulta `GET /auth/twitch/status` (timeout ~8 s); si `configured` es falso, deshabilita el botón de Twitch y muestra texto de ayuda. `VITE_API_URL` debe apuntar al backend.

### Contexto frontend

`AuthContext`:

- guarda/lee **access token** y **refresh token** en `localStorage` (el access JWT es de corta duración; el refresh permite `/auth/refresh` sin volver a pedir contraseña mientras el refresh siga válido en BD),
- hace `refreshUser` (`GET /auth/me`) al cargar; si la sesión es válida, inicia **`startSessionKeepAlive()`** (renovación periódica coordinada con `api.js`),
- conecta/desconecta socket; el socket no envía un token “fijo” en objeto estático: cada handshake/reconexión toma el token actual de `localStorage`,
- registro por cuenta local: `registerStart(email, invite?)` y `registerComplete(token, username, password, birth_date)` (tras éxito, login automático).
- incluye **User Settings** estilo Discord desde menú de usuario (punto único de configuración, sin modal de voz separado):
  - navegación por secciones en layout split (`Profile`, `Account`, `Voice`) con lista lateral y contenido al lado,
  - username,
  - avatar URL,
  - banner URL,
  - color de acento (`#RRGGBB`, con selector visual),
  - bio,
  - estado de presencia (`online`, `idle`, `dnd`, `invisible`),
  - estado personalizado,
  - `scheduler_streamer_username`,
  - cambio de contraseña (requiere contraseña actual),
  - ajustes de voz persistidos por usuario (`localStorage`): volumen de micro, monitor local, iniciar con cámara, iniciar muteado e iniciar deafeado.
- banner de consentimiento para almacenamiento local/cookies técnicas (`CookieConsentBanner`, clave `akoenet_cookie_consent_v1`).
- en **RegisterComplete** (enlace del correo), aceptación explícita de términos/privacidad con checkbox obligatorio antes de crear cuenta; en **Register** (paso email) se enlazan términos en el pie.

## 5) Servidores, canales y permisos

### Servidores

- `GET /servers` lista servidores del usuario.
- `POST /servers` crea servidor con:
  - roles por defecto (`admin`, `moderator`, `member`),
  - membresia owner,
  - categoria `General`, canal de texto `general`, canal de voz `Voice Chat`, canal de texto **`📅 upcoming streams`**,
  - mensaje de bienvenida automático en `general` (incluye explicación del Streamer Scheduler y `!schedule` / `!next`).
- `POST /servers/:id/join` permite unirse por ID.
- `POST /servers/:id/invites` crea invitación por link (token).
- `POST /servers/invite/:token/join` permite unirse con token/link.
- Moderación de acceso por servidor (bans):
  - `GET /servers/:serverId/ban-status` (autenticado: indica si el usuario está baneado),
  - `GET /servers/:serverId/bans` (moderación: lista bans activos),
  - `POST /servers/:serverId/bans` (moderación: crea ban; expulsa membresía y roles del servidor),
  - `DELETE /servers/:serverId/bans/:userId` (moderación: revoca ban activo).
- Emojis personalizados por servidor:
  - `GET /servers/:serverId/emojis` listar emojis
  - `POST /servers/:serverId/emojis` crear emoji
  - `DELETE /servers/:serverId/emojis/:emojiId` eliminar emoji
  - picker visual en chat para inserción rápida de shortcodes `:nombre:`

### Regla de servidor del sistema

- Servidores con `is_system = true` no se muestran en listado de usuario.
- Unirse al servidor del sistema esta bloqueado.
- Hay fallback por nombre de servidor configurable (`HIDDEN_SYSTEM_SERVER_NAME`, por defecto `AkoeNet`) para compatibilidad.

### Canales / categorias / permisos

- Crear, listar, reordenar y borrar canales/categorias via `channel.routes`.
- `PUT /channels/:channelId` actualiza nombre, categoría, `is_private` y, en canales **`voice`**, `voice_user_limit` (entero positivo o vacío para ilimitado) (requiere rol que pueda gestionar canales).
- `POST` de creación de canal acepta `voice_user_limit` solo si `type` es `voice`.
- Canales pueden marcarse como **privados** (`is_private = true`) al crear o editar.
- Permisos por rol y por usuario por canal:
  - `can_view`, `can_send`, `can_connect`.
- Las validaciones de acceso usan `backend/src/lib/membership.js`.
- Regla efectiva de acceso:
  - owner/admin conserva acceso completo.
  - canal publico sin reglas explicitas: visible por defecto a miembros.
  - canal privado sin reglas explicitas: moderador puede acceder por defecto; miembros requieren `can_view`.
  - permisos por usuario tienen prioridad sobre permisos por rol.

### Canales privados (estado actual)

- **Backend/DB:**
  - migración `1733000008000_add_private_channels.js` agrega `channels.is_private`.
  - `channel.routes` soporta `is_private` en create/update.
  - `GET /channels/server/:serverId` filtra y devuelve solo canales con `can_view` para el usuario actual.
  - `membership.js` aplica la lógica de visibilidad según `is_private` y permisos efectivos.
- **Frontend:**
  - creación de canal con toggle de privado en `ServerView`.
  - edición desde `ChannelPermissionsPanel` con opción de privado.
  - `ChannelList` muestra candado (`🔒`) en canales privados visibles para el usuario.
- **Comportamiento esperado:**
  - un usuario sin `can_view` no ve ni puede acceder al canal privado.
  - al otorgar `can_view`, el canal aparece y habilita el resto de permisos configurados.

## 6) Chat de canales (tiempo real)

### HTTP

- `GET /messages/channel/:channelId` devuelve historial.
- `GET /messages/channel/:channelId/search?q=&limit=` busca en contenido del canal (FTS con `to_tsvector/plainto_tsquery`).
- `GET /messages/search/global?q=&limit=` búsqueda **global** en todos los canales que el usuario puede leer (FTS; usa `listReadableChannelIds` + `ANY(channel_ids)`).
- `GET /messages/channel/:channelId/export?format=json|csv` exporta historial del canal.
- `PATCH /messages/:messageId` edita texto de mensaje (solo autor, valida `blocked_content`, marca `edited_at`).
- `GET /messages/:messageId/edit-history` historial de ediciones (autor o moderación).
- `DELETE /messages/:messageId` elimina mensaje (autor o moderación).
- `POST /messages/:messageId/pin` pinea mensaje (moderación).
- `POST /messages/:messageId/unpin` despinea mensaje (moderación).
- Reacciones:
  - `GET /messages/:messageId/reactions` lista agregada de reacciones
  - `POST /messages/:messageId/reactions` agrega reacción
  - `DELETE /messages/:messageId/reactions` quita reacción
  - `POST /messages/:messageId/report` reporta contenido de canal (usuario final → trazabilidad en `admin_audit_logs` con acción `message_report_user`)
  - Misma lógica SQL de agregación que en Socket.IO (`lib/message-reactions.js`) para evitar duplicar consultas.
- Paginación validada:
  - `limit` default `50`, máximo `100`.
  - `before` opcional para paginar hacia atrás.

- **Filtro de lenguaje prohibido (backend):** el texto del usuario se comprueba antes de guardar (ver `lib/blocked-content.js`). No sustituye la moderación humana ni copia listas propietarias de otras plataformas; usa listas mantenidas en `@2toad/profanity` (idiomas configurables, p. ej. `en`/`es`) más términos extra por operador.

### Socket

- `join_server`, `leave_server`
- `join_channel`, `leave_channel`
- `send_message` para texto/imagen (soporta `reply_to_message_id` cuando el padre pertenece al mismo canal)
- **Menciones:** en texto, `@usuario` notifica por socket a miembros del servidor con ese nombre (evento `in_app_notification` a sala `user:<id>`). `@here` notifica a usuarios en la sala Socket del canal; `@everyone` a todos los miembros del servidor. `@here` y `@everyone` **solo si** el emisor es admin o moderador (`canManageChannels`). Implementación en `lib/mentions.js`.
- `channel_typing` (evento entrante y broadcast): indicador de “escribiendo…” en canales (rate limit ~2s por usuario/canal en servidor); el cliente `Chat.jsx` lo muestra en la lista de mensajes.
- `receive_message` para broadcast del mensaje guardado
- `echonet_notification` para notificaciones dentro del servidor
- rate limiting realtime en envío de mensajes (`ack.error = rate_limited` cuando excede límite); los comandos `!schedule` / `!next` usan un **bucket aparte** (`scheduler_command`, límite `SCHEDULER_SOCKET_RATE_LIMIT_MAX`).
- si el texto del mensaje incumple el filtro de lenguaje prohibido: `ack({ error: "blocked_content" })` (el frontend muestra error y no limpia el compositor hasta envío correcto).
- `delete_message` / `message_deleted` para borrado realtime
- `pin_message` / `message_updated` para pin/unpin realtime
- `edit_message` / `message_updated` para edición realtime (actualiza `content` + `edited_at`)
- `react_message` / `message_reactions_updated` para reacciones realtime
- franja de "Mensajes pineados" en la parte superior del chat con salto rápido al mensaje original
- **UI de mensajes (`Chat.jsx`):** por cada mensaje, orden vertical: cuerpo + imagen → **fila de reacciones** (chips + picker) → **acciones con iconos** debajo: 🗑️ borrar, 📌 pin/unpin (resaltado si está pineado), ➕ añadir reacción, 🚩 reportar (`title` / `aria-label` conservan el texto para accesibilidad); si el servidor rechaza el texto por lenguaje prohibido (`blocked_content`), se muestra mensaje de error en el banner de envío.
- **Sincronización forzada de canal:** botón **Refresh** en cabecera de chat. El frontend solicita `GET /messages/channel/:channelId?after=<lastId>` para traer mensajes nuevos sin recargar todo el historial (útil tras reconexiones o pérdida de ACK).
- en canal hay **panel de búsqueda local** (icono 🔎) con salto al mensaje encontrado.
- se soporta **respuesta mínima** (botón ↩): el mensaje enviado guarda `reply_to_id` y renderiza preview (`reply_preview_username`, `reply_preview_content`).
- se soporta **edición inline** de mensajes propios (✎), con indicador visual `(edited)`.
- la franja se ordena por mas reciente pineado primero y muestra contador (ej. `3 pineados`)
- cada chip pineado renderiza shortcodes de emoji personalizados (`:nombre:`) como imagen inline
- cada chip pineado con imagen muestra miniatura y preview grande al hover/focus (estilo tooltip)
- compatibilidad para URLs antiguas de emojis/imagenes (MinIO directo): se normalizan al endpoint backend `/uploads/:key`
- fallback visual: si un emoji no carga, se muestra el shortcode de texto en lugar de icono roto
- el **cuerpo** del mensaje se renderiza con `RichMessageText`: detecta URLs (`http/https`) y shortcodes `:nombre:`; las reacciones usan `EmojiText` para mostrar emojis personalizados; las menciones `@…` se resaltan en UI (patrón alineado con el parser del backend).
- **Coincidencia con historial al escribir (solo cliente):** mientras el usuario escribe en el compositor (al menos un carácter), se buscan en el historial cargado mensajes de texto cuyo contenido **empiece por** el prefijo actual (comparación sin distinguir mayúsculas). Orden **cronológico** (el más antiguo primero). El mensaje activo se resalta (`message-row--composer-history-match`), la lista hace scroll hasta él y bajo el compositor aparece un resumen **History match · i / n** con autor y extracto. Si hay varias coincidencias, **↑ / ↓** pasan a la anterior/siguiente; al cambiar el texto se vuelve a la primera coincidencia del nuevo prefijo. No aplica a mensajes solo imagen ni a borradores optimistas. Estilos: `.composer-history-hint`.

### Shell de app (usuario autenticado en Dashboard / servidor / DMs)

- **`AppChrome.jsx`** rodea `Dashboard`, `ServerView` y `Messages` y monta **`GlobalSearchModal`** (el modal no depende de un botón flotante fijo al viewport).
- **`AppChromeToolbar.jsx`** (🔎 + campana 🔔) vive **en la misma fila que la cabecera** de cada pantalla (junto al usuario en home y en la columna de canales del servidor; en `/messages` a la derecha del título), para que búsqueda y notificaciones no se superpongan al menú de usuario.
- **Búsqueda global:** el botón 🔎 dispara `akoenet-open-global-search`; modal `GlobalSearchModal` → `GET /messages/search/global?q=&limit=`; atajos **Ctrl+K** / **⌘+K** para abrir o cerrar el modal.
- **Notificaciones in-app:** el socket emite `in_app_notification` a la sala `user:<userId>` (menciones, `@here` y, si aplica, `@everyone`). El usuario abre el hit y navega a `/server/:serverId?channel=:channelId`; **`ServerView`** lee el query, selecciona el canal y elimina el parámetro con `replace` (deep link sin recargar la lista de servidores de forma incorrecta).
- **Onboarding:** en el primer acceso al dashboard, `WelcomeOnboardingModal` (persistencia `localStorage` `akoenet_onboarding_v1`) explica Scheduler, menciones y atajo de búsqueda; el dashboard incluye un bloque destacado (**scheduler spotlight**) con el valor del producto.

## 7) Voz (WebRTC + Socket)

En canales tipo `voice`:

- El modelo permite **`voice_user_limit`** por canal (cap opcional de participantes en sala).
- Frontend crea stream local (`getUserMedia`) y peers P2P con `RTCPeerConnection`.
- Socket coordina señalizacion:
  - `voice:join`, `voice:leave`, `voice:signal`,
  - `voice:user-joined`, `voice:user-left`.

UI actual de voz:

- unirse/salir/silenciar,
- ajustes de voz integrados en **User Settings** (sección Voice) desde el menú de usuario en vista de servidor; no hay modal de voz separado en el Dashboard,
- ajuste de volumen de entrada de microfono (0% a 200%) persistido en `localStorage` por usuario,
- prueba de microfono local (sin unirse al canal),
- medidor visual del microfono local,
- **toggle de cámara** en User Settings (sección Voice) y en la sala de voz (encender/apagar en caliente),
- **pantalla compartida** (`getDisplayMedia`) en la sala: botón *Share screen* añade pista de vídeo a los `RTCPeerConnection` existentes y renegocia; vista local con pantalla grande y cámara en pip si ambas están activas; remotos con `<audio>` para voz y vídeos separados para pantalla vs cámara (heurística por `displaySurface` / etiqueta de pista),
- botones representativos en Voice settings (sin checkboxes) para monitor/mic/cámara/deafen,
- entrada a voz con preferencias de inicio: cámara on/off, muteado, deafeado,
- control en vivo de `Deafen/Undeafen` dentro de la sala,
- previsualizacion local de cámara y render de cámara remota por participante,
- diseño de sala de voz tipo Discord (tiles por usuario + barra de controles),
- indicador por usuario (`speaking` / `listening`) con estado visual,
- control de volumen por participante remoto (persistido en `localStorage` por usuario/canal),
- emojis personalizados renderizados en mensajes con shortcode `:nombre:`,
- picker visual de emojis en el composer para insertar `:nombre:` con click.

Calidad de audio (frontend):

- `getUserMedia` usa constraints en `voiceConstraints.js`:
  - `echoCancellation`, `noiseSuppression`, `autoGainControl`,
  - `channelCount: 1`,
  - `sampleRate` ideal a 48kHz.
- Se eliminó el uso de `track.applyConstraints({ volume })` por no ser válido para el control de ganancia de entrada en este flujo.

## 8) Mensajes directos (DM)

### HTTP (`/dm`)

- `GET /dm/users?q=` buscar usuarios.
- `POST /dm/conversations` crear o recuperar conversacion 1 a 1.
- `GET /dm/conversations` listar conversaciones del usuario.
- `GET /dm/conversations/:id/messages` historial.
- `GET /dm/conversations/:id/messages/search?q=&limit=` busca en contenido del chat directo (FTS).
- `POST /dm/conversations/:id/messages` enviar texto o imagen (soporta `reply_to_message_id` si pertenece a la misma conversación).
- `PATCH /dm/messages/:dmMessageId` edita texto de DM (solo autor, valida `blocked_content`, marca `edited_at`).
- `GET /dm/messages/:dmMessageId/edit-history` historial de ediciones del DM (autor).
- `POST /dm/messages/:dmMessageId/report` reporta un mensaje directo (trazabilidad en `admin_audit_logs` con acción `dm_message_report_user`; `conversation_id` y `reported_user_id` van en `metadata`).
- el cuerpo de texto del mensaje está sujeto al mismo filtro de lenguaje prohibido que el chat de canal; si incumple: HTTP `400` con `error: blocked_content` y `message` descriptivo.

### Socket

- `join_direct_conversation`, `leave_direct_conversation`
- `send_direct_message`
- `receive_direct_message`
- `edit_direct_message`
- `direct_message_updated`
- `direct_message_notification`
- si el texto incumple el filtro: `ack({ error: "blocked_content" })` (análogo al chat de canal).

### UI

La interfaz de DMs está en la ruta **`/messages`** (`Messages.jsx`), separada del Home/Dashboard (`/`). El componente `DirectMessagesPanel` se monta solo ahí; el Dashboard ya no incrusta el panel de directos.

- **Deep link:** `GET /messages?conversation=<id>` — al cargar, `DirectMessagesPanel` selecciona esa conversación, en viewport estrecho abre el chat móvil y elimina el query con `replace` (evita enlaces rotos con `localhost` en imágenes de correo; el flujo típico es abrir DM desde **Members** en servidor: `POST /dm/conversations` → navegar con `?conversation=`).
- barra lateral izquierda (`ServerSidebar`): debajo del icono **Home** hay una zona aparte con icono de **mensajes** (SVG) que navega a `/messages`; en esa vista el icono puede mostrarse activo; en **móvil** no se duplica barra inferior (home/mensajes/servidor): solo el rail con iconos,
- busqueda de usuarios,
- lista de conversaciones,
- chat directo realtime,
- envio de imagen adjunta,
- manejo de `rate_limited` y `blocked_content` en envío realtime por socket o HTTP,
- botón **Refresh** en cabecera de DM para sincronizar mensajes nuevos con `GET /dm/conversations/:id/messages?after=<lastId>`,
- indicador visual de presencia por usuario (dot online/offline) en resultados de búsqueda y lista de conversaciones,
- etiqueta `Online/Offline` en el header del chat directo seleccionado.
- botón **Reportar** (🚩) en mensajes de otra persona (misma UX que canal: motivo por `prompt` + feedback en banner).
- endpoint para trazabilidad del reportante: `GET /auth/me/reports` (lista reportes propios con estado `open|resolved|rejected` y metadatos de revisión).
- búsqueda en conversación (🔎), respuesta mínima (↩ + barra de contexto) y edición de mensajes propios (✎ + `(edited)`), con actualización realtime por `direct_message_updated`.
- la misma **coincidencia con historial al escribir** que en `Chat.jsx` (prefijo por contenido, orden cronológico, resaltado ↑/↓, barra `.composer-history-hint`; IDs de accesibilidad `dm-hist-msg-*`).

Presencia efectiva (backend + frontend):

- la presencia visible no depende solo del `presence_status` persistido en DB;
- backend calcula presencia efectiva por conexiones activas de Socket.IO:
  - si el usuario no tiene sesión activa (web/app), se expone como `offline`;
  - `invisible` también se presenta como `offline` a otros usuarios;
- esto se aplica en `GET /servers/:serverId/members`, `GET /dm/users` y `GET /dm/conversations` (`peer_presence_status`).

## 9) Subida de archivos

Rutas actuales:

- `POST /upload/channel/:channelId` (imagenes para canales)
- `POST /upload/direct/:conversationId` (imagenes para DMs)

Detalles:

- usa `multer`,
- limita tamano (5MB),
- validación previa en cliente (antes de subir): MIME permitido (`jpeg`, `png`, `webp`, `gif`, `avif`) y tamaño máximo 5MB, para evitar subidas fallidas tardías,
- guarda en `backend/uploads` cuando `STORAGE_DRIVER=local`,
- en `STORAGE_DRIVER=s3` sirve descarga via `GET /uploads/:key` con redirección a URL firmada temporal (presigned),
- restringe tipos de archivo a imagenes (`jpeg`, `png`, `webp`, `gif`, `avif`),
- al guardar archivos infiere extensión por MIME cuando el nombre original no trae extensión (evita previews rotas).
- validación redundante en storage: rechaza archivos sin MIME de imagen permitido (defensa en profundidad).

### 9.1) Formularios legales (DMCA y DPO)

Montaje en `app.js` **antes** del resto de API de producto: prefijos **`/dmca`** y **`/dpo`** (sin JWT). Rate limit dedicado: `legalFormsRateLimiter` (`LEGAL_FORMS_RATE_LIMIT_MAX`, default 8 req/min por IP).

- **`POST /dmca/takedown`** — cuerpo validado con `zod` (denunciante, titular, URLs, descripción, declaraciones de buena fe/exactitud, firma). Persiste en **`dmca_takedowns`**. Si está configurado **Resend** (`RESEND_API_KEY` en `backend/src/lib/resend-mail.js`), notifica al equipo: siempre incluye el buzón legal (`LEGAL_INBOX_EMAIL`, por defecto `akonet@streamautomator.com` vía `backend/src/lib/legal-mail.js`) y añade destinatarios extra si defines `DMCA_NOTIFY_EMAIL` / `ADMIN_NOTIFY_EMAIL` / `DPO_EMAIL`. Envía confirmación al denunciante.
- **`GET /dpo/contact`** — JSON con datos de contacto del DPD/DPO (`DPO_NAME`, `DPO_EMAIL`, `DPO_PHONE`, `DPO_ADDRESS`). Si `DPO_EMAIL` no está definido, el correo mostrado es el buzón legal anterior (mismo valor por defecto).
- **`POST /dpo/message`** — solicitudes de privacidad (tipos `access`, `erasure`, `portability`, etc.); persiste en **`dpo_requests`**; correos vía Resend al DPO y confirmación al usuario si aplica.

Esquema relacionado (migración `1733000018000`): `users.age_verified_at`; `messages.dmca_removed_at` / `direct_messages.dmca_removed_at` para retiradas; tablas `dmca_takedowns` y `dpo_requests` con estados y auditoría básica.

## 10) Frontend (rutas principales)

- `/login`
- `/register` (solicitud de enlace al email)
- `/register/complete?token=…` (finalizar alta con username, contraseña y fecha de nacimiento)
- `/auth/twitch/callback`
- `/legal/:slug` (documentos legales desde markdown en repo, p. ej. `terminos`, `privacidad`, `proteccion`)
- `/legal/dmca` y `/legal/dpo` (formularios que envían a `POST /dmca/takedown` y `POST /dpo/message`)
- `/invite/:token` (unirse por invitación; la home también puede abrir flujo de invitación vía query)
- `/status` (pública: estado de API y dependencias, sin JWT; enlazada desde el pie de página)
- `/` (Home: **landing** pública para visitantes — textos en `landingContent.js` (EN/ES) con foco en Streamer Scheduler + comunidades; si hay sesión, **`Dashboard`** con `AppChrome` + toolbar en cabecera, crear/unir servidores, lista de servidores, onboarding opcional (`WelcomeOnboardingModal`) y bloque Scheduler; **sin** panel de DMs embebido)
- `/messages` (privada: mensajes directos, `Messages` + `DirectMessagesPanel`; `AppChrome` + toolbar en cabecera; admite opcionalmente **`?conversation=<id>`** para abrir una conversación concreta)
- `/server/:serverId` (vista completa de servidor/canal/chat/voz/permisos/miembros; `AppChrome`; toolbar en `ChannelList`; admite **`?channel=<id>`** para abrir un canal concreto tras búsqueda global o notificación)
- `/admin` (DashboardAdmin para diagnostico y monitoreo)

Rutas privadas usan `PrivateRoute` y dependen de `AuthContext` (`/messages` y `/server/:serverId` entre otras). Si hay token guardado pero la API no responde, `PrivateRoute` y `AdminRoute` muestran tarjeta **“Can’t reach the API”** con reintento en lugar de redirigir al login.

Referencias útiles:

- Checklist de despliegue y producción: `docs/PRODUCCION.md`.

## 11) Docker y ejecucion

Mapeo servicio Compose → contenedor (según `docker-compose.yml`):

| Servicio en compose | `container_name` | Puerto host (default) |
|---------------------|------------------|------------------------|
| `postgres` | `akonet-db` | `5432` |
| `backend` | `akonet-backend` | `3000` |
| `redis` | `akonet-redis` | `6379` |
| `minio` | `akonet-minio` | `9000` (API), `9001` (consola) |

Servicio DB:

- imagen `postgres:16-alpine` (servicio `postgres` → contenedor `akonet-db`)
- volumen persistente `akonet_pg`
- sin script de init SQL; el esquema se crea con migraciones desde backend

Servicio backend:

- servicio `backend` → contenedor `akonet-backend`
- build desde `backend/Dockerfile`
- puerto `3000`
- volumen `akonet_uploads` para archivos subidos
- depende de Postgres healthy y de Redis iniciado
- **`env_file: ./backend/.env`:** el contenedor carga variables desde `backend/.env` (p. ej. `DATABASE_URL`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`).
- **`DATABASE_URL` no se define en `environment:` del compose:** así no se pisa la URL del archivo. Debes fijarla en `backend/.env`:
  - Postgres **del mismo** `docker-compose`: `postgresql://postgres:1234@postgres:5432/akonet`
  - **Supabase** u otro host: la cadena de conexión del proveedor (con SSL según documentación).
- Las demás claves bajo `environment:` del servicio `backend` (p. ej. `REDIS_URL`, `JWT_SECRET`, MinIO) **sustituyen** a las del `env_file` si coinciden en nombre.
- Sin `env_file`, Compose no inyecta `backend/.env`; las sustituciones `${VAR}` en el YAML usan el **`.env` de la raíz del repo** (junto a `docker-compose.yml`) o el entorno del shell.

Comandos comunes:

- `docker compose build`
- `docker compose up -d`
- `docker compose up -d --build`
- `docker compose ps`
- `cd backend && npm run migrate`
- Imagen Docker del backend: el `Dockerfile` ejecuta al arrancar `npm run migrate && node src/index.js` (migraciones antes del servidor).

## 12) Variables de entorno (referencia actual)

Los valores de ejemplo siguientes son **ficticios**; no uses estos secretos en producción. La lista canónica de claves comentadas está en `backend/.env.example` y `frontend/.env.example`.

### 12.1 Ejemplo ficticio `backend/.env` (desarrollo local)

```env
PORT=3000
LOG_LEVEL=info
APP_VERSION=1.0.0-dev
JWT_SECRET=super-secreto-falso-no-usar-en-prod-7x9k2m
TOKEN_VERSION=2
DATABASE_URL=postgresql://postgres:fakepass123@localhost:5432/akonet
PGSSL_REJECT_UNAUTHORIZED=true
SKIP_ADMIN_BOOTSTRAP=1
REDIS_URL=redis://localhost:6379
STORAGE_DRIVER=local
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=akonet
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
STORAGE_PUBLIC_BASE_URL=http://localhost:9000/akonet
S3_USE_PRESIGNED_URLS=true
S3_SIGNED_URL_TTL_SECONDS=900
UPLOAD_RATE_LIMIT_MAX=20
AUTH_RATE_LIMIT_MAX=10
SOCKET_MESSAGE_RATE_LIMIT_MAX=40
SOCKET_DM_RATE_LIMIT_MAX=30
REACTION_RATE_LIMIT_MAX=10
EXPORT_MAX_MESSAGES=10000
HIDDEN_SYSTEM_SERVER_NAME=AkoeNet
TWITCH_CLIENT_ID=fake_twitch_client_id_abc123
TWITCH_CLIENT_SECRET=fake_twitch_secret_xyz789
TWITCH_REDIRECT_URI=http://localhost:3000/auth/twitch/callback
FRONTEND_OAUTH_REDIRECT=http://localhost:5173/auth/twitch/callback
SCHEDULER_WEBHOOK_SECRET=fake-webhook-shared-secret
SCHEDULER_ANNOUNCE_CHANNEL_ID=12
SCHEDULER_ANNOUNCER_USER_ID=3
SCHEDULER_API_BASE_URL=https://api.scheduler-example.test
SCHEDULER_UPCOMING_PATH=/api/streamer/{username}/events
SCHEDULER_UPCOMING_URL_TEMPLATE=
SCHEDULER_API_TOKEN=
SCHEDULER_API_EXTRA_HEADER=
SCHEDULER_API_EXTRA_VALUE=
SCHEDULER_DEFAULT_STREAMER_USERNAME=demo_streamer
SCHEDULER_SOCKET_RATE_LIMIT_MAX=15
SCHEDULER_LIST_MAX=5
# Filtro de palabras (ver sección 15.1.2.f y backend/.env.example)
# BLOCKED_WORDS_ENABLED=true
# BLOCKED_WORDS_LANGUAGES=en,es
# BLOCKED_WORDS=
# BLOCKED_WORDS_FILE=
```

Notas rápidas:

- **`DATABASE_URL` en Docker Compose:** si Postgres es el servicio `postgres`, usa host `postgres`, no `localhost`, dentro del contenedor del backend (p. ej. `postgresql://postgres:1234@postgres:5432/akonet`). Con **Supabase / pooler**, suele llevar `?sslmode=require` o `?sslmode=no-verify` según el panel; `PGSSL_REJECT_UNAUTHORIZED=false` solo si el proveedor lo exige (ver `backend/src/config/db.js`).
- **`APP_VERSION`:** opcional; `GET /health/deps` usa `APP_VERSION` o `npm_package_version` en el informe.
- **Scheduler:** `SCHEDULER_API_BASE_URL` debe ser el origen del **API JSON**, no la SPA del dashboard. `SCHEDULER_UPCOMING_PATH` por defecto en código es `/api/streamer/{username}/events` (alineado con Streamer Scheduler). `SCHEDULER_UPCOMING_URL_TEMPLATE` anula la composición base+path si está definida. `SCHEDULER_API_TOKEN` añade `Authorization: Bearer`. `SCHEDULER_API_EXTRA_HEADER` + `SCHEDULER_API_EXTRA_VALUE` permiten un header arbitrario (p. ej. API keys custom).

### 12.2 Ejemplo ficticio `frontend/.env`

```env
VITE_API_URL=http://localhost:3000
VITE_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"}]
# Opcional: fuerza ?username= en el widget del sidebar (override del streamer)
# VITE_SCHEDULER_STREAMER_USERNAME=demo_streamer
```

### 12.3 Docker Compose y `.env` en la raíz del repo

- El servicio `backend` usa `env_file: ./backend/.env`. **`DATABASE_URL` no se define en `environment:`** del compose para no pisar la URL del archivo.
- Variables bajo `environment:` del backend (p. ej. `REDIS_URL`, `JWT_SECRET`, `S3_*`, `TWITCH_REDIRECT_URI`) **sustituyen** homónimas del `env_file` si coinciden.
- Sustituciones `${JWT_SECRET:-...}` en el YAML pueden tomar valor del **`.env` en la raíz del repo** (junto a `docker-compose.yml`) o del entorno del shell.

Ejemplo ficticio **`.env` en la raíz** (solo para Compose, si lo usas):

```env
JWT_SECRET=compose-jwt-falso-abc123
STORAGE_DRIVER=local
```

### 12.4 Inventario por categoría (backend)

| Área | Variables |
|------|-----------|
| Core / HTTP | `PORT`, `LOG_LEVEL`, `APP_VERSION` |
| Auth / JWT | `JWT_SECRET`, `TOKEN_VERSION` |
| CORS | `CORS_ORIGINS` |
| Postgres | `DATABASE_URL`, `PGUSER`, `PGPASSWORD`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGSSLMODE`, `PGSSL_REJECT_UNAUTHORIZED` |
| Admin seed | `SKIP_ADMIN_BOOTSTRAP`, `ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD_HASH` |
| Redis / Socket.IO scale-out | `REDIS_URL` |
| Storage | `STORAGE_DRIVER`, `S3_*`, `STORAGE_PUBLIC_BASE_URL`, `S3_USE_PRESIGNED_URLS`, `S3_SIGNED_URL_TTL_SECONDS` |
| Rate limits | `GLOBAL_RATE_LIMIT_MAX`, `UPLOAD_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, `USER_DATA_RATE_LIMIT_MAX`, `SOCKET_MESSAGE_RATE_LIMIT_MAX`, `SOCKET_DM_RATE_LIMIT_MAX`, `REACTION_RATE_LIMIT_MAX`, `REPORT_RATE_LIMIT_MAX`, `LEGAL_FORMS_RATE_LIMIT_MAX`, `EXPORT_MAX_MESSAGES` |
| HTTPS / proxy | `FORCE_HTTPS`, `TRUST_PROXY` |
| Correo (Resend) | `RESEND_API_KEY`, `RESEND_FROM` (ver `backend/src/lib/resend-mail.js`) |
| DMCA / DPO | `LEGAL_INBOX_EMAIL` (opcional; por defecto `akonet@streamautomator.com`), `DMCA_NOTIFY_EMAIL`, `DPO_EMAIL`, `DPO_NAME`, `DPO_PHONE`, `DPO_ADDRESS`, `ADMIN_NOTIFY_EMAIL` |
| Filtro de lenguaje | `BLOCKED_WORDS_ENABLED`, `BLOCKED_WORDS_LANGUAGES`, `BLOCKED_WORDS`, `BLOCKED_WORDS_FILE` |
| Twitch OAuth | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI`, `FRONTEND_OAUTH_REDIRECT` |
| Servidor oculto | `HIDDEN_SYSTEM_SERVER_NAME` |
| Scheduler | `SCHEDULER_*`, `SCHEDULER_ADMIN_URL` (opcional; usado en informes de health para enlace admin del Scheduler remoto) |
| Supabase SDK (opcional, no usado por el pool pg por defecto) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (comentadas en `.env.example`) |

### 12.5 Usuario administrador (migración `1733000001000`)

- Comportamiento gobernado por variables de entorno (ver `backend/.env.example`):
  - **`SKIP_ADMIN_BOOTSTRAP=1`:** no se ejecuta ningún `INSERT` de admin (recomendado en bases alojadas); crear el primer administrador vía registro + `UPDATE users SET is_admin = true` o variables `ADMIN_BOOTSTRAP_*` en un despliegue controlado.
  - **`ADMIN_BOOTSTRAP_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD_HASH`** (hash bcrypt) y opcionalmente **`ADMIN_BOOTSTRAP_USERNAME`:** se inserta/actualiza ese usuario con `is_admin = true`.
  - **Por defecto** (sin las anteriores): la migración mantiene un usuario de desarrollo documentado en el propio archivo de migración (solo para entornos de confianza; no usar en producción sin cambiar credenciales).

### 12.6 Versionado de token (logout forzado controlado)

- Los JWT ahora incluyen `token_version`.
- El middleware de auth valida que el claim coincida con `TOKEN_VERSION`.
- Si no coincide (o falta en tokens antiguos), responde `401` y el frontend fuerza relogin.
- Esto permite invalidar sesiones antiguas subiendo `TOKEN_VERSION` sin tocar la DB.

## 13) Estado funcional actual (resumen rapido)

- Login/registro y Twitch OAuth: **OK**
- Dashboard con crear/unirse servidor: **OK**
- Ocultar servidor de sistema: **OK**
- Canales con categorias, reordenado, permisos y **canales privados**: **OK**
- Chat realtime por canal + imagenes + enlaces y emojis enriquecidos en UI: **OK**
- Filtro configurable de lenguaje prohibido en mensajes y perfil (`blocked-content`): **OK**
- Voz WebRTC + prueba de microfono + volumen por participante: **OK**
- Settings de voz con prueba, volumen persistente y cámara opcional: **OK**
- Mensajes directos (texto + imagen): **OK**
- Docker Compose para backend + Postgres + Redis + MinIO: **OK**
- Carga de `backend/.env` fija + `DATABASE_URL` respetada en Compose (sin pisar URL): **OK**
- Integración Scheduler (webhook, HTTP upcoming, comandos `!schedule` / `!next`, widget en sidebar, mapeo Twitch → slug vía `scheduler_streamer_username`): **OK** (según variables `SCHEDULER_*`)
- Perfil Twitch (`twitch_username`) y slug Scheduler en ajustes de usuario: **OK**
- Límite opcional de usuarios en canal de voz (`voice_user_limit`): **OK**
- Registro con fecha de nacimiento y validación de edad mínima: **OK** (backend)
- Formularios legales DMCA/DPO (HTTP + persistencia + correo opcional Resend): **OK** (según variables de entorno)
- Página pública de estado `/status` (health/deps): **OK**
- Redirección HTTPS en producción y rate limit global por IP: **OK**
- Moderación de acceso por servidor (ban/unban + bloqueo de join + vista explícita de usuario baneado): **OK**

## 14) Mejoras de madurez implementadas

Se aplicaron mejoras concretas orientadas a estabilidad, seguridad de entrada y operacion:

- **Filtro de lenguaje prohibido** (`lib/blocked-content.js`, `@2toad/profanity` + listas extra por entorno) en mensajes y perfil.
- **Validacion de entrada (backend)** con `zod` en rutas criticas:
  - `auth`: login, `register/start`, `register/pending`, `register/complete`
  - `servers`: crear servidor, join, members/roles por `serverId`
  - `dm`: busqueda, crear conversacion y envio/lectura de mensajes
  - `channels`: creacion/listado/categorias/reordenamiento/permisos (rol y usuario)
  - `messages`: historial por canal con validacion de `limit` y `before`
  - `upload`: validacion de `channelId` y `conversationId` antes de procesar archivo
- **Middleware reutilizable** de validacion:
  - `backend/src/middleware/validate.js`
- **Logging estructurado** con `pino` + `pino-http`:
  - logger central: `backend/src/lib/logger.js`
  - logging HTTP por request
  - redacción de campos sensibles (`authorization`, `password`, `current_password`, `new_password`, `token`, `access_token`)
- **Manejo global de errores**:
  - `notFoundHandler` + `errorHandler` en `backend/src/middleware/error-handler.js`
  - conexion en `backend/src/index.js`
- **Voz con ICE configurable** para preparacion de TURN/STUN:
  - `frontend/src/components/VoiceRoom.jsx` ahora soporta `VITE_ICE_SERVERS` (JSON)
  - fallback automatico a STUN publico si no se define variable

## 15) Bloques implementados (fase siguiente)

### 15.1 Pruebas automatizadas base (backend)

- Stack de testing agregado:
  - `jest`
  - `supertest`
- Scripts:
  - `npm test`
- Tests iniciales:
  - `tests/health.test.js`
  - `tests/auth-validation.test.js`
  - `tests/blocked-content.test.js` (comportamiento del filtro con filtro desactivado / texto vacío)
- Objetivo actual: smoke tests de salud y validacion/auth sin depender de DB de pruebas.

### 15.1.1 Documentación API (OpenAPI)

- Endpoint disponible:
  - `GET /docs/openapi.json`
  - `GET /docs` (Swagger UI sobre el spec OpenAPI)
- Incluye especificación base para endpoints críticos:
  - health
  - historial de mensajes con parámetros (`channelId`, `limit`, `before`)
  - uploads de canal y directos (multipart)
  - `GET /integrations/scheduler/upcoming` (JWT; proxy al calendario del Scheduler)
  - `GET /integrations/scheduler/discovery` (sin JWT; proxy al JSON de integración del Scheduler)
  - `GET /integrations/scheduler/servers` y `GET /integrations/scheduler/servers/:serverId/channels` (header `x-scheduler-webhook-secret`; listados para el selector del Streamer Scheduler)
- Seguridad declarada:
  - bearer JWT (`bearerAuth`) en endpoints protegidos.

### 15.1.2 Rate limiting en autenticación

- Se aplica rate limiting por IP en rutas de autenticación:
  - `POST /auth/register/start`, `POST /auth/register/complete`, `GET /auth/register/pending`
  - `POST /auth/login`
  - `GET /auth/twitch/start`
  - `GET /auth/twitch/callback`
- Configuración por entorno:
  - `AUTH_RATE_LIMIT_MAX` (default `10 req/min`).

### 15.1.2.b Rate limiting en datos de usuario (perfil)

- Se aplica rate limiting por IP en actualización de perfil:
  - `PATCH /auth/me`
- Configuración por entorno:
  - `USER_DATA_RATE_LIMIT_MAX` (default `20 req/min`).

### 15.1.2.c Rate limiting en reportes de contenido

- Se aplica rate limiting por IP en:
  - `POST /messages/:messageId/report`
  - `POST /dm/messages/:dmMessageId/report`
- Configuración por entorno:
  - `REPORT_RATE_LIMIT_MAX` (default `15 req/min`).

### 15.1.2.d Seguridad de secreto JWT en producción

- En `NODE_ENV=production`, el backend exige `JWT_SECRET` seguro:
  - no puede ser el valor por defecto,
  - debe tener longitud mínima de 32 caracteres.
- Si no cumple, el proceso falla al iniciar (fail-fast) para evitar despliegues inseguros.

### 15.1.2.e Sesiones inválidas para cuentas eliminadas

- Middleware `auth` y handshake de Socket.IO validan que el usuario exista y no tenga `deleted_at`.
- Si la cuenta fue eliminada/anonimizada, los tokens previos dejan de ser utilizables.

### 15.1.2.f Filtro de lenguaje prohibido (palabras bloqueadas)

- Implementación: `backend/src/lib/blocked-content.js` con el paquete **`@2toad/profanity`** (listas multilenguaje de código abierto, enfoque habitual en aplicaciones comunitarias; **no** se reproducen listas internas de terceros).
- Por defecto se usan idiomas **`en`** y **`es`** (`BLOCKED_WORDS_LANGUAGES`, separados por comas). El operador puede añadir términos:
  - **`BLOCKED_WORDS`:** lista separada por comas;
  - **`BLOCKED_WORDS_FILE`:** ruta a archivo de una palabra por línea (`#` inicia comentario).
- **`BLOCKED_WORDS_ENABLED`:** `true` por defecto; `false` / `0` / `no` desactiva el filtro (útil en desarrollo).
- Dónde aplica: texto de **`send_message`** y **`send_direct_message`** (Socket), **`POST /dm/conversations/:id/messages`**, **`POST /auth/register/complete`** (username) y **`PATCH /auth/me`** (username, bio, custom_status, scheduler_streamer_username).
- Respuestas: Socket `ack({ error: "blocked_content" })`; HTTP `400` con `error: "blocked_content"` y `message` en inglés estándar del backend.

### 15.1.3 Rate limiting en mensajería realtime (Socket.IO)

- Se aplica rate limiting por usuario en eventos realtime:
  - `send_message` (chat de canal)
  - `send_direct_message` (mensajería directa)
- Respuesta en exceso de límite:
  - `ack({ error: "rate_limited" })`
- Configuración por entorno:
  - `SOCKET_MESSAGE_RATE_LIMIT_MAX` (default `40/min`)
  - `SOCKET_DM_RATE_LIMIT_MAX` (default `30/min`)

### 15.1.4 Rate limiting en reacciones (HTTP)

- Se aplica rate limiting por IP en endpoints de reacciones:
  - `POST /messages/:messageId/reactions`
  - `DELETE /messages/:messageId/reactions`
- Respuesta en exceso de límite:
  - HTTP `429` con error de rate limit.
- Configuración por entorno:
  - `REACTION_RATE_LIMIT_MAX` (default `10 req/min`).

### 15.2 Storage externo S3/MinIO (con fallback local)

- Se implemento servicio de storage unificado:
  - `backend/src/services/storage.js`
- `upload.routes` ahora usa dicho servicio:
  - `POST /upload/channel/:channelId`
  - `POST /upload/direct/:conversationId`
- Soporta:
  - `STORAGE_DRIVER=local` (default)
  - `STORAGE_DRIVER=s3` (compatible con S3 y MinIO)
- Para S3/MinIO:
  - crea/verifica bucket automaticamente al primer upload.
  - por defecto sirve archivos via backend (`/uploads/:key`) y genera URL firmada temporal (presigned) para descarga segura.
  - permite modo URL publica directa si `S3_USE_PRESIGNED_URLS=false`.
  - TTL de URL firmada configurable por `S3_SIGNED_URL_TTL_SECONDS` (60-3600s, default 900).
  - genera URL publica con `STORAGE_PUBLIC_BASE_URL` o por endpoint/bucket cuando no se usan presigned URLs.
  - valida key de archivo para evitar path traversal.
  - restringe uploads a imagenes permitidas (`jpeg`, `png`, `webp`, `gif`, `avif`).
  - aplica rate limiting por IP en uploads (`UPLOAD_RATE_LIMIT_MAX`, default `20 req/min`).

### 15.3 Escalado Socket.IO con Redis adapter

- `backend/src/index.js` ahora soporta adapter Redis opcional:
  - si existe `REDIS_URL`, conecta pub/sub y habilita `@socket.io/redis-adapter`.
  - si no existe, funciona en modo single-node como antes.
- robustez adicional en auth de socket:
  - `socket.userId` se normaliza/valida como entero positivo al decodificar JWT.
- fix de estabilidad en pin realtime:
  - cast explícito de `pinned_by` a `int` en actualización SQL para evitar crash por tipo (`text` vs `integer`) y desconexiones WebSocket.

## 18) Reacciones, export y auditoría

### 18.1 Reacciones a mensajes

- Se agregó tabla `message_reactions` con unicidad por (`message_id`, `user_id`, `reaction_key`).
- El historial de mensajes ahora incluye `reactions` agregadas por mensaje:
  - `key`, `count`, `reacted` (si el usuario actual ya reaccionó).
- UI en chat:
  - botones rápidos (`👍`, `❤️`, `🔥`, `😂`) y soporte de emojis personalizados como reacción.
  - toggle de reacción (click de nuevo para quitar).
  - sincronización realtime con Socket.IO.
  - Acciones de moderación (borrar / pin / abrir reacciones) como **iconos** bajo la fila de reacciones (ver sección 6).

### 18.2 Exportar historial de canal

- Nuevo endpoint: `GET /messages/channel/:channelId/export`.
- Formatos:
  - `format=json` (default)
  - `format=csv`
- Incluye mensajes con metadata relevante (autor, contenido, imagen, pin) y reacciones serializadas.
- Límite de seguridad para exportaciones grandes:
  - máximo configurable por `EXPORT_MAX_MESSAGES` (default `10000`),
  - si se supera responde `413`.
- Frontend incluye acciones rápidas en cabecera del chat:
  - `Export JSON`
  - `Export CSV`

### 18.3 Auditoría de moderación

- Se agregó tabla `admin_audit_logs` para registrar acciones administrativas sobre mensajes.
- Acciones auditadas:
  - `message_pin`
  - `message_unpin`
  - `message_delete_moderation` (cuando borra un moderador/admin y no el autor)
- Campos principales: actor, acción, mensaje objetivo, canal, servidor, metadata y timestamp.
- El logging de auditoría es no bloqueante (si falla, no rompe la operación del usuario).
- Endpoint admin para consultar auditoría:
  - `GET /admin/audit-logs?limit=&offset=&server_id=&action=&from=&to=`
  - protegido con `auth + requireAdmin`.
  - respuesta paginada: `items`, `total`, `limit`, `offset`.

### 15.4 Docker actualizado para soporte de estos bloques

- `docker-compose.yml` incluye, además de `postgres` (`akonet-db`) y `backend` (`akonet-backend`):
  - servicio `redis` → contenedor `akonet-redis`
  - servicio `minio` → contenedor `akonet-minio`
- Backend recibe variables de storage + redis por entorno (`env_file` + `environment`); `DATABASE_URL` debe definirse en `backend/.env` (ver sección 11).
- Permite correr modo local o modo S3/MinIO sin tocar codigo; la misma imagen puede apuntar a Postgres gestionado si `DATABASE_URL` en `backend/.env` apunta al proveedor.

## 16) Diagnostico operativo implementado

### 16.1 Backend

- Endpoint de dependencias:
  - `GET /health/deps`
  - `GET /admin/health/deps` (protegido, solo admin)
- Reporta estado de:
  - API (`ok` base)
  - DB (consulta `SELECT 1`)
  - Redis (ping si esta configurado con `REDIS_URL`)
  - Storage (driver local/s3 y disponibilidad)
- Metricas operativas incluidas:
  - `version` (app version)
  - `uptime_ms` (tiempo vivo del proceso)
  - `checked_at` (timestamp del chequeo)
  - `total_latency_ms` (duracion total del chequeo)
  - `latency_ms` por dependencia (`api`, `db`, `redis`, `storage`)
- Si alguna dependencia critica falla, responde `503`.

### 16.2 Frontend

- Nuevo Dashboard de administracion:
  - `/admin`
- Muestra estado visual (`OK` / `ERROR` / `NO CONFIG`) para:
  - API
  - Base de datos
  - Redis
  - Storage
- Muestra metricas en pantalla:
  - version
  - uptime
  - tiempo total de chequeo
  - latencia por dependencia
- Incluye boton para refrescar diagnostico y acceso desde Dashboard (`Dashboard Admin`) para usuarios admin.
- Incluye botón `API Docs` en Dashboard Admin para abrir Swagger UI del backend (`{VITE_API_URL}/docs`) en nueva pestaña.
- Incluye historial local de ultimos checks (hora, estado y latencia total).
- Incluye visualización de logs recientes de moderación (`/admin/audit-logs`).
- Incluye filtros de auditoría en UI (acción, server ID, rango de fechas) y paginación (previous/next).
- Incluye panel de **Message reports moderation** (reportes de usuarios sobre mensajes de canal **y** DM):
  - listado y filtros por estado (`open`, `resolved`, `rejected`),
  - cada fila indica **Channel** o **DM**; el contenido del mensaje se resuelve con `JOIN` a `messages` o `direct_messages` según la acción de auditoría,
  - acciones de moderación (resolve/reject/reopen),
  - backend: `GET /admin/reports/messages` y `PATCH /admin/reports/messages/:auditId` (incluyen acciones `message_report_user` y `dm_message_report_user`),
  - al actualizar estado de un reporte, el backend emite `in_app_notification` al reportante (`type: report_status`) para cerrar el ciclo de feedback.

## 17) Invitaciones por link

- **Crear, listar y revocar invitaciones:** desde la vista de servidor, botón **Server settings** (engranaje) → modal con **pestañas** (mismo layout que User settings): **Invites**, **Emojis**, **Commands**, **Events**, **Announcements**; la pestaña **Invites** concentra creación, enlace generado e invitaciones activas (misma lógica que antes evitaba duplicar el formulario en el Dashboard).
- **Dashboard:** permite **unirse** con link o token pegado (y crear/unirse por ID de servidor); no duplica el gestor de invitaciones.
- Modos de invitación:
  - **Temporal:** dura 1 semana.
  - **Definitivo:** sin expiración.
- Opción adicional de seguridad:
  - **1 solo uso** para invitaciones temporales.
- UX de creación:
  - el toggle muestra **"Uso único activo"** cuando está habilitado en modo temporal.
- En UI se muestra por invitación:
  - fecha de expiración (o definitivo),
  - usos restantes (o ilimitado).
- El listado de invitaciones muestra solo links activos y no vencidos.
- Backend valida:
  - token existente y activo,
  - expiración y límite de usos,
  - bloqueo de servidor sistema,
  - membresía duplicada.
- Endpoints adicionales:
  - `GET /servers/:serverId/invites` (listar invitaciones de servidor)
  - `DELETE /servers/:serverId/invites/:inviteId` (revocar invitación)

## 19) Documentacion y legal

Base documental y legal:

- `README.md` (raiz): portada del repositorio con enlaces a `docs/`.
- `docs/README.en.md`: guia operativa en ingles.
- `docs/README.es.md`: guia operativa en espanol.
- `LICENSE` (raiz): licencia propietaria (all rights reserved).
- `docs/legal/TERMINOS_Y_CONDICIONES.md`: marco de uso de la plataforma.
- `docs/legal/PRIVACIDAD.md`: politica de privacidad base.
- `docs/legal/PROTECCION_LEGAL.md`: checklist y lineamientos para proteccion legal del software.

Notas:

- Los documentos legales incluyen placeholders de contacto para facilitar personalizacion final.
- Antes de publicar en produccion, se recomienda validacion juridica en la jurisdiccion objetivo.

## 20) Sexta actualizacion - madurez empresarial (evolucion final)

Esta fase consolida a AkoeNet como plataforma de comunicacion de nivel produccion, con paridad funcional tipo Discord en features core y mejoras de operacion, documentacion y cumplimiento legal.

Resumen de evolucion:

- **Core de producto:** de chat basico a plataforma completa (servidores, canales, DMs, voz, camara, permisos).
- **Perfil de usuario:** personalizacion estilo Discord (avatar, banner, color, bio, presencia, estado personalizado, password change seguro).
- **Voz:** WebRTC con constraints de calidad, toggle de camara en caliente y UI por tiles.
- **Moderacion y control:** pins, borrado moderado, auditoria admin y dashboard de operacion.
- **Seguridad operativa:** rate limiting por capas (auth, upload, chat, DM, reactions), token versioning y validacion con Zod.
- **Documentacion:** OpenAPI + READMEs bilingues + documentos legales base.

## 21) Analisis por componente (estado actual)

### 21.1 Perfil de usuario

- Campos y personalizacion:
  - username, avatar URL, banner URL, color de acento, bio.
  - presencia (`online`, `idle`, `dnd`, `invisible`) y estado personalizado.
  - cambio de contraseña con validacion de contraseña actual.
- Valor:
  - mejora de identidad del usuario y retencion.

### 21.2 Voz y camara

- Capacidades:
  - mute/unmute, test de microfono, medidor local.
  - volumen por participante remoto.
  - camara opcional en settings y toggle durante llamada.
  - preview local y render remoto por participante.
  - layout de sala tipo Discord (tiles + barra de controles).
- Calidad:
  - constraints centralizadas en `frontend/src/lib/voiceConstraints.js`.
  - `echoCancellation`, `noiseSuppression`, `autoGainControl`, mono y 48kHz ideal.

### 21.3 Reacciones, export y auditoria

- Reacciones completas con limite por IP en endpoints HTTP.
- Export de historial con limite de seguridad (`EXPORT_MAX_MESSAGES`) para evitar abuso.
- Filtro automático de lenguaje prohibido en mensajes y perfil (`lib/blocked-content.js`, configurable por entorno).
- Auditoria admin:
  - endpoint `GET /admin/audit-logs` con filtros y paginacion.
  - vista en `/admin` con consulta de logs y filtros.
  - reportes de contenido de mensajes de canal (`POST /messages/:messageId/report`) y de DM (`POST /dm/messages/:dmMessageId/report`) almacenados en `admin_audit_logs` con estado de revisión por moderación.

### 21.4 Documentacion y legal

- Producto/documentacion: `README.md` (raiz), `docs/README.en.md`, `docs/README.es.md`.
- API: `/docs` y `/docs/openapi.json`.
- Legal base: `LICENSE` (raiz), `docs/legal/TERMINOS_Y_CONDICIONES.md`, `docs/legal/PRIVACIDAD.md`, `docs/legal/PROTECCION_LEGAL.md`.
- Footer público (`SiteFooter`) muestra disclaimer: **"AkoeNet es software independiente y no está afiliado a Discord Inc."**

## 22) Recomendaciones de mejora (roadmap ejecutable)

### 22.1 Prioridad critica (antes de produccion publica)

1. **HTTPS/WSS obligatorio**
   - agregar reverse proxy (Nginx/Caddy) con TLS y redireccion HTTP->HTTPS.
2. **Backups automatizados**
   - backup diario de PostgreSQL + estrategia de backup para uploads/storage.
3. **Rate limiting global por IP**
   - **Implementado** (`globalIpRateLimiter` + `GLOBAL_RATE_LIMIT_MAX`); revisar umbral bajo carga real y ajustar por entorno.
4. **Validacion de archivos por magic bytes**
   - **Implementado** en `upload.routes.js` (`file-type` + lista MIME permitida); no confiar solo en el MIME del cliente sigue siendo la regla operativa.
5. **Revision legal final**
   - abogado local para validar terminos y privacidad.

### 22.2 Prioridad alta (impacto directo en UX)

1. **Busqueda de mensajes** — **Implementado** (PostgreSQL FTS + UI global; motor dedicado solo si escala mucho).
2. **Menciones y notificaciones** — **Implementado** (`@usuario`, `@here` a conectados en canal, `@everyone`; reglas en `lib/mentions.js`).
3. **Edicion de mensajes** — **Implementado** (marca `edited_at` / “editado”).
4. **Indicador "escribiendo..."** — **Implementado** (canales y DM).
5. **Markdown seguro** para mensajes — **Implementado** (inline: negrita, cursiva, tachado, código, enlaces; canal y DM; sanitizado con DOMPurify).

### 22.3 Prioridad media

1. **Notificaciones push web** para usuarios offline — **Implementado** (VAPID + `push_subscriptions` + `frontend/public/sw.js`).
2. **Compartir pantalla** en voz — **Implementado** (`VoiceRoom` + `getDisplayMedia`).
3. **Roles personalizados granulares** por servidor — **Pendiente** (hay roles base; granularidad avanzada no).
4. **Previews de enlaces** — **Implementado** (`GET /link-preview` + tarjeta bajo mensajes; caché en memoria en servidor).
5. **Drag & drop** de archivos en chat — **Implementado** (canal y DM).

### 22.4 Prioridad baja / largo plazo

1. **Metricas Prometheus/OpenTelemetry** + dashboard Grafana.
2. **Webhooks y API para bots** por servidor.
3. **Sistema de amistades y bloqueos** — **Implementado** (rutas `/social/friends` y `/social/blocks`).
4. **i18n completo de UI** (es/en) — **Implementado base** (`i18next` en login y textos principales; expansión continua por pantallas).
5. **Evaluar LiveKit** si crece complejidad operativa de WebRTC nativo.

### 22.5 Riesgos legales/compliance (no relacionados con Discord)

#### Estado actual resumido

1. **GDPR / Proteccion de datos (UE)**
   - Consentimiento cookies/local storage: **Parcial** (banner implementado para consentimiento técnico básico; posición superior en viewport para visibilidad).
   - Derecho al olvido: **Parcial** — `DELETE /auth/me` documentado en flujo de producto; canal DPO **`GET /dpo/contact`** + **`POST /dpo/message`** para solicitudes formales.
   - Portabilidad: **Parcial** — `GET /auth/me/export` disponible; formulario DPO para solicitudes adicionales.
   - Aviso legal en registro: **Implementado** (checkbox explícito + enlaces legales).
   - DPO/representante UE: **Pendiente** (depende de escala y obligación legal por operación).

2. **DSA / COSMET (UE)**
   - Reporte de contenido ilegal: **Parcial** (botón `Report` en mensajes de canal y DM + endpoints y panel de moderación admin).
   - Moderación transparente/reportes públicos: **Parcial** (hay trazabilidad y estado de reportes; falta publicación de reportes agregados periódicos).

3. **COPPA / Edad de usuarios**
   - Control de edad en registro: **Parcial** — `birth_date` obligatorio en `POST /auth/register/complete` con regla de edad mínima (13 años) en backend; el email se confirma antes de completar el alta; revisión adicional (verificación fuerte) sigue siendo decisión de producto.
   - Política de menores: **Documentada** en `PRIVACIDAD.md` y términos.

4. **Contenido generado por usuarios**
   - Moderación operativa (borrar/pinear/restricción): **Implementado**.
   - Botón/flujo de denuncia en UI: **Implementado** para mensajes de canal y DM.
   - Filtro automático de términos (listas configurables + paquete multilenguaje): **Parcial** (reduce lenguaje ofensivo común; no garantiza ausencia de contenido ilícito ni sustituye revisión humana).
   - Proceso DMCA formal: **Parcial** — formulario público `POST /dmca/takedown` + almacenamiento en `dmca_takedowns` + notificación por correo si Resend está configurado; retirada de contenido y columnas `dmca_removed_at` preparan trazabilidad operativa.

#### Mitigación recomendada por fases

- **Inmediato (pre-lanzamiento público)**
  - mantener disclaimer de no afiliación visible en footer y legal,
  - completar diferenciación visual propia (color/tipo/espaciado),
  - publicar canal operativo de reportes de contenido (aunque sea formulario inicial + email trazable).

- **Corto plazo (1-3 meses)**
  - endpoint de exportación de datos personales por usuario,
  - endpoint/proceso de borrado de cuenta y datos vinculados (con retenciones legales),
  - flujo de reporte en mensajes (UI + backend + trazabilidad de moderación),
  - fecha de nacimiento y regla de edad mínima en registro.

- **Largo plazo (6-12 meses)**
  - asesoría legal especializada y revisión de políticas por jurisdicción,
  - designación DPO/representante UE si corresponde,
  - registro de marca AkoeNet (EUIPO/USPTO según mercado objetivo),
  - publicación periódica de reportes agregados de moderación/transparencia.

## 23) Criterio de salida a produccion

Checklist minimo recomendado:

- TLS activo (`https` y `wss`).
- backup restore probado (no solo backup creado).
- limites globales y especificos validados bajo carga.
- monitorizacion basica (health + logs + alertas).
- revision legal final de documentos.
- smoke test E2E sobre login, chat, DM, voz y admin dashboard.

Estado objetivo: **Production-ready** con staging validado y plan de observabilidad/recuperacion en marcha.

## 24) Integración con Streamer Scheduler (base implementada)

Objetivo: unificar comunidad (AkoeNet) + planificación de contenido (Scheduler) en un flujo único.

### 24.1 Webhook de anuncios de stream hacia AkoeNet

- Endpoint backend:
  - `POST /integrations/scheduler/webhooks/stream-scheduled`
- Seguridad:
  - header obligatorio `x-scheduler-webhook-secret`
  - validado contra `SCHEDULER_WEBHOOK_SECRET`
- Payload esperado:
  - `streamer`, `title`, `starts_at` (ISO), `url`, `platform`
  - `channel_id` opcional (si no viene, usa `SCHEDULER_ANNOUNCE_CHANNEL_ID`)
- Comportamiento:
  - crea mensaje automático en el canal objetivo usando `SCHEDULER_ANNOUNCER_USER_ID`
  - emite `receive_message` al canal y `echonet_notification` al servidor por Socket.IO
- Implementación: reutiliza `broadcastChannelMessage` (`lib/channel-message-broadcast.js`); requiere que el proceso tenga Socket.IO inicializado (`app.locals.io` en `src/index.js`).

### 24.2 Variables de entorno de integración

- `SCHEDULER_WEBHOOK_SECRET`: secreto compartido (header `x-scheduler-webhook-secret`).
- `SCHEDULER_ANNOUNCE_CHANNEL_ID`: canal por defecto para anuncios si el webhook no manda `channel_id`.
- `SCHEDULER_ANNOUNCER_USER_ID`: usuario interno que firma el mensaje de anuncio.
- `SCHEDULER_API_BASE_URL`: origen del **API JSON** del Scheduler (sin la SPA del dashboard).
- `SCHEDULER_UPCOMING_PATH`: ruta con `{username}` (default en código: `/api/streamer/{username}/events`).
- `SCHEDULER_UPCOMING_URL_TEMPLATE` (opcional): URL completa con `{username}`; si está definida, sustituye a base+path.
- `SCHEDULER_API_TOKEN` (opcional): envía `Authorization: Bearer …` en las peticiones salientes.
- `SCHEDULER_API_EXTRA_HEADER` + `SCHEDULER_API_EXTRA_VALUE` (opcionales): header HTTP adicional (p. ej. claves propietarias).
- `SCHEDULER_DEFAULT_STREAMER_USERNAME` (opcional): slug por defecto si el usuario autenticado no tiene Twitch ni `?username=`.
- `SCHEDULER_SOCKET_RATE_LIMIT_MAX` (opcional): límite por minuto de `!schedule` / `!next` por usuario (Socket).
- `SCHEDULER_LIST_MAX` (opcional): máximo de líneas en la lista de `!schedule` (default `5`).

### 24.3 Consulta HTTP de calendario (autenticada)

- `GET /integrations/scheduler/upcoming?username=&mode=all|next` (**JWT obligatorio**).
- **Resolución del identificador solicitado** (en orden):
  1. Query `username` si viene y no está vacío.
  2. Si no: `twitch_username` del usuario autenticado en BD.
  3. Si no: `SCHEDULER_DEFAULT_STREAMER_USERNAME`.
  4. Si sigue vacío: **400** `{ code: "MISSING_STREAMER_USERNAME" }`.
- **Slug en el API del Scheduler:** el valor resuelto arriba se pasa por `resolveSchedulerStreamerSlug(pool, …)`:
  - Si existe un usuario con ese `twitch_username` (case-insensitive) y `scheduler_streamer_username` no vacío, se usa el slug del perfil.
  - Si no hay mapeo, se usa el mismo string (sirve para slugs directos o para `SCHEDULER_DEFAULT_STREAMER_USERNAME`).
- **Respuesta 200:** `ok`, `username` (el solicitado), `scheduler_slug` (tras mapeo), `mode`, `events`, `formatted`.
- **Errores proxy:** **503** si falta `SCHEDULER_API_BASE_URL`; **502** con cuerpo `{ error, httpStatus?, contentType? }` para fallos HTTP del Scheduler, red, timeout, o **`scheduler_api_invalid_response`** si la URL devuelve HTML en lugar de JSON.
- El widget del frontend puede enviar `?username=` solo si existe `VITE_SCHEDULER_STREAMER_USERNAME` (override); si no, el backend resuelve solo con sesión y env.

### 24.4 Comandos de chat (!schedule / !next)

- En canales de texto, mensajes `!schedule` y `!next` (sin imagen adjunta) disparan una segunda respuesta con el calendario.
- `!schedule [usuario]`: lista los próximos streams (hasta 5 por defecto, configurable con `SCHEDULER_LIST_MAX`).
- `!next [usuario]`: solo el siguiente stream.
- Si no se indica usuario, se usa `SCHEDULER_DEFAULT_STREAMER_USERNAME`.
- La respuesta se publica con `SCHEDULER_ANNOUNCER_USER_ID` si está configurado; si no, como mensaje del mismo usuario con prefijo `📅 [Scheduler]`.
- Rate limit dedicado: `SCHEDULER_SOCKET_RATE_LIMIT_MAX` (separado del límite general de mensajes).

### 24.5 Discovery, health y despliegue cruzado

- **`GET /integrations/scheduler/discovery`** (sin JWT): proxifica el JSON de integración del Scheduler (`GET {SCHEDULER_API_BASE_URL}/api/integration/akoenet`) para comprobar URL y versión.
- **`GET /health/deps`** y **`GET /admin/health/deps`** incluyen **`deps.scheduler`**: configurado, latencia, `ok`, versión/servicio, modo **legacy** y `hint` si el discovery falla pero responde un health mínimo del API remoto.
- AkoeNet y el Scheduler pueden estar en **hosts distintos** (p. ej. local + Render): basta con que `SCHEDULER_API_BASE_URL` apunte al **API JSON** correcto. Si **`/api/integration/akoenet`** devuelve **404**, suele ser un API antiguo sin esa ruta; el calendario puede seguir funcionando vía `/api/streamer/{username}/events` (el backend marca **reachable (legacy)** probando `/api/health/live` cuando aplica).
- Contrato detallado en el monorepo **streamer-scheduler**: `docs/AKOENET_CONTRACT.md`, `docs/AKOENET_SCHEDULER_INTEGRATION.md`.

### 24.6 Listados en AkoeNet para el Streamer Scheduler (secreto compartido)

- **`GET /integrations/scheduler/servers`** (header obligatorio **`x-scheduler-webhook-secret`**, mismo valor que el webhook de anuncios): respuesta JSON `{ "servers": [ { "id": "<string>", "name": "…" } ] }`; excluye servidores con `is_system`.
- **`GET /integrations/scheduler/servers/:serverId/channels`**: `{ "channels": [ { "id": "<string>", "name": "…" } ] }` solo canales **`type = text`**, orden por `position`.
- **401** si el secreto falta o no coincide; **404** en canales si el servidor no existe o es de sistema.
- El panel del Scheduler puede usar estas rutas para rellenar desplegables (análogo a guilds/canales en Discord); si no están disponibles, el flujo sigue con ID de canal manual.

### 24.7 Diferenciación frente a Discord (con integración)

- Discord requiere bots/plugins externos para anuncios de calendario.
- AkoeNet integrado con Scheduler permite anuncios nativos y auditables desde backend propio.
- Al combinar chat+voz+moderación+auditoría+agenda en self-hosted, la propuesta se vuelve:
  - **"Comunidad y planificación en una sola plataforma, con control total de datos."**

## 25) Visión producto (CTO) y qué está implementado vs. roadmap

Resumen del enfoque: el diferencial del producto encaja en **comunidad + tiempo real + integración Scheduler + control de datos**; el riesgo típico es acumular backend sin subir **engagement** (UX, activación, búsqueda, hilos). Lo siguiente contrasta prioridades estratégicas con el estado en código **a fecha de documento**.

### 25.1 Ya cubierto en el producto actual (base sólida)

- Arquitectura React + Node + Socket + Postgres, permisos estilo Discord, Redis adapter opcional.
- Moderación, auditoría, export, filtro de lenguaje, rate limits.
- Integración Scheduler (HTTP + comandos `!schedule` / `!next` + widget).

### 25.2 Implementaciones orientadas a UX y operación (incrementales)

- **UI optimista en chat de canal y DM:** el mensaje de texto aparece al enviar; si el servidor rechaza (`rate_limited`, `blocked_content`, `save_failed`) se revierte y se restaura el texto. Los mensajes optimistas llevan `message-row--optimistic` y no permiten pin/reacciones/report hasta confirmar.
- **Reconexión Socket (`reconnect`):** se vuelve a cargar el historial del canal o de la conversación DM para reducimiento de huecos tras cortes de red.
- **Indicador de escritura:** `channel_typing` en canales de texto (throttle ~2s) y `direct_typing` en DM (throttle 2s); líneas *"… is writing…"* en el chat y en el header de DM.
- **Búsqueda de mensajes (PostgreSQL FTS):** por canal (`GET /messages/channel/:id/search`), por conversación DM (`GET /dm/conversations/:id/messages/search`), y **global** en todos los canales legibles (`GET /messages/search/global`), con UI (`GlobalSearchModal` vía `AppChrome`, apertura desde `AppChromeToolbar` y atajo Ctrl+K / ⌘+K).
- **Edición y respuestas mínimas:** `edited_at` + `reply_to_id` en `messages` y `direct_messages`; edición por HTTP/Socket; respuesta con preview en UI; badge `(edited)`.
- **Menciones y notificaciones in-app:** `@usuario`, `@here` (usuarios en la sala Socket `channel:{id}` — “en el canal” en ese momento) y `@everyone` (`@here` / `@everyone` solo si el emisor puede gestionar canales); evento Socket `in_app_notification` → salas `user:<id>`; campana `NotificationBell` (en `AppChromeToolbar` en cabecera) y deep links (`?channel=`).
- **Onboarding y diferenciación:** modal de bienvenida (`WelcomeOnboardingModal` + `localStorage`), bloque Scheduler en dashboard, landing con copy orientado a Scheduler (`landingContent.js`), **nuevo servidor** con canal `📅 upcoming streams` y mensaje de bienvenida en `#general`.
- **Historial en el compositor:** al escribir, localización visual de mensajes anteriores que empiezan por el texto tecleado (canal y DM; ver bullets en §6 y §8 UI).
- **Checklist de producción:** `docs/PRODUCCION.md` (HTTPS, backups, CDN, TURN, escala de búsqueda).
- **Métricas en proceso (observabilidad mínima):** contadores en memoria (`lib/runtime-metrics.js`) por mensajes de canal (vía `message.created` → `recordChannelMessage`) y DM (`recordDmMessage` tras envío OK). **`GET /admin/metrics`** (JWT admin) expone totales y ventana ~60s; el **Dashboard Admin** muestra un bloque opcional si la petición responde 200.

*Sigue fuera de alcance o pendiente:* microservicios, event sourcing persistente, motor de búsqueda dedicado (p. ej. Elastic) a escala cuando PG+fallback deje de ser suficiente, onboarding guiado paso a paso (más allá del modal actual), roles/permisos granulares avanzados por servidor.

*Recientemente añadido en código:* Markdown inline seguro en mensajes (canal y DM), vista previa de enlaces vía `GET /link-preview` (fetch servidor con mitigación SSRF), **refresh tokens** (`POST /auth/refresh`, `POST /auth/logout` con revocación), **2FA TOTP** (`/auth/login/2fa`, `/auth/2fa/setup`, `/auth/2fa/enable`, `/auth/2fa/disable`), **notificaciones push web** (VAPID + `push_subscriptions`), **threads base** (`thread_root_message_id`), **social** (`/social/friends`, `/social/blocks`; UI desde lista de miembros en servidor), **registro con verificación de email** (`registration_tokens` + Resend), **DM rápido** desde miembros (`/messages?conversation=`), **i18n base** en frontend y métricas **Prometheus** opcionales en `GET /metrics` si `PROMETHEUS_METRICS_ENABLED=1`.

### 25.3 Próximos pasos recomendados (alineados al análisis)

1. **Producto:** hilos / conversaciones agrupadas nativas (siguiente salto de retención tras reply mínimo); mejoras de notificaciones (push, preferencias, digest).
2. **Diferencial Scheduler:** recordatorios automáticos; estado “en vivo” si hay API de stream; más widgets en dashboard.
3. **Seguridad de sesión:** refresh tokens y revocación global cuando el producto tenga tracción.
4. **Infra:** métricas Prometheus + tableros cuando el despliegue lo justifique; TURN y CDN según `docs/PRODUCCION.md`; los contadores actuales son un puente ligero.