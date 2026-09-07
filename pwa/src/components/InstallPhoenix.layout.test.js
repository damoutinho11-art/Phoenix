import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

function pixels(source, pattern, message) {
  const match = source.match(pattern)
  assert.ok(match, message)
  return Number(match[1])
}

test('Holo install placement clears the mobile SEND and HOLD controls', async () => {
  const [app, holo, css] = await Promise.all([
    read('../App.jsx'),
    read('./holo/HoloCommand.jsx'),
    read('../index.css'),
  ])

  assert.match(
    app,
    /<HoloCommand\s*\/>[\s\S]*<InstallPhoenix placement="holo"\s*\/>/,
    'the Holo shell must select its reserved install placement',
  )

  const composerBottom = pixels(
    holo,
    /: 'calc\((\d+)px \+ env\(safe-area-inset-bottom\)\)'/,
    'Holo mobile home composer must declare its bottom edge',
  )
  assert.match(
    holo,
    /<button[^>]+minHeight: 44[^>]*>SEND<\/button>[\s\S]*<button[^>]+minHeight: 44[^>]*>◉ HOLD<\/button>/,
    'SEND and HOLD must retain 44px tap targets',
  )

  const installBottom = pixels(
    css,
    /\.install-phoenix--holo\s*\{[^}]*bottom:\s*calc\((\d+)px \+ env\(safe-area-inset-bottom\)\)/s,
    'Holo install placement must declare a separate bottom edge',
  )

  assert.ok(
    installBottom >= composerBottom + 44 + 8,
    `install chip bottom ${installBottom}px must clear the ${composerBottom + 44}px composer controls with an 8px gap`,
  )
})
