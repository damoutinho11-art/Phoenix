import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('production PWA activates new deployments and reloads controlled clients', async () => {
  const main = await read('./main.jsx')
  const updater = await read('./pwaUpdate.js')
  const config = await read('../vite.config.js')
  const workerHook = await read('../public/sw-force-refresh.js')

  assert.match(main, /registerPhoenixServiceWorker\(\)/)
  assert.match(updater, /virtual:pwa-register/)
  assert.match(updater, /immediate:\s*true/)
  assert.match(updater, /onNeedRefresh/)
  assert.match(updater, /updateSW\(true\)/)
  assert.match(updater, /registration\?\.update\(\)/)
  assert.match(updater, /controllerchange/)
  assert.match(updater, /window\.location\.reload\(\)/)
  assert.match(config, /importScripts:\s*\['sw-force-refresh\.js'\]/)
  assert.match(workerHook, /client\.navigate\(client\.url\)/)
})
