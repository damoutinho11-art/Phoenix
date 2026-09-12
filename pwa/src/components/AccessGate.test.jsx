import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import AccessGate from './AccessGate'
import { verifyAccess, createDeviceSession } from '../api/client'
import { DEVICE_SESSION_KEY, LOGOUT_EVENT_KEY, clearAccessKey } from '../api/accessSession'
vi.mock('../api/client', () => ({ verifyAccess: vi.fn(), createDeviceSession: vi.fn() }))
afterEach(() => { cleanup(); localStorage.clear(); clearAccessKey(); vi.resetAllMocks() })

test('remembered session restores only after verification and sign out forgets it', async () => {
  localStorage.setItem(DEVICE_SESSION_KEY, JSON.stringify({ token: 'phoenix-session-v1.synthetic', expires_at: Date.now()/1000+1000 }))
  verifyAccess.mockResolvedValue({ authenticated: true })
  render(<AccessGate><div>Synthetic private screen</div></AccessGate>)
  expect(screen.queryByText('Synthetic private screen')).toBeNull()
  expect(await screen.findByText('Synthetic private screen')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Sign out of Phoenix' }))
  expect(localStorage.getItem(DEVICE_SESSION_KEY)).toBeNull()
  expect(screen.queryByText('Synthetic private screen')).toBeNull()
})

test('remember option saves the issued session, never the owner key', async () => {
  verifyAccess.mockResolvedValue({ authenticated: true })
  createDeviceSession.mockResolvedValue({token:'phoenix-session-v1.synthetic',expires_at:Date.now()/1000+1000})
  render(<AccessGate><div>Synthetic private screen</div></AccessGate>)
  fireEvent.change(screen.getByLabelText('Access key'), { target: { value: 'synthetic-owner-key' } })
  fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
  expect(await screen.findByText('Synthetic private screen')).toBeTruthy()
  expect(localStorage.getItem(DEVICE_SESSION_KEY)).toContain('phoenix-session-v1.synthetic')
  expect(localStorage.getItem(DEVICE_SESSION_KEY)).not.toContain('synthetic-owner-key')
})

test('temporary restore failure retains session and allows retry without owner key', async () => {
  localStorage.setItem(DEVICE_SESSION_KEY, JSON.stringify({token:'phoenix-session-v1.synthetic',expires_at:Date.now()/1000+1000}))
  verifyAccess.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({authenticated:true})
  render(<AccessGate><div>Synthetic private screen</div></AccessGate>)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(localStorage.getItem(DEVICE_SESSION_KEY)).not.toBeNull()
  expect(screen.queryByText('Synthetic private screen')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Retry saved session'}))
  expect(await screen.findByText('Synthetic private screen')).toBeTruthy()
})

test('expired or rejected sessions cannot mount private children', async () => {
  localStorage.setItem(DEVICE_SESSION_KEY, JSON.stringify({token:'phoenix-session-v1.synthetic',expires_at:1}))
  const view=render(<AccessGate><div>Synthetic private screen</div></AccessGate>)
  expect(localStorage.getItem(DEVICE_SESSION_KEY)).toBeNull()
  expect(verifyAccess).not.toHaveBeenCalled()
  view.unmount()
  localStorage.setItem(DEVICE_SESSION_KEY, JSON.stringify({token:'phoenix-session-v1.synthetic',expires_at:Date.now()/1000+1000}))
  verifyAccess.mockRejectedValue({status:401})
  render(<AccessGate><div>Synthetic private screen</div></AccessGate>)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(localStorage.getItem(DEVICE_SESSION_KEY)).toBeNull()
  expect(screen.queryByText('Synthetic private screen')).toBeNull()
})

test('sign out in another tab wins over an in-flight restore', async () => {
  localStorage.setItem(DEVICE_SESSION_KEY, JSON.stringify({token:'phoenix-session-v1.synthetic',expires_at:Date.now()/1000+1000}))
  let finish
  verifyAccess.mockReturnValue(new Promise(resolve => {finish=resolve}))
  render(<AccessGate><div>Synthetic private screen</div></AccessGate>)
  fireEvent(window,new StorageEvent('storage',{key:DEVICE_SESSION_KEY,newValue:null}))
  finish({authenticated:true})
  await new Promise(resolve => setTimeout(resolve,0))
  expect(screen.queryByText('Synthetic private screen')).toBeNull()
})

test('private children mount only after successful authentication and unmount on lock', async () => {
  verifyAccess.mockResolvedValue({ authenticated: true })
  render(<AccessGate><div>Synthetic private screen</div></AccessGate>)
  fireEvent.click(screen.getByLabelText('Keep me signed in on this device'))
  expect(screen.queryByText('Synthetic private screen')).toBeNull()
  fireEvent.change(screen.getByLabelText('Access key'), { target: { value: 'synthetic-key' } })
  fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
  expect(await screen.findByText('Synthetic private screen')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Sign out of Phoenix' }))
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

test('temporary sessions broadcast and receive sign out without a remembered entry', async () => {
  verifyAccess.mockResolvedValue({authenticated:true})
  render(<AccessGate><div>Synthetic private screen</div></AccessGate>)
  fireEvent.click(screen.getByLabelText('Keep me signed in on this device'))
  fireEvent.change(screen.getByLabelText('Access key'),{target:{value:'synthetic-key'}})
  fireEvent.click(screen.getByRole('button',{name:'Unlock'}))
  expect(await screen.findByText('Synthetic private screen')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Sign out of Phoenix'}))
  expect(localStorage.getItem(LOGOUT_EVENT_KEY)).not.toBeNull()
  expect(localStorage.getItem(DEVICE_SESSION_KEY)).toBeNull()
  fireEvent.change(screen.getByLabelText('Access key'),{target:{value:'synthetic-key'}})
  fireEvent.click(screen.getByRole('button',{name:'Unlock'}))
  expect(await screen.findByText('Synthetic private screen')).toBeTruthy()
  fireEvent(window,new StorageEvent('storage',{key:LOGOUT_EVENT_KEY,newValue:'another-tab'}))
  expect(screen.queryByText('Synthetic private screen')).toBeNull()
})
