import { useEffect, useState } from 'react'
import { verifyAccess } from '../api/client'
import { setAccessKey, clearAccessKey, lockAccess, onAccessLost } from '../api/accessSession'

export default function AccessGate({ children }) {
  const [unlocked, setUnlocked] = useState(false)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => onAccessLost(() => setUnlocked(false)), [])
  async function unlock(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setAccessKey(key.trim())
    try {
      if ('caches' in window) await caches.delete('jarvis-api-cache')
      const result = await verifyAccess()
      if (result.authenticated !== true) throw new Error('Access could not be verified')
      setUnlocked(true)
    } catch (err) {
      clearAccessKey()
      setError(err.status === 503 ? 'Server access is not configured. Contact the owner.' : 'Unable to unlock. Check your key and connection.')
    } finally {
      setKey('')
      setBusy(false)
    }
  }
  if (unlocked) return <><button type="button" onClick={lockAccess} aria-label="Lock Phoenix" style={{ position: 'fixed', right: 12, top: 12, zIndex: 10000, padding: '6px 12px', background: '#07141b', color: '#b4edf2', border: '1px solid #30616a', borderRadius: 6 }}>Lock</button>{children}</>
  return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#061015', color: '#e7f6f7', fontFamily: 'sans-serif' }}>
    <form onSubmit={unlock} style={{ width: '100%', maxWidth: 360 }}>
      <h1 style={{ fontSize: 25 }}>Unlock Phoenix</h1>
      <p style={{ color: '#afc6ca', lineHeight: 1.6 }}>Enter your owner access key to view your private dashboard.</p>
      <label htmlFor="owner-access-key">Access key</label>
      <input id="owner-access-key" type="password" autoComplete="off" spellCheck={false} required disabled={busy} value={key} onChange={event => setKey(event.target.value)} style={{ display: 'block', boxSizing: 'border-box', width: '100%', padding: 12, margin: '8px 0 16px', background: '#0c2028', color: '#fff', border: '1px solid #41636b', borderRadius: 6 }} />
      {error && <p role="alert" style={{ color: '#ffc69d' }}>{error}</p>}
      <button disabled={busy} type="submit" style={{ width: '100%', padding: 12, background: '#8de4ed', color: '#052029', border: 0, borderRadius: 6, fontWeight: 600 }}>{busy ? 'Checking…' : 'Unlock'}</button>
      <p style={{ color: '#afc6ca', fontSize: 13, lineHeight: 1.6 }}>The key stays in this tab’s memory. Reloading or locking requires unlocking again.</p>
    </form>
  </main>
}
