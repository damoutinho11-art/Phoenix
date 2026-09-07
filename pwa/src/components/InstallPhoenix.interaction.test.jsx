import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import InstallPhoenix from './InstallPhoenix'

function createController(initialSnapshot) {
  let snapshot = initialSnapshot
  const listeners = new Set()
  const controller = {
    dispose: vi.fn(),
    getSnapshot: vi.fn(() => snapshot),
    install: vi.fn(),
    subscribe: vi.fn(listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }),
    publish(nextSnapshot) {
      snapshot = nextSnapshot
      for (const listener of listeners) listener()
    },
  }
  return controller
}

afterEach(cleanup)

describe('InstallPhoenix', () => {
  it('offers installation and delegates the user action to the controller', async () => {
    const controller = createController({
      available: true,
      standalone: false,
      status: 'idle',
      showInstructions: false,
    })
    const user = userEvent.setup()

    render(<InstallPhoenix createController={() => controller} />)

    await user.click(await screen.findByRole('button', { name: 'INSTALL PHOENIX' }))
    expect(controller.install).toHaveBeenCalledTimes(1)
  })

  it('shows and dismisses the exact Chrome fallback instructions', async () => {
    const controller = createController({
      available: true,
      standalone: false,
      status: 'manual',
      showInstructions: true,
    })
    const user = userEvent.setup()

    render(<InstallPhoenix createController={() => controller} />)

    expect(await screen.findByText('Chrome menu → Add to Home screen → Install')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Dismiss install instructions' }))
    expect(screen.queryByText('Chrome menu → Add to Home screen → Install')).toBeNull()
  })

  it('announces manual fallback from a persistent region associated with the install button', async () => {
    const controller = createController({
      available: true,
      standalone: false,
      status: 'idle',
      showInstructions: false,
    })
    controller.install.mockImplementation(async () => {
      controller.publish({
        available: true,
        standalone: false,
        status: 'manual',
        showInstructions: true,
      })
    })
    const user = userEvent.setup()

    render(<InstallPhoenix createController={() => controller} />)

    const installButton = await screen.findByRole('button', { name: 'INSTALL PHOENIX' })
    const liveRegion = screen.getByRole('status')
    expect(liveRegion.textContent).toBe('')
    expect(installButton.getAttribute('aria-expanded')).toBe('false')
    expect(installButton.getAttribute('aria-controls')).toBe('install-phoenix-instructions')
    const controlledPanel = document.getElementById(installButton.getAttribute('aria-controls'))
    expect(controlledPanel).not.toBeNull()
    expect(controlledPanel.hidden).toBe(true)

    await user.click(installButton)

    await waitFor(() => expect(installButton.getAttribute('aria-expanded')).toBe('true'))
    const instructions = screen.getByText('Chrome menu → Add to Home screen → Install')
    expect(controlledPanel.hidden).toBe(false)
    expect(controlledPanel.contains(instructions)).toBe(true)
    expect(screen.getByRole('status')).toBe(liveRegion)
    expect(liveRegion.textContent).toContain('Chrome menu → Add to Home screen → Install')
  })

  it('collapses manual instructions and returns focus to the install button', async () => {
    const controller = createController({
      available: true,
      standalone: false,
      status: 'manual',
      showInstructions: true,
    })
    const user = userEvent.setup()

    render(<InstallPhoenix createController={() => controller} />)

    const installButton = await screen.findByRole('button', { name: 'INSTALL PHOENIX' })
    expect(installButton.getAttribute('aria-expanded')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Dismiss install instructions' }))

    expect(installButton.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(installButton)
    expect(screen.queryByText('Chrome menu → Add to Home screen → Install')).toBeNull()
  })

  it('reports a dismissed native prompt without claiming installation', async () => {
    const controller = createController({
      available: true,
      standalone: false,
      status: 'dismissed',
      showInstructions: false,
    })

    render(<InstallPhoenix createController={() => controller} />)

    expect((await screen.findByRole('status')).textContent).toBe('Installation dismissed. Phoenix was not installed.')
    expect(screen.getByRole('button', { name: 'INSTALL PHOENIX' })).toBeTruthy()
  })

  it.each([
    {
      available: false,
      standalone: true,
      status: 'idle',
      showInstructions: false,
    },
    {
      available: true,
      standalone: false,
      status: 'accepted',
      showInstructions: false,
    },
  ])('renders no install control for standalone or accepted state', async snapshot => {
    const controller = createController(snapshot)

    render(<InstallPhoenix createController={() => controller} />)

    await waitFor(() => expect(controller.getSnapshot).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'INSTALL PHOENIX' })).toBeNull()
  })

  it('unsubscribes and disposes its controller on unmount', async () => {
    const unsubscribe = vi.fn()
    const controller = createController({
      available: true,
      standalone: false,
      status: 'idle',
      showInstructions: false,
    })
    controller.subscribe.mockReturnValue(unsubscribe)

    const view = render(<InstallPhoenix createController={() => controller} />)
    await screen.findByRole('button', { name: 'INSTALL PHOENIX' })
    view.unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(controller.dispose).toHaveBeenCalledTimes(1)
  })
})
