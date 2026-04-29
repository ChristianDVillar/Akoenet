# AkoeNet - Estructura técnica (pública y sanitizada)

Documento técnico para compartir fuera del equipo sin exponer detalles operativos internos.

## Alcance de esta versión

- Incluye: arquitectura general, componentes, flujos funcionales, prácticas recomendadas de release.
- Excluye: rutas administrativas, detalles de operación interna, secretos, valores de entorno sensibles y procedimientos de respuesta a incidentes.

## Stack de alto nivel

- **Frontend web:** React + Vite.
- **Desktop:** Tauri v2.
- **Backend:** Node.js + Express.
- **Base de datos:** PostgreSQL.
- **Cache/colas ligeras:** Redis.
- **Tiempo real:** Socket.IO.

## Componentes del repositorio

- `frontend/`:
  - Cliente web.
  - Configuración y empaquetado desktop con Tauri.
  - Scripts de build/release para instaladores.
- `backend/`:
  - API de negocio.
  - Autenticación/sesión.
  - Lógica de chat y mensajería.
  - Integraciones externas (sin detalle de credenciales en documentación pública).
- `docs/legal/`:
  - Documentos legales consumidos por el frontend.

## Capacidades funcionales (resumen)

- Autenticación local y OAuth.
- Sesión persistente con renovación controlada.
- Chat en tiempo real (servidores/canales y mensajes directos).
- Moderación básica y trazabilidad funcional.
- Integración desktop con instalador firmado/actualizable según pipeline del proyecto.

## Flujo recomendado de versiones (desktop)

Mantener consistente la versión en:

- `frontend/package.json`
- `frontend/src-tauri/tauri.conf.json`
- `frontend/src-tauri/Cargo.toml`

Validar antes de etiquetar release:

- PowerShell: `$env:TAG='vX.Y.Z'; node scripts/verify-tauri-release-version.mjs`
- Bash: `TAG=vX.Y.Z node scripts/verify-tauri-release-version.mjs`

## Política de seguridad documental

- No publicar secretos, tokens o credenciales reales.
- No documentar rutas de operación interna ni procesos de administración sensible.
- Mantener los runbooks internos fuera de la documentación pública.
- Usar siempre placeholders (`<...>`) en ejemplos de configuración.

## Referencias

- Guía pública breve: `docs/GUIA_PUBLICA.md`
- Frontend y desktop release: `frontend/README.md`
- Índice de documentación: `docs/README.md`
