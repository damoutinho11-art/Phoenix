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
        { item_id: 'yogurt', name: 'Yogurt', quantity_g: 127.5, unit_count: 1.5, measurement_state: 'as_served', is_estimate: false },
      ],
    }],
  })

  assert.equal(model.protocolId, 'protocol-123')
  assert.deepEqual(model.target, { calories: 2600, protein_g: 175, carbs_g: 315, fat_g: 70 })
  assert.deepEqual(model.targetGap, { calories: 12, protein_g: -1.5 })
  assert.equal(model.meals.length, 1)
  assert.equal(model.meals[0].items[0].quantityLabel, '85 g · as served')
  assert.equal(model.meals[0].items[0].sourceLabel, 'REFERENCE ESTIMATE')
  assert.equal(model.meals[0].items[1].quantityLabel, '127.5 g · 1.5 UNIT · as served')
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

test('today protocol model exposes honest estimate provenance and safe source links', () => {
  const model = buildTodayProtocolModel({
    nutrition_basis: 'estimated',
    fibre_complete: false,
    planned_total: { fibre_g: 18.4 },
    target_matched: true,
    meals: [{
      meal_id: 'lunch',
      total: { fibre_g: 6.2 },
      items: [
        {
          item_id: 'chicken', name: 'Chicken', quantity_g: 150,
          measurement_state: 'raw', is_estimate: true,
          label_state: 'reference_estimate', fibre_known: true,
          source_url: 'https://fdc.nal.usda.gov/food-details/171077/nutrients',
          fibre_source_url: 'javascript:alert(1)',
        },
        {
          item_id: 'wrap', name: 'Wrap', quantity_g: 60,
          measurement_state: 'unknown', is_estimate: true,
          label_state: 'inventory_estimate', fibre_known: false,
          source_url: 'http://unsafe.example/wrap',
        },
      ],
    }],
  })

  assert.equal(model.nutritionBasis, 'estimated')
  assert.equal(model.fibreComplete, false)
  assert.equal(model.plannedTotal.fibre_g, 18.4)
  assert.equal(model.meals[0].items[0].sourceLabel, 'REFERENCE ESTIMATE')
  assert.deepEqual(model.meals[0].items[0].sourceLinks, [
    { label: 'NUTRITION SOURCE', href: 'https://fdc.nal.usda.gov/food-details/171077/nutrients' },
  ])
  assert.equal(model.meals[0].items[1].sourceLabel, 'INVENTORY ESTIMATE')
  assert.deepEqual(model.meals[0].items[1].sourceLinks, [])
  assert.equal(model.meals[0].items[1].measurementVerified, false)
  assert.equal(model.meals[0].fibreLabel, 'AT LEAST 6.2 G FIBRE')
})

test('today protocol model marks complete meal fibre as estimated', () => {
  const model = buildTodayProtocolModel({
    fibre_complete: true,
    meals: [{
      meal_id: 'breakfast',
      total: { fibre_g: 7 },
      items: [{ item_id: 'oats', fibre_known: true }],
    }],
  })

  assert.equal(model.meals[0].fibreLabel, '7 G FIBRE (EST.)')
})

test('today protocol model defaults nutrition provenance to estimated unless explicitly labelled', () => {
  assert.equal(buildTodayProtocolModel({}).nutritionBasis, 'estimated')
  assert.equal(buildTodayProtocolModel({ nutrition_basis: 'labelled' }).nutritionBasis, 'labelled')
})
