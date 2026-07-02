import assert from 'node:assert/strict'
import test from 'node:test'
import { buildNutritionDashboardModel } from './nutritionDashboardModel.js'

const status = {
  phase: 'cut',
  is_training_day: true,
  adherence_status: 'warn',
  protein_target_met: false,
  target: { calories: 2400, protein_g: 165, carbs_g: 260, fat_g: 60 },
  logged: { total_calories: 1120, total_protein_g: 92, total_carbs_g: 118, total_fat_g: 31 },
  remaining_calories: 1280,
  remaining_protein_g: 73,
  remaining_carbs_g: 142,
  remaining_fat_g: 29,
  meal_log: [
    { id: 1, name: 'Skyr bowl', calories: 420, protein_g: 45, carbs_g: 48, fat_g: 8, servings: 1 },
    { id: 2, name: 'Chicken rice', calories: 700, protein_g: 47, carbs_g: 70, fat_g: 23, servings: 1 },
  ],
  memory: { favorite_count: 2, avoid_count: 1, pantry_count: 4 },
}

const historyData = {
  good_days: 3,
  logged_days: 5,
  history: [
    { has_data: true, adherence_status: 'good' },
    { has_data: true, adherence_status: 'warn' },
    { has_data: true, adherence_status: 'miss' },
    { has_data: false, adherence_status: null },
  ],
}

test('nutrition dashboard model derives command-center display state from logged data', () => {
  const model = buildNutritionDashboardModel(status, historyData)

  assert.equal(model.phaseLabel, 'CUT')
  assert.equal(model.dayLine, 'TRAINING DAY')
  assert.equal(model.logged.calories, 1120)
  assert.equal(model.target.calories, 2400)
  assert.equal(model.remaining.protein, 73)
  assert.equal(model.primarySignal, 'PARTIAL')
  assert.equal(model.nextStep, 'BUILD NEXT MEAL')
  assert.equal(model.commandProtocol.length, 4)
  assert.equal(model.macroMatrix.length, 3)
  assert.equal(model.historyMeta, '3 / 5')
  assert.equal(model.visibleDaysMeta, '5 / 7')
  assert.equal(model.calorieTimeline.checkpoints.length, 2)
  assert.equal(model.mealChoices.length, 3)
  assert.equal(model.mealChoices[0].title, 'Protein Bowl')
})

test('nutrition dashboard model remains safe on missing data', () => {
  const model = buildNutritionDashboardModel({}, {})

  assert.equal(model.logged.calories, 0)
  assert.equal(model.target.calories, 0)
  assert.equal(model.remaining.calories, 0)
  assert.equal(model.primarySignal, 'EMPTY')
  assert.equal(model.meals.length, 0)
  assert.equal(model.commandProtocol.at(-1).value, 'manual actions only')
  assert.equal(model.mealChoices.length, 3)
  assert.equal(model.calorieTimeline.checkpoints.length, 0)
})
