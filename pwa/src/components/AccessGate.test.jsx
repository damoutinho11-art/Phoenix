import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import AccessGate from './AccessGate'
import { verifyAccess } from '../api/client'
vi.mock('../api/client', () => ({ verifyAccess: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

test('private children mount only after successful authentication and unmount on lock', async () => {
  verifyAccess.mockResolvedValue({ authenticated: true })
  render(<AccessGate><div>Synthetic private screen</div></AccessGate>)
  expect(screen.queryByText('Synthetic private screen')).toBeNull()
  fireEvent.change(screen.getByLabelText('Access key'), { target: { value: 'synthetic-key' } })
  fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
  expect(await screen.findByText('Synthetic private screen')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Lock Phoenix' }))
  expect(screen.queryByText('Synthetic private screen')).toBeNull()
})

test('a failed unlock does not expose children or echo the submitted key', async () => {
  verifyAccess.mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }))
  render(<AccessGate><div>Synthetic private screen</div></AccessGate>)
  fireEvent.change(screen.getByLabelText('Access key'), { target: { value: 'synthetic-key' } })
  fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByLabelText('Access key').value).toBe('')
  expect(screen.queryByText('Synthetic private screen')).toBeNull()
})
