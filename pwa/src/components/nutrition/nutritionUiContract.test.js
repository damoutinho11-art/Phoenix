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
    'MEALS',
    'PLAN',
    'TARGETS',
    'HISTORY',
  ]) assert.match(source, new RegExp(token))
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
