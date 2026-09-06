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

test('Android manifest publishes separate standard and maskable Phoenix icons', async () => {
  const config = await read('../vite.config.js')

  assert.match(config, /src:\s*'icons\/icon-maskable-192\.png'.*purpose:\s*'maskable'/)
  assert.match(config, /src:\s*'icons\/icon-maskable-512\.png'.*purpose:\s*'maskable'/)
  assert.match(config, /src:\s*'icons\/icon-192\.png'.*purpose:\s*'any'/)
  assert.match(config, /src:\s*'icons\/icon-512\.png'.*purpose:\s*'any'/)
})

test('Android manifest uses the Phoenix theme and precaches icon assets', async () => {
  const config = await read('../vite.config.js')

  assert.match(config, /theme_color:\s*'#00cfff'/)
  assert.match(config, /background_color:\s*'#010608'/)
  assert.match(config, /includeAssets:\s*\['icons\/\*\.png'\]/)
})

test('page metadata uses the Phoenix theme, favicon, and Apple touch icon', async () => {
  const page = await read('../index.html')

  assert.match(page, /<meta name="theme-color" content="#00cfff" \/>/)
  assert.match(page, /<link rel="icon" type="image\/png" href="\/icons\/favicon-32\.png" \/>/)
  assert.match(page, /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png" \/>/)
})
