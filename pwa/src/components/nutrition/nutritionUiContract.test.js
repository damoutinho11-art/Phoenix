import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('nutrition dashboard uses the Finance and Training grade command presentation shell', async () => {
  const source = await readFile(new URL('./NutritionDashboard.jsx', import.meta.url), 'utf8')

  for (const token of [
    'CockpitShell',
    'DataPanel',
    'StatusChip',
    'SourceStamp',
    'phx-command-hero',
    'NUTRITION',
    'COMMAND CENTER',
    'FUEL CORE',
    'phx-core-card',
    'phx-nutrition-primary-actions',
    'phx-nutrition-mode-tabs',
    'Finished Nutrition Outputs',
    'Daily Fuel Graph',
    'Macro Progress',
    'Week Rhythm',
    'Choose Next Meal',
    'MealChoiceDeck',
    'phx-nutrition-choice-deck',
    'phx-nutrition-route-grid-clean',
    'TODAY PROTOCOL',
    'MEALS',
    'TRENDS',
    'MEMORY',
    'PANTRY',
    'RECIPES',
  ]) assert.match(source, new RegExp(token))

  assert.doesNotMatch(source, /Weekly Prep|onWeeklyPlanner/)
})

test('nutrition cockpit keeps safety language claim-free', async () => {
  const source = (await readFile(new URL('./NutritionDashboard.jsx', import.meta.url), 'utf8')).toLowerCase()

  for (const forbidden of [
    'bulletproof',
    'heal your',
    'safe for everyone',
    'guaranteed',
    'fix pelvic tilt',
  ]) assert.equal(source.includes(forbidden), false)
})

test('every nutrition surface uses the green identity palette', async () => {
  const files = [
    'NutritionDashboard.jsx', 'TodayProtocol.jsx', 'ShoppingList.jsx',
    'LogMeal.jsx', 'MealBuilder.jsx', 'NutritionMemory.jsx',
    'WeightHistory.jsx', 'RecipeList.jsx', 'WeeklyPlanner.jsx',
    'DayPlanner.jsx', 'CalendarNutritionBridge.jsx',
    'NutritionAcceptanceGate.jsx', 'nutriHud.jsx',
  ]
  const sources = await Promise.all(
    files.map(file => readFile(new URL(`./${file}`, import.meta.url), 'utf8'))
  )
  for (const source of sources) {
    assert.equal(source.includes('#ff9f43'), false)
    assert.equal(source.includes('#ffd166'), false)
    assert.equal(source.includes('rgba(255,209,102'), false)
  }

  const css = await readFile(new URL('../cockpit/cockpit.css', import.meta.url), 'utf8')
  assert.match(css, /--phx-nutrition-green: #9dff6f/)
  assert.doesNotMatch(css, /--phx-nutrition-orange/)
  assert.doesNotMatch(css, /--phx-nutrition-gold/)
  assert.doesNotMatch(css, /rgba\(255,\s*159,\s*67/)
})

test('today protocol is a routed green operational surface with truthful command boundaries', async () => {
  const base = new URL('.', import.meta.url)
  const [protocol, flow, model, dashboard, app, holoCommand, holoDomains, client, css] = await Promise.all([
    readFile(new URL('./TodayProtocol.jsx', base), 'utf8'),
    readFile(new URL('./todayProtocolFlow.js', base), 'utf8'),
    readFile(new URL('./todayProtocolModel.js', base), 'utf8'),
    readFile(new URL('./NutritionDashboard.jsx', base), 'utf8'),
    readFile(new URL('../../App.jsx', base), 'utf8'),
    readFile(new URL('../holo/HoloCommand.jsx', base), 'utf8'),
    readFile(new URL('../holo/holoDomains.js', base), 'utf8'),
    readFile(new URL('../../api/client.js', base), 'utf8'),
    readFile(new URL('../cockpit/cockpit.css', base), 'utf8'),
  ])

  for (const token of [
    'getTodayProtocol',
    'getRecompositionReview',
    'postTodayProtocolReplan',
    'postTodayProtocolLogMeal',
    'FIBRE MIN',
    'EAT &amp; LOG',
    'REPLACE',
    'ADJUST PORTION',
    'SKIP',
    'CONFIRM LOG',
    'quantityLabel',
    'sourceLabel',
    'phx-today-protocol-meal-grid',
    'phx-today-protocol-command-grid',
    "tone={model.targetMatched ? 'ready' : 'caution'}",
    "tone={meal.portable ? 'caution' : 'verified'}",
  ]) assert.equal(protocol.includes(token), true)

  assert.match(flow, /Promise\.allSettled/)
  assert.match(flow, /Protocol changed\. Refresh before continuing\./)

  for (const token of ['MEASUREMENT UNVERIFIED', 'REFERENCE ESTIMATE', 'INVENTORY ESTIMATE', 'PRODUCT LABEL']) {
    assert.equal(model.includes(token), true)
  }

  assert.equal(protocol.includes('LOG FULL PLAN'), false)
  assert.match(dashboard, /TODAY PROTOCOL/)
  assert.match(dashboard, /onTodayProtocol/)
  assert.match(app, /todayProtocol/)
  assert.match(app, /TodayProtocol/)
  assert.match(holoCommand, /TodayProtocol/)
  assert.match(holoCommand, /sub === 'today-protocol'/)
  assert.match(holoDomains, /TODAY PROTOCOL/)
  assert.match(holoDomains, /sub: 'today-protocol'/)
  assert.doesNotMatch(dashboard, /PLAN DAY/)
  assert.doesNotMatch(app, /DayPlanner/)

  for (const token of [
    '/nutrition/today-protocol',
    '/nutrition/recomposition-review',
    '/nutrition/today-protocol/replan',
    '/nutrition/today-protocol/log-meal',
    "method: 'POST'",
    "'Content-Type': 'application/json'",
  ]) assert.match(client, new RegExp(token))

  for (const token of [
    '--phx-nutrition-green: #9dff6f',
    '--phx-nutrition-green-bright: #d5ffc7',
    '.phx-today-protocol-meal-grid',
    'grid-template-columns: repeat(2, minmax(0, 1fr))',
    '.phx-today-protocol-command-grid',
    'grid-template-columns: repeat(4, minmax(0, 1fr))',
    '@media (max-width: 520px)',
  ]) assert.equal(css.includes(token), true)
})
