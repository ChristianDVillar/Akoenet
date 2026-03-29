# AkoNet (English)

AkoNet is a community-focused real-time communication platform with servers, text/voice channels, direct messages, role-based permissions, and optional camera support in voice rooms.

## Main Features

- Local authentication (register/login) and Twitch OAuth.
- Servers with role and per-channel permissions (`can_view`, `can_send`, `can_connect`).
- Real-time channel chat via Socket.IO.
- Real-time direct messages (DM).
- Reactions, pinned messages, and channel history export.
- Image upload with local storage or S3/MinIO.
- WebRTC voice channels:
  - mic meter,
  - mute/unmute,
  - per-user volume controls,
  - optional camera with toggle.
- Backend API docs via Swagger/OpenAPI.

## Tech Stack

- Frontend: React + Vite + React Router + Socket.IO Client
- Backend: Node.js + Express + Socket.IO + JWT + Zod
- Database: PostgreSQL
- Cache/bus: Redis
- Storage: local or S3-compatible (MinIO)
- Local infrastructure: Docker Compose

## Repository Structure

- `frontend/`: web client.
- `backend/`: REST API + Socket.IO + migrations.
- `docker-compose.yml`: local services (Postgres, Redis, MinIO, Backend).
- `ESTRUCTURA_Y_FUNCIONAMIENTO.md`: detailed technical architecture (Spanish).

## Requirements

- Node.js 20+ recommended.
- npm 10+ recommended.
- Docker + Docker Compose recommended for quick local setup.

## Quick Start (Docker)

1. Clone this repository.
2. Create env files:
   - copy `backend/.env.example` to `backend/.env`
   - copy `frontend/.env.example` to `frontend/.env`
3. Start infra + backend:
   - `docker compose up -d --build`
4. Run frontend:
   - `cd frontend`
   - `npm install`
   - `npm run dev`
5. Open:
   - Frontend: `http://localhost:5173`
   - Backend API: `http://localhost:3000`
   - Swagger: `http://localhost:3000/docs`

## Quick Start (Without Docker)

### Backend

1. `cd backend`
2. `npm install`
3. Configure `backend/.env` (local Postgres + Redis).
4. Run migrations: `npm run migrate`
5. Start backend: `npm run dev`

### Frontend

1. `cd frontend`
2. `npm install`
3. Configure `frontend/.env`
4. Start frontend: `npm run dev`

## Useful Scripts

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

## Important Environment Variables

### Backend

- `PORT`, `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`
- `STORAGE_DRIVER` (`local` or `s3`)
- `S3_*` and `STORAGE_PUBLIC_BASE_URL`
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI`
- `FRONTEND_OAUTH_REDIRECT`

### Frontend

- `VITE_API_URL`
- `VITE_ICE_SERVERS` (JSON array for STUN/TURN)

## Security Notes

- Replace default secrets before production.
- Never commit real `.env` files.
- Configure TURN servers for better voice/video reliability.
- Adjust rate limits according to expected traffic.

