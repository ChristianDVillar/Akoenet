/* AkoeNet Web Push — minimal handler */
self.addEventListener('push', (event) => {
  let payload = { title: 'AkoeNet', body: '', url: '/' }
  try {
    if (event.data) payload = { ...payload, ...JSON.parse(event.data.text()) }
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'AkoeNet', {
      body: payload.body || '',
      data: { url: payload.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const c of clientList) {
        if (c.url && 'focus' in c) return c.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
      return undefined
    })
  )
})
