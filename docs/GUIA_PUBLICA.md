# Guía pública de AkoeNet

Este documento resume la plataforma para uso público (repositorio, colaboradores y usuarios técnicos) sin incluir detalles operativos sensibles.

## Resumen

- Frontend web: React + Vite.
- Desktop: Tauri v2 (build para Windows/macOS/Linux).
- Backend: Node.js + PostgreSQL + Redis.
- Tiempo real: Socket.IO para chat y eventos en vivo.

## Componentes principales

- `frontend/`: cliente web y desktop.
- `backend/`: API, autenticación, chat, integraciones.
- `docs/legal/`: políticas y textos legales del producto.

## Build y desarrollo

- Frontend local: ver `frontend/README.md`.
- Backend local: usar variables desde archivos de ejemplo (`.env.example`) y evitar credenciales reales en repositorio.
- Desktop release: ver `frontend/README.md#flujo-recomendado-de-release-desktop-tags`.

## Política de documentación

- Esta guía es la referencia pública.
- Detalles internos (runbooks de operación, respuesta a incidentes, monitoreo interno, credenciales, rutas administrativas internas) deben mantenerse en documentación privada fuera del repositorio público.

