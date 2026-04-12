# AkoeNet — frontend

Cliente web (React + Vite). Guías del proyecto y arquitectura: **[`../docs/README.md`](../docs/README.md)**.

- Variables de entorno: copia `.env.example` → `.env`.
- Desarrollo: `npm install` y `npm run dev` (puerto por defecto 5173).

## Backend debe estar en marcha

`VITE_API_URL` (por defecto `http://localhost:3000`) debe apuntar al API Node. Si el backend **no** está escuchando, el navegador mostrará `GET …/auth/me net::ERR_CONNECTION_REFUSED` en la consola: es normal; significa que no hay proceso en ese host/puerto.

**Qué hacer:** en otra terminal, desde `backend/`, ejecuta `npm run dev` (o `npm start`), o levanta el stack con `docker compose up` según tu despliegue. Espera a que `GET http://localhost:3000/health` responda en el navegador y recarga el frontend.

En desarrollo, React puede montar efectos dos veces (Strict Mode), así que verás varias líneas idénticas hasta que el API responda.

**Nota:** Chromium registra los fallos de red en la consola; la app ya marca `serverUnreachable` y muestra la UI de “no hay API”, pero no puede ocultar ese mensaje del propio navegador.

## App de escritorio (Tauri)

El mismo cliente web se puede empaquetar como aplicación nativa (Windows/macOS/Linux) con [Tauri](https://tauri.app/) v2. **No hay instalador oficial descargable desde la web pública del proyecto** salvo que publiques tú los artefactos (p. ej. en GitHub Releases).

**Requisitos:** [Rust](https://rustup.rs/) (instalación estable recomendada).

**PATH:** Tras instalar Rust, cierra y abre la terminal o reinicia el IDE. Si ves `cargo … program not found`, los scripts `npm run tauri` / `tauri:dev` / `tauri:build` anteponen automáticamente `~/.cargo/bin` (Windows: `%USERPROFILE%\.cargo\bin`) al PATH.

**Desarrollo** (ventana de escritorio con hot reload del Vite):

```bash
cd frontend
npm install
npm run tauri:dev
```

Configura `frontend/.env` como en desarrollo web (`VITE_API_URL` apuntando a tu backend).

**Compilación** (genera instaladores en `frontend/src-tauri/target/release/bundle/`):

```bash
cd frontend
npm run tauri:build
```

**Build + copia a `public/releases/`** (para servir el `.exe` bajo `/releases/…` en el sitio estático, p. ej. `render.yaml`):

```bash
cd frontend
npm run release:desktop
```

Equivale a `tauri:build` y luego genera en `frontend/public/releases/` **solo la versión más nueva** (semver mayor entre los `.exe` en `bundle/nsis/`), más `AkoeNet-Setup-latest.exe` y la firma `.sig` si existe. Esos `.exe` **no se suben a Git** (límite GitHub 100 MB); están en `.gitignore`. Para el landing en producción usa la URL del asset en **GitHub Releases** (`VITE_DESKTOP_INSTALLER_URL`). Opciones: `--skip-build`, `--clean` (solo borra destino y termina). Destino alternativo: `RELEASE_OUT`.

En Windows verás típicamente `.msi` o instalador NSIS; en macOS `.dmg`/`.app`; según targets en `src-tauri/tauri.conf.json`.

### Avisos de “archivo peligroso” / SmartScreen (Windows)

Los `.exe` sin **firma Authenticode** (certificado de editor) suelen ser marcados por Chrome/Edge y por **Windows SmartScreen** como no fiables. No implica que el binario esté infectado: es la política ante editores no verificados. Opciones: firma el instalador con un certificado de código (de pago, identidad verificada), o indica a los usuarios que usen “Más información” → “Ejecutar de todas formas” si confían en el origen. Documentación Tauri: [Windows Code Signing](https://v2.tauri.app/distribute/sign/windows/).
