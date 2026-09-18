import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

function block(css, selector) {
  const match = css.match(new RegExp(selector.replace(/[.\-]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 's'))
  assert.ok(match, `${selector} must be styled`)
  return match[1]
}

test('install action lives in the shell chrome beside LOCK, never over screen content', async () => {
  const [app, css, gate] = await Promise.all([
    read('../App.jsx'),
    read('../index.css'),
    read('./AccessGate.jsx'),
  ])

  assert.match(
    app,
    /<HoloCommand\s*\/>[\s\S]*<InstallPhoenix placement="chrome"\s*\/>/,
    'the Holo shell must select the chrome install placement',
  )
  assert.doesNotMatch(app, /renderContent|BottomNav/, 'App.jsx is the shell only; Holo Command routes')

  // Both chips share the header row under the clock and never float mid-screen.
  const chip = block(css, '.holo-chrome-chip')
  const install = block(css, '.install-phoenix--chrome')
  for (const source of [chip, install]) {
    assert.match(source, /top:\s*calc\(30px \+ env\(safe-area-inset-top\)\)/)
  }
  assert.match(install, /bottom:\s*auto/)
  assert.match(block(css, '.holo-chrome-chip--lock'), /right:\s*14px/)
  assert.match(install, /right:\s*72px/, 'INSTALL sits left of LOCK')

  // Sign out is the LOCK chip, styled by the shell rather than the browser default.
  assert.match(gate, /className="holo-chrome-chip holo-chrome-chip--lock"[^>]*aria-label="Sign out of Phoenix"/)
  assert.doesNotMatch(gate, /borderRadius: 6/)

  // The manual-instructions panel drops down beneath the chip and stays phone-width safe.
  assert.match(block(css, '.install-phoenix--chrome .install-phoenix-panel'), /width:\s*min\(300px, calc\(100vw - 28px\)\)/)
})
