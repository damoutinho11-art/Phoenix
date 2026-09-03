import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const src = name => readFile(new URL(name, import.meta.url), 'utf8')

test('non-Home mobile domains switch to a dedicated command surface while desktop keeps HoloWings', async () => {
  const command = await src('./HoloCommand.jsx')

  assert.match(command, /import HoloMobileDomain from '\.\/HoloMobileDomain\.jsx'/)
  assert.match(command, /const isHome = tab === 'home'/)
  assert.match(command, /!isHome && isMobile && <HoloMobileDomain domain=\{D\} onFocus=\{setFocus\} onAction=\{setSub\} \/>/)
  assert.match(command, /!isHome && !isMobile && <HoloWings domain=\{D\} showTele=\{showTele\} onFocus=\{setFocus\} \/>/)
  assert.doesNotMatch(command, /!isHome && <HoloWings domain=\{D\} isMobile=\{isMobile\} showTele=\{showTele\} onFocus=\{setFocus\} \/>/)
  assert.doesNotMatch(command, /!isHome && isMobile && \(\s*<div style=\{\{ display: 'grid', gridTemplateColumns: '1fr', gap: 7/)
})

test('mobile command surface reuses existing panel and action contracts in domain order', async () => {
  const mobile = await src('./HoloMobileDomain.jsx')
  const wings = await src('./HoloWings.jsx')

  assert.match(wings, /export function PanelBody/)
  assert.match(mobile, /import \{ PanelBody \} from '\.\/HoloWings\.jsx'/)
  assert.match(mobile, /domain\.panels\.map\(\(panel\)/)
  assert.match(mobile, /onClick=\{\(\) => onFocus\(panel\.code\)\}/)
  assert.match(mobile, /domain\.heroActions\.map\(\(action\)/)
  assert.match(mobile, /onClick=\{\(\) => onAction\(action\.sub\)\}/)
})

test('mobile command CSS locks the approved phone readability and scrolling contract', async () => {
  const css = await src('./holo.css')
  const mobileRule = css.match(/\.holo-mobile-domain\s*\{[\s\S]*?\n  \}/)?.[0] || ''

  assert.match(css, /@media \(max-width: 780px\)/)
  assert.match(css, /\.holo-mobile-domain\b/)
  assert.match(mobileRule, /overflow-y:\s*auto/)
  assert.match(mobileRule, /overflow-x:\s*hidden/)
  assert.match(mobileRule, /padding-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom\)/)
  assert.match(css, /font-size:\s*13px/)
  assert.match(css, /font-size:\s*10px/)
  assert.match(css, /min-height:\s*44px/)
  assert.doesNotMatch(mobileRule, /overflow-x:\s*auto/)
})
