import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setAccessKey, clearAccessKey, privateFetch, onAccessLost } from './accessSession.js'

test('private requests carry a memory-only key, reject redirects and bypass caches', async () => {
  const original = globalThis.fetch
  let sent
  globalThis.fetch = async (url, options) => { sent = options; return { status: 200 } }
  try {
    setAccessKey('synthetic-key')
    await privateFetch('https://api.example/private', { headers: { 'Content-Type': 'application/json' } })
    assert.equal(sent.headers.get('Authorization'), 'Bearer synthetic-key')
    assert.equal(sent.cache, 'no-store')
    assert.equal(sent.redirect, 'error')
    clearAccessKey()
    await privateFetch('https://api.example/private')
    assert.equal(sent.headers.has('Authorization'), false)
  } finally { globalThis.fetch = original; clearAccessKey() }
})

test('401 clears the current key and notifies the lock screen', async () => {
  const original = globalThis.fetch
  let lost = 0
  const unsubscribe = onAccessLost(() => lost++)
  globalThis.fetch = async () => ({ status: 401 })
  try {
    setAccessKey('synthetic-key')
    await privateFetch('https://api.example/private')
    assert.equal(lost, 1)
  } finally { unsubscribe(); clearAccessKey(); globalThis.fetch = original }
})

test('never sends owner credentials over non-local plain HTTP', async () => {
  const original = globalThis.fetch
  let called = false
  globalThis.fetch = async () => { called = true; return { status: 200 } }
  try {
    setAccessKey('synthetic-key')
    await assert.rejects(privateFetch('http://remote.example/private'), /HTTPS/)
    assert.equal(called, false)
  } finally { clearAccessKey(); globalThis.fetch = original }
})
