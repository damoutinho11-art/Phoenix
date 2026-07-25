import { registerSW } from 'virtual:pwa-register'

export function registerPhoenixServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })

  let updateSW
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true)
    },
    onRegisteredSW(_url, registration) {
      registration?.update()
    },
  })
}
