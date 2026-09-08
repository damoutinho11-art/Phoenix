// The owner key lives only in this tab's memory, never in storage or a URL.
let accessKey = ''
const listeners = new Set()
export function setAccessKey(value) { accessKey = value }
export function clearAccessKey() { accessKey = '' }
export function onAccessLost(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function lockAccess() {
  clearAccessKey()
  listeners.forEach(listener => listener())
}
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
