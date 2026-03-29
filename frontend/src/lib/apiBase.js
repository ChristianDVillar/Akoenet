/**
 * Base URL for REST, Socket.IO, and image URLs.
 * VITE_API_URL overrides everything (set per environment on Render).
 * Without it, production builds default to the deployed API so OAuth is not stuck on localhost.
 */
export function getApiBaseUrl() {
  const fromEnv = import.meta.env.VITE_API_URL
  if (fromEnv) return String(fromEnv).replace(/\/$/, '')
  if (import.meta.env.PROD) return 'https://akoenet-backend.onrender.com'
  return 'http://localhost:3000'
}
