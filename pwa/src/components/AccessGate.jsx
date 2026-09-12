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
  if (unlocked) return <><button type="button" onClick={lockAccess} aria-label="Sign out of Phoenix" style={{ position: 'fixed', right: 12, top: 12, zIndex: 10000, padding: '6px 12px', background: '#07141b', color: '#b4edf2', border: '1px solid #30616a', borderRadius: 6 }}>Sign out</button>{notice && <p role="status" style={{position:'fixed',top:48,right:12,zIndex:10000,background:'#07141b',color:'#fff',padding:12,maxWidth:320}}>{notice}</p>}{children}</>
  return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#061015', color: '#e7f6f7', fontFamily: 'sans-serif' }}>
    <form onSubmit={unlock} style={{ width: '100%', maxWidth: 360 }}>
      <h1 style={{ fontSize: 25 }}>Unlock Phoenix</h1>
      <p style={{ color: '#afc6ca', lineHeight: 1.6 }}>Enter your owner access key to view your private dashboard.</p>
      <label htmlFor="owner-access-key">Access key</label>
      <input id="owner-access-key" type="password" autoComplete="off" spellCheck={false} required disabled={busy} value={key} onChange={event => setKey(event.target.value)} style={{ display: 'block', boxSizing: 'border-box', width: '100%', padding: 12, margin: '8px 0 16px', background: '#0c2028', color: '#fff', border: '1px solid #41636b', borderRadius: 6 }} />
      {error && <p role="alert" style={{ color: '#ffc69d' }}>{error}</p>}
      <label style={{display:'flex',gap:8,alignItems:'center',marginBottom:16}}><input type="checkbox" checked={remember} disabled={busy} onChange={event => setRemember(event.target.checked)} />Keep me signed in on this device</label>
      {saved && <button type="button" disabled={busy} onClick={() => setAttempt(value => value + 1)} style={{marginBottom:16}}>Retry saved session</button>}
      <button disabled={busy} type="submit" style={{ width: '100%', padding: 12, background: '#8de4ed', color: '#052029', border: 0, borderRadius: 6, fontWeight: 600 }}>{busy ? 'Checking…' : 'Unlock'}</button>
      <p style={{ color: '#afc6ca', fontSize: 13, lineHeight: 1.6 }}>{remember ? 'Stay signed in for 30 days on this browser. Your owner key is not saved. Sign out to forget this device.' : 'Sign in for this tab only. Reloading requires unlocking again.'}</p>
    </form>
  </main>
}
