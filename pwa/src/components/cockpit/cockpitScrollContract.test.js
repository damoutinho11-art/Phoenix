import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('cockpit shell is height-constrained so it owns vertical scrolling', async () => {
  const css = await readFile(new URL('./cockpit.css', import.meta.url), 'utf8')
  const shellRule = css.match(/\.phx-cockpit-shell\s*\{([^}]*)\}/)?.[1] || ''

  assert.match(shellRule, /(?:^|[\r\n])\s*height:\s*100%\s*;/)
  assert.match(shellRule, /overflow-y:\s*auto\s*;/)
})
