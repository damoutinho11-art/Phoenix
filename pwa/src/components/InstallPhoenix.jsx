import { useEffect, useRef, useState } from 'react'

import { createPwaInstallController } from '../pwaInstall'

function displayMode(windowRef) {
  return windowRef.matchMedia?.('(display-mode: standalone)').matches
    ? 'standalone'
    : 'browser'
}

export default function InstallPhoenix({ createController = createPwaInstallController }) {
  const controllerRef = useRef(null)
  const [snapshot, setSnapshot] = useState(null)
  const [instructionsDismissed, setInstructionsDismissed] = useState(false)

  useEffect(() => {
    const windowRef = window
    const controller = createController({
      windowRef,
      displayMode: displayMode(windowRef),
    })
    const update = () => setSnapshot(controller.getSnapshot())

    controllerRef.current = controller
    const unsubscribe = controller.subscribe(update)
    update()

    return () => {
      unsubscribe()
      controller.dispose()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [createController])

  if (!snapshot || !snapshot.available || snapshot.standalone || snapshot.status === 'accepted') {
    return null
  }

  const prompting = snapshot.status === 'prompting'
  const showInstructions = snapshot.showInstructions && !instructionsDismissed

  async function requestInstall() {
    setInstructionsDismissed(false)
    await controllerRef.current?.install()
  }

  return (
    <aside className="install-phoenix" aria-label="Install Phoenix">
      {showInstructions && (
        <div className="install-phoenix-panel">
          <p>Chrome menu → Add to Home screen → Install</p>
          <button
            type="button"
            className="install-phoenix-dismiss"
            aria-label="Dismiss install instructions"
            onClick={() => setInstructionsDismissed(true)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}

      <div className="install-phoenix-row">
        <div className="install-phoenix-status" aria-live="polite">
          {prompting && 'Opening Android install prompt…'}
          {snapshot.status === 'dismissed' && 'Installation dismissed. Phoenix was not installed.'}
        </div>
        <button
          type="button"
          className="install-phoenix-button"
          disabled={prompting}
          onClick={requestInstall}
        >
          INSTALL PHOENIX
        </button>
      </div>
    </aside>
  )
}
