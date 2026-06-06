self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {
    title: 'Elvan Barkod Rapor',
    body: 'Yeni bildiriminiz var.',
    url: '/',
  }

  try {
    if (event.data) {
      data = {
        ...data,
        ...event.data.json(),
      }
    }
  } catch (error) {
    data.body = event.data ? event.data.text() : data.body
  }

  const options = {
    body: data.body,
    icon: '/app-icon-192.png',
    badge: '/app-icon-192.png',
    data: {
      url: data.url || '/',
    },
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus()
          return
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})