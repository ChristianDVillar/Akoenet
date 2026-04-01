# AkoeNet — frontend

Cliente web (React + Vite). Guías del proyecto y arquitectura: **[`../docs/README.md`](../docs/README.md)**.

- Variables de entorno: copia `.env.example` → `.env`.
- Desarrollo: `npm install` y `npm run dev` (puerto por defecto 5173).

## Backend debe estar en marcha

`VITE_API_URL` (por defecto `http://localhost:3000`) debe apuntar al API Node. Si el backend **no** está escuchando, el navegador mostrará `GET …/auth/me net::ERR_CONNECTION_REFUSED` en la consola: es normal; significa que no hay proceso en ese host/puerto.

**Qué hacer:** en otra terminal, desde `backend/`, ejecuta `npm run dev` (o `npm start`), o levanta el stack con `docker compose up` según tu despliegue. Espera a que `GET http://localhost:3000/health` responda en el navegador y recarga el frontend.

En desarrollo, React puede montar efectos dos veces (Strict Mode), así que verás varias líneas idénticas hasta que el API responda.

**Nota:** Chromium registra los fallos de red en la consola; la app ya marca `serverUnreachable` y muestra la UI de “no hay API”, pero no puede ocultar ese mensaje del propio navegador.
