self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await caches.delete('jarvis-api-cache')
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })
    await Promise.all(clients.map(client => client.navigate(client.url)))
  })())
})
