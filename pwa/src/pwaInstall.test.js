import assert from 'node:assert/strict'
import test from 'node:test'

import { createPwaInstallController } from './pwaInstall.js'

function createFakeWindow() {
  const listeners = new Map()

  return {
    addEventListener(type, listener) {
      const typeListeners = listeners.get(type) ?? new Set()
      typeListeners.add(listener)
      listeners.set(type, typeListeners)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) ?? []) listener(event)
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0
    },
  }
}

function createInstallEvent({ outcome = 'accepted', promptError, choiceError } = {}) {
  let prevented = 0
  let prompted = 0

  return {
    async prompt() {
      prompted += 1
      if (promptError) throw promptError
    },
    userChoice: choiceError
      ? Promise.reject(choiceError)
      : Promise.resolve({ outcome }),
    preventDefault() {
      prevented += 1
    },
    get prevented() {
      return prevented
    },
    get prompted() {
      return prompted
    },
  }
}

test('captures the deferred event but prompts only after install is requested', async () => {
  const windowRef = createFakeWindow()
  const controller = createPwaInstallController({ windowRef, displayMode: 'browser' })
  const event = createInstallEvent({ outcome: 'accepted' })

  assert.deepEqual(controller.getSnapshot(), {
    available: true,
    standalone: false,
    status: 'idle',
    showInstructions: false,
  })

  windowRef.dispatch('beforeinstallprompt', event)

  assert.equal(event.prevented, 1)
  assert.equal(event.prompted, 0)

  await controller.install()

  assert.equal(event.prompted, 1)
  assert.deepEqual(controller.getSnapshot(), {
    available: true,
    standalone: false,
    status: 'accepted',
    showInstructions: false,
  })
})

test('publishes prompting and accepted states to subscribers', async () => {
  const windowRef = createFakeWindow()
  const controller = createPwaInstallController({ windowRef, displayMode: 'browser' })
  let resolveChoice
  const event = createInstallEvent()
  event.userChoice = new Promise(resolve => {
    resolveChoice = resolve
  })
  const statuses = []
  const unsubscribe = controller.subscribe(() => {
    statuses.push(controller.getSnapshot().status)
  })

  windowRef.dispatch('beforeinstallprompt', event)
  const installation = controller.install()

  assert.equal(controller.getSnapshot().status, 'prompting')
  resolveChoice({ outcome: 'accepted' })
  await installation
  unsubscribe()

  assert.deepEqual(statuses, ['prompting', 'accepted'])
})

test('ignores repeated install requests while the native prompt is pending', async () => {
  const windowRef = createFakeWindow()
  const controller = createPwaInstallController({ windowRef, displayMode: 'browser' })
  let resolveChoice
  const event = createInstallEvent()
  event.userChoice = new Promise(resolve => {
    resolveChoice = resolve
  })

  windowRef.dispatch('beforeinstallprompt', event)
  const firstInstallation = controller.install()
  await controller.install()

  assert.equal(event.prompted, 1)
  assert.equal(controller.getSnapshot().status, 'prompting')

  resolveChoice({ outcome: 'accepted' })
  await firstInstallation
})

test('reports dismissal truthfully and consumes the deferred prompt once', async () => {
  const windowRef = createFakeWindow()
  const controller = createPwaInstallController({ windowRef, displayMode: 'browser' })
  const event = createInstallEvent({ outcome: 'dismissed' })

  windowRef.dispatch('beforeinstallprompt', event)
  await controller.install()

  assert.equal(controller.getSnapshot().status, 'dismissed')
  assert.equal(controller.getSnapshot().showInstructions, false)

  await controller.install()

  assert.equal(event.prompted, 1)
  assert.equal(controller.getSnapshot().status, 'manual')
  assert.equal(controller.getSnapshot().showInstructions, true)
})

test('shows manual instructions when no deferred prompt is available', async () => {
  const controller = createPwaInstallController({
    windowRef: createFakeWindow(),
    displayMode: 'browser',
  })

  await controller.install()

  assert.deepEqual(controller.getSnapshot(), {
    available: true,
    standalone: false,
    status: 'manual',
    showInstructions: true,
  })
})

test('shows manual instructions when prompting throws', async () => {
  const windowRef = createFakeWindow()
  const controller = createPwaInstallController({ windowRef, displayMode: 'browser' })
  const event = createInstallEvent({ promptError: new Error('prompt failed') })

  windowRef.dispatch('beforeinstallprompt', event)
  await controller.install()

  assert.equal(event.prompted, 1)
  assert.equal(controller.getSnapshot().status, 'manual')
  assert.equal(controller.getSnapshot().showInstructions, true)
})

test('shows manual instructions when the browser choice cannot be read', async () => {
  const windowRef = createFakeWindow()
  const controller = createPwaInstallController({ windowRef, displayMode: 'browser' })
  const event = createInstallEvent({ choiceError: new Error('choice failed') })

  windowRef.dispatch('beforeinstallprompt', event)
  await controller.install()

  assert.equal(controller.getSnapshot().status, 'manual')
  assert.equal(controller.getSnapshot().showInstructions, true)
})

test('suppresses installation while already running standalone', async () => {
  const windowRef = createFakeWindow()
  const controller = createPwaInstallController({ windowRef, displayMode: 'standalone' })
  const event = createInstallEvent()

  windowRef.dispatch('beforeinstallprompt', event)
  await controller.install()

  assert.equal(event.prompted, 0)
  assert.deepEqual(controller.getSnapshot(), {
    available: false,
    standalone: true,
    status: 'idle',
    showInstructions: false,
  })
})

test('accepts a matched display-mode query as standalone input', () => {
  const controller = createPwaInstallController({
    windowRef: createFakeWindow(),
    displayMode: true,
  })

  assert.equal(controller.getSnapshot().standalone, true)
  assert.equal(controller.getSnapshot().available, false)
})

test('appinstalled records acceptance, enters standalone state, and discards the prompt', async () => {
  const windowRef = createFakeWindow()
  const controller = createPwaInstallController({ windowRef, displayMode: 'browser' })
  const event = createInstallEvent()

  windowRef.dispatch('beforeinstallprompt', event)
  windowRef.dispatch('appinstalled')

  assert.deepEqual(controller.getSnapshot(), {
    available: false,
    standalone: true,
    status: 'accepted',
    showInstructions: false,
  })

  await controller.install()
  assert.equal(event.prompted, 0)
})

test('appinstalled remains authoritative if userChoice settles afterward', async () => {
  const windowRef = createFakeWindow()
  const controller = createPwaInstallController({ windowRef, displayMode: 'browser' })
  let resolveChoice
  const event = createInstallEvent()
  event.userChoice = new Promise(resolve => {
    resolveChoice = resolve
  })

  windowRef.dispatch('beforeinstallprompt', event)
  const installation = controller.install()
  windowRef.dispatch('appinstalled')
  resolveChoice({ outcome: 'dismissed' })
  await installation

  assert.deepEqual(controller.getSnapshot(), {
    available: false,
    standalone: true,
    status: 'accepted',
    showInstructions: false,
  })
})

test('unsubscribe and dispose clean up controller listeners', () => {
  const windowRef = createFakeWindow()
  const controller = createPwaInstallController({ windowRef, displayMode: 'browser' })
  let notifications = 0
  const unsubscribe = controller.subscribe(() => {
    notifications += 1
  })

  assert.equal(windowRef.listenerCount('beforeinstallprompt'), 1)
  assert.equal(windowRef.listenerCount('appinstalled'), 1)

  unsubscribe()
  windowRef.dispatch('appinstalled')
  assert.equal(notifications, 0)

  controller.dispose()
  controller.dispose()

  assert.equal(windowRef.listenerCount('beforeinstallprompt'), 0)
  assert.equal(windowRef.listenerCount('appinstalled'), 0)

  const event = createInstallEvent()
  windowRef.dispatch('beforeinstallprompt', event)
  assert.equal(event.prevented, 0)
})
