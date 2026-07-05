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

test('v2.76 micro-polish strengthens readability, reactor scale, and chat console', () => {
  assert.match(opening, /PHOENIX v2\.76: READABILITY, REACTOR \+ CHAT MICRO-POLISH/)
  assert.match(opening, /\.orbit\{[\s\S]*?width:min\(47vw, 58vh, 620px\) !important;/)
  assert.match(opening, /\.resp\{[\s\S]*?color:#eefcff !important;[\s\S]*?font-weight:700 !important;/)
  assert.match(opening, /\.side\[data-open-domain\]\{[\s\S]*?color:rgba\(210,246,250,\.9\) !important;[\s\S]*?font-size:8\.5px !important;[\s\S]*?font-weight:700 !important;[\s\S]*?opacity:\.92 !important;/)
  assert.match(opening, /\.home-action-label\{[\s\S]*?text-shadow:[\s\S]*?rgba\(32,216,236,\.62\)/)
  assert.match(opening, /\.chat-dock\.open\{[\s\S]*?bottom:clamp\(18px, 4vh, 36px\) !important;/)
  assert.match(opening, /\.chat-title\{[\s\S]*?font-size:14px !important;[\s\S]*?font-weight:800 !important;/)
  assert.match(opening, /\.chat-bubble\{[\s\S]*?line-height:1\.55 !important;/)
  assert.match(opening, /\.chat-input:focus\{[\s\S]*?border-color:rgba\(143,252,255,\.78\) !important;/)
  assert.match(opening, /\.chat-send\{[\s\S]*?min-height:48px !important;/)
})

test('v2.77 balances the mobile rail and desktop reactor composition', () => {
  assert.match(opening, /PHOENIX v2\.77: MODULE RAIL \+ REACTOR BALANCE/)
  for (const label of ['ENTER FINANCE', 'OPEN TRAINING', 'PLAN NUTRITION', 'VIEW CALENDAR']) {
    assert.match(opening, new RegExp(label))
  }
  assert.match(opening, /@media \(min-width:721px\)[\s\S]*?\.orbit\{[\s\S]*?width:min\(49vw, 56vh, 650px\) !important;/)
  assert.match(opening, /@media \(min-width:721px\)[\s\S]*?\.name\{[\s\S]*?font-size:clamp\(34px, 3\.5vw, 52px\) !important;/)
  assert.match(opening, /@media \(max-width:720px\)[\s\S]*?\.side\[data-open-domain\]\{[\s\S]*?top:46px !important;[\s\S]*?height:34px !important;/)
  assert.match(opening, /\.side\[data-open-domain="finance"\]\{ left:0 !important;/)
  assert.match(opening, /\.side\[data-open-domain="calendar"\]\{ left:75% !important;/)
})
