# AkoeNet (Espanol)

AkoeNet es una plataforma de comunicacion en tiempo real para comunidades, con servidores, canales de texto/voz, mensajes directos, permisos por roles y soporte de camara opcional en canales de voz.

## Caracteristicas principales

- Autenticacion local (registro/login) y OAuth con Twitch.
- Servidores con roles y permisos por canal (`can_view`, `can_send`, `can_connect`).
- Chat de canales en tiempo real con Socket.IO.
- Mensajeria directa (DM) en tiempo real.
- Reacciones, mensajes pineados y exportacion de historial.
- Subida de imagenes con almacenamiento local o S3/MinIO.
- Canales de voz WebRTC:
  - medidor de microfono,
  - mute/unmute,
  - control de volumen por participante,
  - camara opcional con toggle.
- Documentacion API con Swagger/OpenAPI.

## Documentacion legal

- Indice: [`legal/README.md`](./legal/README.md).
- Textos en `docs/legal/`: `PRIVACIDAD.md`, `TERMINOS_Y_CONDICIONES.md`, `PROTECCION_LEGAL.md`.
- En el cliente (Vite), rutas publicas: `/legal/privacidad`, `/legal/terminos`, `/legal/proteccion`. La portada publica (`/` sin sesion) enlaza al pie y al FAQ.

## Stack tecnico

- Frontend: React + Vite + React Router + Socket.IO Client
- Backend: Node.js + Express + Socket.IO + JWT + Zod
- Base de datos: PostgreSQL
- Cache/bus: Redis
- Storage: local o S3 compatible (MinIO)
- Infra local: Docker Compose

## Estructura del repositorio

- `frontend/`: cliente web.
- `backend/`: API REST + Socket.IO + migraciones.
- `docker-compose.yml`: servicios locales (Postgres, Redis, MinIO, Backend).

## Requisitos

- Node.js 20+ recomendado.
- npm 10+ recomendado.
- Docker y Docker Compose recomendados para un arranque rapido.

## Puesta en marcha rapida (Docker)

1. Clona el repositorio (recomendado: `git clone <url> AkoeNet` para que la carpeta se llame `AkoeNet`).
2. Crea archivos de entorno:
   - copia `backend/.env.example` a `backend/.env`
   - copia `frontend/.env.example` a `frontend/.env`
3. Levanta infraestructura + backend:
   - `docker compose up -d --build`
4. Ejecuta frontend:
   - `cd frontend`
   - `npm install`
   - `npm run dev`
5. Abre:
   - Frontend: `http://localhost:5173`
   - Backend API: `http://localhost:3000`
   - Swagger: `http://localhost:3000/docs`

## Puesta en marcha sin Docker

### Backend

1. `cd backend`
2. `npm install`
3. Configura `backend/.env` (Postgres y Redis locales).
4. Ejecuta migraciones: `npm run migrate`
5. Inicia backend: `npm run dev`

### Frontend

1. `cd frontend`
2. `npm install`
3. Configura `frontend/.env`
4. Inicia frontend: `npm run dev`

## Scripts utiles

### Frontend (`frontend/`)

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run preview`

### Backend (`backend/`)

- `npm run dev`
- `npm start`
- `npm run migrate`
- `npm run migrate:down`
- `npm run test`

## Variables de entorno importantes

### Backend

- `PORT`, `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`
- `STORAGE_DRIVER` (`local` o `s3`)
- `S3_*` y `STORAGE_PUBLIC_BASE_URL`
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI`
- `FRONTEND_OAUTH_REDIRECT`

### Frontend

- `VITE_API_URL`
- `VITE_ICE_SERVERS` (JSON para STUN/TURN)

## Notas de seguridad

- Cambia secretos por defecto antes de produccion.
- No subas `.env` reales al repositorio.
- Configura TURN para mejorar confiabilidad de voz/video.
- Ajusta rate limits segun tu carga esperada.

