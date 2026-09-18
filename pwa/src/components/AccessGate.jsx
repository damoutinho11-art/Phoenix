import { useEffect, useState } from 'react'
import { verifyAccess, createDeviceSession } from '../api/client'
import { setAccessKey, clearAccessKey, lockAccess, onAccessLost, rememberDeviceSession, restoreDeviceSession, forgetDeviceSession, accessRevision } from '../api/accessSession'

export default function AccessGate({ children }) {
  const [unlocked, setUnlocked] = useState(false)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [remember, setRemember] = useState(true)
  const [saved, setSaved] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState('')
  useEffect(() => onAccessLost(() => { setUnlocked(false); setSaved(false); setBusy(false) }), [])
  useEffect(() => {
    let active = true
    if (!restoreDeviceSession()) return
    const revision = accessRevision()
    setSaved(true)
    setBusy(true)
    setError('')
    setNotice('')
    verifyAccess().then(result => {
      if (!active || revision !== accessRevision()) return
      if (result.authenticated !== true) throw new Error('Access could not be verified')
      setUnlocked(true)
    }).catch(err => {
      if (!active || revision !== accessRevision()) return
      clearAccessKey()
      if (err.status === 401) { forgetDeviceSession(); setSaved(false) }
      setError(err.status === 401 ? 'Your session expired. Unlock again.' : 'Unable to connect. Retry your saved session when the connection returns.')
    }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [attempt])
  async function unlock(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setAccessKey(key.trim())
    const revision = accessRevision()
    try {
      if ('caches' in window) await caches.delete('jarvis-api-cache')
      const result = await verifyAccess()
      if (revision !== accessRevision()) return
      if (result.authenticated !== true) throw new Error('Access could not be verified')
      if (remember) {
        const session = await createDeviceSession()
        if (revision !== accessRevision()) return
        if (!rememberDeviceSession(session)) setNotice('This browser could not remember the device. You are signed in for this tab only.')
      } else { forgetDeviceSession() }
      setUnlocked(true)
    } catch (err) {
      if (revision !== accessRevision()) return
      clearAccessKey()
      setError(err.status === 503 ? 'Server access is not configured. Contact the owner.' : 'Unable to unlock. Check your key and connection.')
    } finally {
      setKey('')
      setBusy(false)
    }
  }
  if (unlocked) return <><button type="button" className="holo-chrome-chip holo-chrome-chip--lock" onClick={lockAccess} aria-label="Sign out of Phoenix">Lock</button>{notice && <p role="status" className="holo-chrome-notice">{notice}</p>}{children}</>
  return <main className="access-gate">
    <form onSubmit={unlock} className="access-gate-panel">
      <div className="access-gate-kicker">PHOENIX <span>{'//'}</span> OS v2.5 · PRIVATE LINK</div>
      <h1 className="access-gate-title">Unlock Phoenix</h1>
      <p className="access-gate-copy">Enter your owner access key to view your private dashboard.</p>
      <label htmlFor="owner-access-key" className="access-gate-label">Access key</label>
      <input id="owner-access-key" className="access-gate-input" type="password" autoComplete="off" spellCheck={false} required disabled={busy} value={key} onChange={event => setKey(event.target.value)} />
      {error && <p role="alert" className="access-gate-error">{error}</p>}
      <label className="access-gate-remember"><input type="checkbox" checked={remember} disabled={busy} onChange={event => setRemember(event.target.checked)} />Keep me signed in on this device</label>
      {saved && <button type="button" disabled={busy} onClick={() => setAttempt(value => value + 1)} className="access-gate-secondary">Retry saved session</button>}
      <button disabled={busy} type="submit" className="access-gate-submit">{busy ? 'Checking…' : 'Unlock'}</button>
      <p className="access-gate-copy access-gate-copy--small">{remember ? 'Stay signed in for 30 days on this browser. Your owner key is not saved. Sign out to forget this device.' : 'Sign in for this tab only. Reloading requires unlocking again.'}</p>
    </form>
  </main>
}
