import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const src = name => readFile(new URL(name, import.meta.url), 'utf8')

test('non-Home mobile domains switch to a dedicated command surface while desktop keeps HoloWings', async () => {
  const command = await src('./HoloCommand.jsx')
  const core = await src('./HoloCore.jsx')
  const scene = await src('./HoloScene.jsx')

  assert.match(command, /import HoloMobileDomain from '\.\/HoloMobileDomain\.jsx'/)
  assert.match(command, /const isHome = tab === 'home'/)
  assert.match(command, /!isHome && isMobile && <HoloMobileDomain domain=\{D\} onFocus=\{setFocus\} onAction=\{setSub\} \/>/)
  assert.match(command, /!isHome && !isMobile && <HoloWings domain=\{D\} showTele=\{showTele\} onFocus=\{setFocus\} \/>/)
  assert.match(command, /<HoloBootLine bootLine=\{D\.bootLine\} isMobile=\{isMobile\} isHome=\{isHome\} \/>/)
  assert.match(command, /<HoloCore domain=\{D\} hot=\{hot\} dimmed=\{!!focusPanel\} isShort=\{isShort\} isMobile=\{isMobile\} sparks=\{atmosphere\.sparks\} showChips=\{showChips\} isHome=\{isHome\} \/>/)
  assert.match(core, /export default function HoloCore\(\{\s*domain,\s*hot,\s*dimmed,\s*isShort,\s*isMobile,\s*sparks,\s*showChips,\s*isHome,\s*\}\)/)
  assert.match(core, /const isMobileCommand = isMobile && !isHome/)
  assert.match(scene, /export function HoloBootLine\(\{ bootLine, isMobile, isHome \}\)/)
  assert.match(scene, /if \(isMobile && !isHome\) return null/)
  assert.doesNotMatch(command, /!isHome && <HoloWings domain=\{D\} isMobile=\{isMobile\} showTele=\{showTele\} onFocus=\{setFocus\} \/>/)
  assert.doesNotMatch(command, /!isHome && isMobile && \(\s*<div style=\{\{ display: 'grid', gridTemplateColumns: '1fr', gap: 7/)
})

test('mobile command surface reuses existing panel and action contracts in approved visual order', async () => {
  const mobile = await src('./HoloMobileDomain.jsx')
  const wings = await src('./HoloWings.jsx')

  assert.match(wings, /export function PanelBody/)
  assert.match(mobile, /import \{ PanelBody \} from '\.\/HoloWings\.jsx'/)
  assert.match(mobile, /<div className="holo-mobile-domain__summary"[^>]*>[\s\S]*?<div className="holo-mobile-domain__panels"[^>]*>[\s\S]*?<div className="holo-mobile-domain__actions" data-phx-mobile-actions>/)
  assert.match(mobile, /domain\.panels\.map\(\(panel\)/)
  assert.match(mobile, /onClick=\{\(\) => onFocus\(panel\.code\)\}/)
  assert.match(mobile, /domain\.heroActions\.map\(\(action\)/)
  assert.match(mobile, /onClick=\{\(\) => onAction\(action\.sub\)\}/)
  assert.doesNotMatch(mobile, /<div className="holo-mobile-domain__actions" data-phx-mobile-actions>[\s\S]*?<div className="holo-mobile-domain__panels">/)
})

test('mobile command surface exposes stable geometry hooks for browser measurements', async () => {
  const mobile = await src('./HoloMobileDomain.jsx')

  assert.match(mobile, /data-phx-mobile-command/)
  assert.match(mobile, /data-phx-mobile-summary/)
  assert.match(mobile, /data-phx-mobile-panels/)
  assert.match(mobile, /data-phx-mobile-actions/)
  assert.match(mobile, /data-phx-mobile-panel/)
})

test('mobile command CSS locks the approved phone readability, spacing, and scrolling contract', async () => {
  const css = await src('./holo.css')
  const mobileRule = css.match(/\.holo-mobile-domain\s*\{[\s\S]*?\n  \}/)?.[0] || ''

  assert.match(css, /@media \(max-width: 780px\)/)
  assert.match(css, /\.holo-mobile-domain\b/)
  assert.match(mobileRule, /overflow-y:\s*auto/)
  assert.match(mobileRule, /overflow-x:\s*hidden/)
  assert.match(mobileRule, /padding-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom\)/)
  assert.match(mobileRule, /top:\s*max\(224px,\s*calc\(224px\s*\+\s*env\(safe-area-inset-top\)/)
  assert.match(css, /\.holo-mobile-domain__actions\s*\{[\s\S]*?position:\s*sticky/)
  assert.match(css, /font-size:\s*13px/)
  assert.match(css, /font-size:\s*10px/)
  assert.match(css, /min-height:\s*44px/)
  assert.doesNotMatch(mobileRule, /overflow-x:\s*auto/)
})

test('panel body exports an explicit mobile-readable rendering mode', async () => {
  const wings = await src('./HoloWings.jsx')
  const mobile = await src('./HoloMobileDomain.jsx')

  assert.match(wings, /export function PanelBody\(\{ panel, big, mobile \}\)/)
  assert.match(wings, /const readable = big \|\| mobile/)
  assert.match(wings, /fontSize:\s*readable \?\s*19\s*:\s*16/)
  assert.match(wings, /fontSize:\s*mobile \?\s*'10px'/)
  assert.match(wings, /financeBody\(\{\s*fontSize:\s*13\.5/)
  assert.match(mobile, /<PanelBody panel=\{panel\} mobile \/>/)
})
