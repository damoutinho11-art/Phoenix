import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const opening = readFileSync(new URL('../../../public/phoenix/opening.html', import.meta.url), 'utf8')

test('opening remains the single route-connected Phoenix home', () => {
  assert.match(opening, /id="reactorButton"/)
  for (const domain of ['finance', 'training', 'nutrition', 'calendar']) {
    assert.match(opening, new RegExp(`data-open-domain="${domain}"`))
  }
  assert.match(opening, /PHOENIX_OPEN_DOMAIN/)
  assert.doesNotMatch(opening, /MissionControl|HomeCockpit/)
})

test('premium home exposes honest brief and chat actions through existing flows', () => {
  assert.match(opening, /class="home-actions"/)
  assert.match(opening, /class="home-action home-action-brief"/)
  assert.match(opening, /data-open-domain="calendar"/)
  assert.match(opening, /class="home-action home-action-chat"/)
  assert.match(opening, /id="openHomeChat"/)
  assert.match(opening, /id="chatDock"/)
  assert.match(opening, /id="chatInput"/)
  assert.match(opening, /homeChat\.addEventListener\('click'/)
})

test('premium pass protects focus, reduced motion, and 390px layout', () => {
  assert.match(opening, /PHOENIX v2\.75: HOME COCKPIT PREMIUM PASS/)
  assert.match(opening, /\.home-action:focus-visible/)
  assert.match(opening, /\.home-action-label\{[\s\S]*?color:#f7feff;[\s\S]*?font-weight:750;[\s\S]*?text-shadow:/)
  assert.match(opening, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(opening, /@media \(max-width:390px\)/)
  assert.match(opening, /overflow-x:hidden/)
  assert.match(opening, /max-width:100%/)
  assert.match(opening, /\.side\[data-open-domain\]\{\s*display:block !important;\s*visibility:visible !important;\s*animation:none !important;/)
})
