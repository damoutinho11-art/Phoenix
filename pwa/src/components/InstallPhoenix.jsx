import { useEffect, useRef, useState } from 'react'

import { createPwaInstallController } from '../pwaInstall'

function displayMode(windowRef) {
  return windowRef.matchMedia?.('(display-mode: standalone)').matches
    ? 'standalone'
    : 'browser'
}

export default function InstallPhoenix({ createController = createPwaInstallController, placement = 'nav' }) {
  const controllerRef = useRef(null)
  const installButtonRef = useRef(null)
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

  function dismissInstructions() {
    installButtonRef.current?.focus()
    setInstructionsDismissed(true)
  }

  const announcement = showInstructions
    ? 'Manual install instructions: Chrome menu → Add to Home screen → Install'
    : prompting
      ? 'Opening Android install prompt…'
      : snapshot.status === 'dismissed'
        ? 'Installation dismissed. Phoenix was not installed.'
        : ''

  return (
    <aside className={`install-phoenix install-phoenix--${placement}`} aria-label="Install Phoenix">
      <div
        className="install-phoenix-announcement"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>

      <div
        id="install-phoenix-instructions"
        className="install-phoenix-panel"
        hidden={!showInstructions}
      >
        {showInstructions && (
          <>
            <p>Chrome menu → Add to Home screen → Install</p>
            <button
              type="button"
              className="install-phoenix-dismiss"
              aria-label="Dismiss install instructions"
              onClick={dismissInstructions}
            >
              <span aria-hidden="true">×</span>
            </button>
          </>
        )}
      </div>

      <div className="install-phoenix-row">
        <div className="install-phoenix-status">
          {prompting && 'Opening Android install prompt…'}
          {snapshot.status === 'dismissed' && 'Installation dismissed. Phoenix was not installed.'}
        </div>
        <button
          ref={installButtonRef}
          type="button"
          className="install-phoenix-button"
          disabled={prompting}
          aria-expanded={showInstructions}
          aria-controls="install-phoenix-instructions"
          onClick={requestInstall}
        >
          INSTALL PHOENIX
        </button>
      </div>
    </aside>
  )
}
