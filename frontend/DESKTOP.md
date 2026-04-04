# AkoeNet — aplicación desktop (Tauri) y auto-actualizaciones

Este documento resume las mejoras ya integradas en el proyecto y los pasos que faltan para que la distribución desktop con **actualizaciones automáticas firmadas** quede lista en producción.

---

## Mejoras ya implementadas

### Seguridad y ventana

- **CSP** en `src-tauri/tauri.conf.json` siguiendo el modelo de [Tauri 2](https://v2.tauri.app/security/csp/): `default-src` con `customprotocol` / `asset:`, `connect-src` con IPC, `https` / `wss`, localhost para desarrollo, y hosts de **Twitch** (`id.twitch.tv`, `api.twitch.tv`).
- Ventana principal: título **AkoeNet**, 1280×800, redimensionable, **con decoraciones** (barra de título nativa).

### Plugins Tauri (Rust + npm)

| Área | Paquetes / plugin |
|------|-------------------|
| **Actualizaciones** | `tauri-plugin-updater`, `@tauri-apps/plugin-updater` |
| **Reinicio tras actualizar** | `tauri-plugin-process`, `@tauri-apps/plugin-process` |
| **Notificaciones nativas** | `tauri-plugin-notification`, `@tauri-apps/plugin-notification` |
| **Logs** | `tauri-plugin-log`, `@tauri-apps/plugin-log` |

Registro en `src-tauri/src/lib.rs`. Permisos en `src-tauri/capabilities/desktop.json`: `updater:default`, `notification:default`, `log:default`.

### Bundle y firma de artefactos

- `bundle.createUpdaterArtifacts: true` para generar **firmas** (`.sig`) junto a los instaladores al hacer `tauri:build`.
- Configuración del **updater** (`plugins.updater`): clave pública (`pubkey`), lista de `endpoints`, en Windows `installMode: passive`.

### Frontend

- `src/lib/isTauri.js`: detecta si la UI corre dentro del webview de Tauri.
- `src/lib/desktopUpdates.js`: en **producción** y solo en desktop, al arranque ejecuta `check()` del updater; si hay versión nueva, `downloadAndInstall()` y `relaunch()`. En **desarrollo** (`import.meta.env.DEV`) no se consulta el servidor de actualizaciones.
- `src/main.jsx`: en dev, `attachConsole()` del plugin log para ver trazas Rust en las DevTools.
- **Login / Twitch** (`src/pages/Login.jsx`): texto aclarando que en desktop el redirect de OAuth sigue siendo la **URL del API** (`getApiBaseUrl()` + `/auth/twitch/callback`), no `localhost:5173` ni esquemas `tauri://`.

### Otras notas técnicas

- Dependencia `serde_json` en `src-tauri/Cargo.toml` necesaria para el contexto de compilación con la configuración actual del updater.

---

## Pasos pendientes para cerrar el ciclo en producción

Marca cada ítem cuando lo completes.

### 1. Claves de firma y seguridad

- [ ] Tener un par de claves Tauri (minisign): **privada** solo en entorno seguro o CI (secret), **pública** en `tauri.conf.json` → `plugins.updater.pubkey`.
- [ ] Si cambias de clave, actualiza `pubkey` en el repo y publica **solo** builds firmados con la clave privada correspondiente.
- [ ] En cada build de release, exportar antes de compilar, por ejemplo:
  - `TAURI_SIGNING_PRIVATE_KEY_PATH` apuntando al archivo `.key`, o
  - `TAURI_SIGNING_PRIVATE_KEY` con el contenido del secret (p. ej. GitHub Actions).
- [ ] Documentar en tu equipo **dónde** está respaldada la clave privada (sin subirla al repositorio).

Referencia: [Signer y actualizaciones](https://v2.tauri.app/plugin/updater/#signing-updates).

### 2. Endpoint de actualizaciones

- [ ] El `endpoints` en `tauri.conf.json` apunta a un JSON accesible por HTTPS (ah mismo apunta a GitHub Releases: `…/releases/latest/download/latest.json`).
- [ ] Si el repo o el nombre del archivo cambian, **actualiza** esa URL o añade URLs alternativas en el array `endpoints` (se prueba la siguiente si la primera no devuelve 2xx).

### 3. Archivo `latest.json` en cada release

En cada versión que quieras distribuir vía updater:

- [ ] Sube a la release (o a tu CDN) un **`latest.json`** con el formato que exige Tauri: `version`, `platforms` por `OS-ARCH` con `url` y `signature` (contenido **textual** del `.sig`, no solo una ruta).
- [ ] Las URLs de `url` deben ser descargas **directas** (p. ej. assets de GitHub Release) y el archivo debe estar firmado con la clave privada que corresponde a `pubkey`.

Formato: [Updater — JSON estático](https://v2.tauri.app/plugin/updater/#static-json-file).

### 4. Versionado alineado

Para cada release desktop:

- [ ] Misma versión semver en:
  - `frontend/package.json`
  - `frontend/src-tauri/tauri.conf.json` (`version`)
  - `frontend/src-tauri/Cargo.toml` (`version`)
- [ ] Tag de Git coherente (p. ej. `v0.3.1`) si usas releases en GitHub.

### 5. Build de producción

- [ ] `cd frontend` → `npm run build` → `npm run tauri:build` con variables de firma configuradas.
- [ ] Recoger instaladores (`.msi`, `.exe`, `.AppImage`, etc.) **y** los `.sig` generados.
- [ ] Publicar instaladores + `latest.json` en la release (o tu bucket/backend).

### 6. Primera instalación para usuarios

- [ ] Ofrecer un **instalador inicial** (web, release de GitHub, etc.): el updater solo actualiza **a partir de** una app ya instalada con el mismo `identifier` y la misma cadena de firma (`pubkey`).

### 7. CI/CD (recomendado)

- [ ] Workflow que en tag `v*`: instala Rust, instala dependencias npm, inyecta secret `TAURI_SIGNING_PRIVATE_KEY` (o path), ejecuta `tauri build` y sube artefactos + `latest.json` a la release.
- [ ] Comprobar en Windows al menos una vez el flujo completo: app antigua → abre → detecta versión nueva → instala y reinicia.

### 8. Twitch y API en builds desktop

- [ ] Fijar `VITE_API_URL` en el build de producción si el API **no** es el valor por defecto del código (p. ej. Render).
- [ ] En la consola de Twitch, registrar el redirect exacto del backend: `{API_PUBLIC}/auth/twitch/callback` (no la URL del Vite en desarrollo ni esquemas propios de Tauri).

### 9. Notificaciones (opcional pero ya soportado)

- [ ] Donde tenga sentido en el producto, usar `@tauri-apps/plugin-notification` (permiso ya concedido en capabilities) para reenganche: DM, menciones, etc.

---

## Referencias rápidas

| Tema | Documentación |
|------|----------------|
| Updater Tauri 2 | https://v2.tauri.app/plugin/updater/ |
| CSP | https://v2.tauri.app/security/csp/ |
| Capabilities / permisos | https://v2.tauri.app/security/capabilities/ |

Comando local típico (desde `frontend/`), con firma en shell:

```bash
npm run build
npm run tauri:build
```

El script `tauri-with-cargo-path.mjs` **detecta antes de compilar** si falta la clave privada. Si existe el archivo por defecto `~/.tauri/akonet-desktop.key` (Windows: `%USERPROFILE%\.tauri\akonet-desktop.key`), define automáticamente `TAURI_SIGNING_PRIVATE_KEY_PATH` y el mensaje `[tauri] Using signing key: …` lo confirma.

En Windows (PowerShell), si la clave está en otra ruta:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "$env:USERPROFILE\.tauri\akonet-desktop.key"
# Si generaste la clave **con contraseña**:
# $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = 'tu-contraseña'
npm run tauri:build
```

(Ajusta la ruta o usa `TAURI_SIGNING_PRIVATE_KEY` con el contenido del secret en CI.)

### Error: «A public key has been found, but no private key»

Significa que `tauri.conf.json` tiene `plugins.updater.pubkey` y `bundle.createUpdaterArtifacts: true`, pero no está definido `TAURI_SIGNING_PRIVATE_KEY` ni `TAURI_SIGNING_PRIVATE_KEY_PATH` (y no se encontró ningún `.key` en las rutas que lista el script). Solución: exportar una de las dos variables como arriba, o generar el par con `npm run tauri signer generate` y alinear `pubkey` en el JSON con el `.pub` generado.

### Aviso: «secret key does not match the public key»

La **`plugins.updater.pubkey` en `tauri.conf.json`** debe ser **exactamente** el contenido del fichero **`.pub`** que acompaña a la **`.key`** con la que firmas (misma generación `tauri signer generate`). Si regeneras la clave o usas otro fichero, vuelve a copiar el `.pub` entero al JSON. Si no coinciden, el updater rechazará las actualizaciones en tiempo de ejecución aunque el build genere `.sig`.

### Varias claves en `%USERPROFILE%\.tauri\`

Si existen **`akonet.key`** y **`akonet-desktop.key`**, el script prioriza `akonet.key` (y la ruta `frontend/~/.tauri/akonet.key`) antes que `akonet-desktop.key`. La **`pubkey` en `tauri.conf.json` debe ser la pareja del fichero `.key` que uses**; si cambiaste de par, elimina o renombra la clave antigua para no firmar con el par equivocado.

### Windows: no uses `~` en `-w`

En PowerShell/cmd, `~` **no** se expande como en bash. Si ejecutas `signer generate -w ~/.tauri/akonet.key`, Tauri puede crear una carpeta literal `frontend\~\.tauri\` dentro del proyecto. Usa siempre:

```powershell
npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\akonet.key" -f
```

(con `$env:CI = "true"` si quieres evitar el prompt de contraseña). El script de build también busca `frontend/~/.tauri/akonet.key` por compatibilidad, pero lo recomendable es tener la clave solo bajo `%USERPROFILE%\.tauri\` (y esa ruta **no** debe subirse a git).
