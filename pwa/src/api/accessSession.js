// The owner key is memory-only; storage holds only an expiring device session.
let accessKey = ''
let revision = 0
export const DEVICE_SESSION_KEY = 'phoenix-device-session-v1'
export const LOGOUT_EVENT_KEY = 'phoenix-sign-out-v1'
const listeners = new Set()
export function setAccessKey(value) { accessKey = value; revision++ }
export function accessRevision() { return revision }
export function clearAccessKey() { accessKey = ''; revision++ }
export function forgetDeviceSession() {
  try { globalThis.localStorage?.removeItem(DEVICE_SESSION_KEY) } catch { /* storage unavailable */ }
}
export function rememberDeviceSession(session) {
  if (typeof session?.token !== 'string' || !session.token.startsWith('phoenix-session-v1.') ||
      !Number.isFinite(session.expires_at) || session.expires_at * 1000 <= Date.now()) throw new Error('Invalid device session')
  setAccessKey(session.token)
  try {
    globalThis.localStorage.setItem(DEVICE_SESSION_KEY, JSON.stringify(session))
    return true
  } catch { return false }
}
export function restoreDeviceSession() {
  try {
    const session = JSON.parse(globalThis.localStorage?.getItem(DEVICE_SESSION_KEY) || 'null')
    if (typeof session?.token !== 'string' || !session.token.startsWith('phoenix-session-v1.') ||
        !Number.isFinite(session.expires_at) || session.expires_at * 1000 <= Date.now()) {
      forgetDeviceSession()
      return false
    }
    setAccessKey(session.token)
    return true
  } catch { forgetDeviceSession(); return false }
}
export function onAccessLost(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function lockAccess() {
  revision++
  clearAccessKey()
  forgetDeviceSession()
  try { globalThis.localStorage?.setItem(LOGOUT_EVENT_KEY, `${Date.now()}.${Math.random()}`) } catch { /* storage unavailable */ }
  listeners.forEach(listener => listener())
}
globalThis.addEventListener?.('storage', event => {
  if (event.key === DEVICE_SESSION_KEY || event.key === LOGOUT_EVENT_KEY || event.key === null) {
    revision++
    clearAccessKey()
    listeners.forEach(listener => listener())
  }
})
export async function privateFetch(url, options = {}) {
  const target = new URL(url, globalThis.location?.href || 'http://localhost')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  if (target.protocol !== 'https:' && !(target.protocol === 'http:' && local)) throw new Error('Private API requires HTTPS')
  const requestKey = accessKey
  const headers = new Headers(options.headers)
  headers.delete('Authorization')
  if (requestKey) headers.set('Authorization', `Bearer ${requestKey}`)
  const response = await fetch(url, { ...options, headers, cache: 'no-store', redirect: 'error', credentials: 'omit' })
  if (response.status === 401 && requestKey && requestKey === accessKey) lockAccess()
  return response
}
