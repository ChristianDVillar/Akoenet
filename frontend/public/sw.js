/* Minimal service worker so Chrome/Edge can offer PWA install (manifest + SW + HTTPS). */
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
