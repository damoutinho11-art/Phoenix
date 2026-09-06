function isStandaloneDisplayMode(displayMode) {
  return displayMode === 'standalone' || displayMode === true
}

function createSnapshot(standalone, status) {
  return {
    available: !standalone,
    standalone,
    status,
    showInstructions: status === 'manual',
  }
}

export function createPwaInstallController({ windowRef, displayMode }) {
  let deferredPrompt = null
  let standalone = isStandaloneDisplayMode(displayMode)
  let status = 'idle'
  let snapshot = createSnapshot(standalone, status)
  let disposed = false
  const listeners = new Set()

  function publish(nextStatus, nextStandalone = standalone) {
    status = nextStatus
    standalone = nextStandalone
    snapshot = createSnapshot(standalone, status)

    for (const listener of listeners) listener()
  }

  function handleBeforeInstallPrompt(event) {
    event.preventDefault()
    if (!standalone) deferredPrompt = event
  }

  function handleAppInstalled() {
    deferredPrompt = null
    publish('accepted', true)
  }

  windowRef.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  windowRef.addEventListener('appinstalled', handleAppInstalled)

  return {
    subscribe(listener) {
      if (disposed) return () => {}

      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    getSnapshot() {
      return snapshot
    },

    async install() {
      if (disposed || standalone || status === 'prompting') return

      if (!deferredPrompt) {
        publish('manual')
        return
      }

      const promptEvent = deferredPrompt
      deferredPrompt = null
      publish('prompting')

      try {
        await promptEvent.prompt()
        const choice = await promptEvent.userChoice

        if (standalone && status === 'accepted') return

        if (choice?.outcome === 'accepted') {
          publish('accepted')
        } else if (choice?.outcome === 'dismissed') {
          publish('dismissed')
        } else {
          publish('manual')
        }
      } catch {
        if (!standalone) publish('manual')
      }
    },

    dispose() {
      if (disposed) return

      disposed = true
      deferredPrompt = null
      listeners.clear()
      windowRef.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      windowRef.removeEventListener('appinstalled', handleAppInstalled)
    },
  }
}
