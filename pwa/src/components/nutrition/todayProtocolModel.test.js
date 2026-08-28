import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTodayProtocolModel } from './todayProtocolModel.js'

test('today protocol model normalizes exact quantities and source labels without changing the returned meal rows', () => {
  const model = buildTodayProtocolModel({
    protocol_id: 'protocol-123',
    target: { calories: 2600, protein_g: 175, carbs_g: 315, fat_g: 70 },
    target_gap: { calories: 12, protein_g: -1.5 },
    target_matched: true,
    meals: [{
      meal_id: 'breakfast',
      title: 'Breakfast',
      timing: '09:00',
      portable: false,
      total: { calories: 600, protein_g: 45, carbs_g: 80, fat_g: 14, fibre_g: 7 },
      items: [
        { item_id: 'cookie-crisp', name: 'Cookie Crisp', quantity_g: 85, measurement_state: 'as_served', is_estimate: true },
        { item_id: 'yogurt', name: 'Yogurt', quantity_g: 127.5, measurement_state: 'as_served', is_estimate: false },
      ],
    }],
  })

  assert.equal(model.protocolId, 'protocol-123')
  assert.deepEqual(model.target, { calories: 2600, protein_g: 175, carbs_g: 315, fat_g: 70 })
  assert.deepEqual(model.targetGap, { calories: 12, protein_g: -1.5 })
  assert.equal(model.meals.length, 1)
  assert.equal(model.meals[0].items[0].quantityLabel, '85 g · as served')
  assert.equal(model.meals[0].items[0].sourceLabel, 'GENERIC ESTIMATE')
  assert.equal(model.meals[0].items[1].quantityLabel, '127.5 g · as served')
  assert.equal(model.meals[0].items[1].sourceLabel, 'PRODUCT LABEL')
  assert.equal(model.measurementsVerified, true)
  assert.equal(model.targetMatched, true)
})

test('today protocol model marks incomplete measurements unverified and never calls the target matched', () => {
  const model = buildTodayProtocolModel({
    target_matched: true,
    meals: [{
      meal_id: 'dinner',
      title: 'Dinner',
      items: [{ item_id: 'pasta', name: 'Pasta', quantity_g: 'not-a-number', measurement_state: '' }],
    }],
  })

  assert.equal(model.meals[0].items[0].quantityLabel, 'MEASUREMENT UNVERIFIED')
  assert.equal(model.measurementsVerified, false)
  assert.equal(model.targetMatched, false)
})
