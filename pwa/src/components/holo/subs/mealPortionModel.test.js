import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  gramBasis,
  basisHint,
  supportsGrams,
  scaleToGrams,
  scaleToServings,
  searchFoods,
  barcodeFood,
  buildRepeatPayload,
  buildGramPayload,
  buildServingPayload,
  buildCustomPayload,
} from './mealPortionModel.js'

// Real staple rows from GET /nutrition/staples.
const CHICKEN = {
  id: 'lidl_001', name: 'Chicken Breast', unit: '100g',
  calories: 165, protein_g: 31.0, fat_g: 3.6, carbs_g: 0.0,
}
const EGG = {
  id: 'lidl_002', name: 'Eggs', unit: '1 egg (60g)',
  calories: 78, protein_g: 6.0, fat_g: 5.0, carbs_g: 0.6,
}
// Real recipe row from GET /nutrition/recipes.
const PIE = {
  id: 'recipe_001', name: 'Anabolic Apple Pie Breakfast Bake',
  serving: '1 of 6 servings', serving_count: 6, is_batch_recipe: true,
  calories: 541.7, protein_g: 44.2, fat_g: 2.8, carbs_g: 74,
}

// Every distinct `unit` string across the live 60-staple inventory.
const REAL_UNITS = [
  ['100g', 100], ['100g dry', 100], ['100g drained', 100], ['100g raw', 100],
  ['100ml', 100], ['250ml', 250], ['30g', 30],
  ['1 egg (60g)', 60], ['1 can (160g)', 160], ['1 slice (19g)', 19],
  ['1 slice (40g)', 40], ['1 medium (120g)', 120], ['1 medium (130g)', 130],
  ['1 medium (182g)', 182], ['1 whole (150g)', 150], ['1 whole (160g)', 160],
  ['1 scoop (33g)', 33], ['1 cake (9g)', 9], ['1 cake (7g)', 7],
  ['1 wrap (62g)', 62], ['1 tbsp (14g)', 14], ['1 tbsp (16g)', 16],
]

test('gramBasis resolves every unit string in the live staple inventory', () => {
  for (const [unit, expected] of REAL_UNITS) {
    assert.equal(gramBasis(unit), expected, `unit ${unit}`)
  }
})

test('gramBasis prefers the parenthesised weight over a leading count', () => {
  // "1 egg (60g)" must be 60g, never 1g — this is the whole reason piece units
  // cannot be parsed with a naive leading-number match.
  assert.equal(gramBasis('1 egg (60g)'), 60)
  assert.equal(gramBasis('1 tbsp (16g)'), 16)
})

test('gramBasis returns null when no weight can be read', () => {
  for (const unit of [undefined, null, '', 'per serving', '1 handful', 42, {}]) {
    assert.equal(gramBasis(unit), null, `unit ${JSON.stringify(unit)}`)
  }
})

test('supportsGrams separates weighable staples from portion-only recipes', () => {
  assert.equal(supportsGrams(CHICKEN), true)
  assert.equal(supportsGrams(EGG), true)
  assert.equal(supportsGrams(PIE), false)
})

test('basisHint explains piece units and stays quiet for plain weights', () => {
  assert.equal(basisHint('1 egg (60g)'), '1 egg = 60 g')
  assert.equal(basisHint('1 scoop (33g)'), '1 scoop = 33 g')
  assert.equal(basisHint('100g'), null)
})

test('scaleToGrams computes macros for a typed gram amount', () => {
  // 180 g of chicken breast against a 100 g basis.
  assert.deepEqual(scaleToGrams(CHICKEN, 180), {
    calories: 297, protein_g: 55.8, fat_g: 6.5, carbs_g: 0,
  })
})

test('scaleToGrams honours a piece-based basis', () => {
  // 120 g of egg is two 60 g eggs.
  assert.deepEqual(scaleToGrams(EGG, 120), {
    calories: 156, protein_g: 12, fat_g: 10, carbs_g: 1.2,
  })
})

test('scaleToGrams accepts a comma decimal and string input', () => {
  assert.deepEqual(scaleToGrams(CHICKEN, '50'), {
    calories: 82.5, protein_g: 15.5, fat_g: 1.8, carbs_g: 0,
  })
})

test('scaleToGrams refuses amounts that would log nothing or nonsense', () => {
  for (const grams of [0, -20, 'abc', null, undefined, NaN]) {
    assert.equal(scaleToGrams(CHICKEN, grams), null, `grams ${grams}`)
  }
})

test('scaleToGrams refuses a food with no gram basis', () => {
  assert.equal(scaleToGrams(PIE, 100), null)
})

test('scaleToServings scales recipe portions', () => {
  assert.deepEqual(scaleToServings(PIE, 2), {
    calories: 1083.4, protein_g: 88.4, fat_g: 5.6, carbs_g: 148,
  })
  assert.deepEqual(scaleToServings(PIE, 0.5), {
    calories: 270.9, protein_g: 22.1, fat_g: 1.4, carbs_g: 37,
  })
  assert.equal(scaleToServings(PIE, 0), null)
})

test('searchFoods matches across staples and recipes', () => {
  const found = searchFoods('apple', { staples: [CHICKEN, EGG], recipes: [PIE] })
  assert.equal(found.length, 1)
  assert.equal(found[0].id, 'recipe_001')
  assert.equal(found[0].kind, 'recipe')
})

test('searchFoods ranks prefix matches above mid-string matches', () => {
  const grilled = { id: 'x', name: 'Grilled Chicken Wrap', unit: '100g', calories: 1, protein_g: 1, fat_g: 1, carbs_g: 1 }
  const found = searchFoods('chick', { staples: [grilled, CHICKEN] })
  assert.equal(found[0].name, 'Chicken Breast')
})

test('searchFoods with an empty query returns the browsable inventory', () => {
  const found = searchFoods('', { staples: [CHICKEN, EGG], recipes: [PIE] })
  assert.equal(found.length, 3)
  assert.equal(found[0].kind, 'staple')
})

test('buildGramPayload keeps per-item provenance instead of one opaque blob', () => {
  const payload = buildGramPayload({ ...CHICKEN, kind: 'staple' }, 180)
  assert.equal(payload.item_id, 'lidl_001')
  assert.equal(payload.item_type, 'staple')
  assert.equal(payload.source, 'lidl_staple')
  assert.equal(payload.name, 'Chicken Breast · 180g')
  assert.equal(payload.servings, 1.8)
  assert.equal(payload.calories, 297)
  assert.equal(payload.protein_g, 55.8)
})

test('buildGramPayload tags scanned products as barcode-sourced', () => {
  const scanned = { id: 'barcode-5000', name: 'Skyr', unit: '100g', calories: 63, protein_g: 11, fat_g: 0.2, carbs_g: 4, kind: 'barcode' }
  const payload = buildGramPayload(scanned, 200)
  assert.equal(payload.item_type, 'barcode')
  assert.equal(payload.source, 'barcode')
  assert.equal(payload.calories, 126)
})

test('buildServingPayload labels multi-serving logs', () => {
  assert.equal(buildServingPayload(PIE, 1).name, 'Anabolic Apple Pie Breakfast Bake')
  assert.equal(buildServingPayload(PIE, 2).name, 'Anabolic Apple Pie Breakfast Bake · ×2')
  assert.equal(buildServingPayload(PIE, 2).item_type, 'recipe')
})

test('buildCustomPayload requires a name and complete macros', () => {
  const ok = buildCustomPayload({ name: 'Mum lasagna', calories: 640, protein_g: 38, fat_g: 24, carbs_g: 61 })
  assert.equal(ok.item_type, 'custom')
  assert.equal(ok.source, 'custom_manual')
  assert.equal(ok.name, 'Mum lasagna')
  assert.equal(ok.servings, 1)
  assert.ok(ok.item_id.startsWith('custom-'))

  assert.equal(buildCustomPayload({ name: '  ', calories: 1, protein_g: 1, fat_g: 1, carbs_g: 1 }), null)
  assert.equal(buildCustomPayload({ name: 'X', calories: 1, protein_g: 1, fat_g: 1 }), null)
  assert.equal(buildCustomPayload({ name: 'X', calories: -1, protein_g: 1, fat_g: 1, carbs_g: 1 }), null)
})

test('buildGramPayload refuses to build from an unusable amount', () => {
  assert.equal(buildGramPayload({ ...CHICKEN, kind: 'staple' }, 0), null)
})

test('buildGramPayload reports the real portion, not a rounded one', () => {
  // 45 g of a 100 g basis is 0.45 servings; 0.5 would overstate what was eaten.
  const payload = buildGramPayload({ ...CHICKEN, kind: 'staple' }, 45)
  assert.equal(payload.servings, 0.45)
  assert.equal(buildGramPayload({ ...CHICKEN, kind: 'staple' }, 33).servings, 0.33)
  assert.equal(buildGramPayload({ ...EGG, kind: 'staple' }, 180).servings, 3)
})

// ── barcode ──────────────────────────────────────────────────────────────────

test('barcodeFood makes a per-100g product gram-scalable', () => {
  const food = barcodeFood({
    barcode: '4056489182634', name: 'Crownfield Cornflakes', macro_basis: '100g',
    calories: 379, protein_g: 7.5, fat_g: 1.4, carbs_g: 84, serving_size_g: 30,
  })
  assert.equal(food.unit, '100g')
  assert.equal(supportsGrams(food), true)
  assert.deepEqual(scaleToGrams(food, 60), {
    calories: 227.4, protein_g: 4.5, fat_g: 0.8, carbs_g: 50.4,
  })
})

test('barcodeFood uses the serving weight when macros are per serving', () => {
  const food = barcodeFood({
    barcode: '1', name: 'Cereal Bar', macro_basis: 'serving',
    calories: 114, protein_g: 2.3, fat_g: 0.4, carbs_g: 25.2, serving_size_g: 30,
  })
  assert.equal(food.unit, '1 serving (30g)')
  assert.equal(gramBasis(food.unit), 30)
  // 60 g is two 30 g servings, not 0.6 of a 100 g basis.
  assert.deepEqual(scaleToGrams(food, 60), {
    calories: 228, protein_g: 4.6, fat_g: 0.8, carbs_g: 50.4,
  })
})

test('barcodeFood refuses grams when a serving product has no weight', () => {
  // Scaling these by grams/100 would silently invent a portion.
  const food = barcodeFood({
    barcode: '2', name: 'Mystery Snack', macro_basis: 'serving',
    calories: 200, protein_g: 5, fat_g: 9, carbs_g: 22, serving_size_g: null,
  })
  assert.equal(food.unit, null)
  assert.equal(supportsGrams(food), false)
  assert.equal(scaleToGrams(food, 100), null)
  // One whole serving is still loggable.
  assert.deepEqual(scaleToServings(food, 1), {
    calories: 200, protein_g: 5, fat_g: 9, carbs_g: 22,
  })
})

test('barcodeFood rejects unusable products', () => {
  assert.equal(barcodeFood(null), null)
  assert.equal(barcodeFood({ name: '  ', macro_basis: '100g', calories: 1, protein_g: 1, fat_g: 1, carbs_g: 1 }), null)
  assert.equal(barcodeFood({ name: 'X', macro_basis: '100g', calories: 1, protein_g: 1, fat_g: 1 }), null)
})

test('barcode gram payload keeps barcode provenance', () => {
  const food = barcodeFood({
    barcode: '4056489182634', name: 'Crownfield Cornflakes', macro_basis: '100g',
    calories: 379, protein_g: 7.5, fat_g: 1.4, carbs_g: 84, serving_size_g: 30,
  })
  const payload = buildGramPayload(food, 60)
  assert.equal(payload.item_id, 'barcode-4056489182634')
  assert.equal(payload.item_type, 'barcode')
  assert.equal(payload.source, 'barcode')
  assert.equal(payload.name, 'Crownfield Cornflakes · 60g')
})

// ── repeat a recent meal ─────────────────────────────────────────────────────

test('buildRepeatPayload re-logs a recent meal exactly', () => {
  const recent = {
    id: 4, item_id: 'lidl_002', item_type: 'staple', name: 'Eggs · 180g',
    servings: 3, calories: 234, protein_g: 18, fat_g: 15, carbs_g: 1.8,
    source: 'lidl_staple',
  }
  const payload = buildRepeatPayload(recent)
  assert.equal(payload.item_id, 'lidl_002')
  assert.equal(payload.item_type, 'staple')
  assert.equal(payload.name, 'Eggs · 180g')
  assert.equal(payload.servings, 3)
  assert.equal(payload.calories, 234)
  assert.equal(payload.source, 'repeat')
})

test('buildRepeatPayload defaults a missing serving count to one', () => {
  const payload = buildRepeatPayload({
    item_id: 'custom-1', item_type: 'custom', name: 'Mum lasagna',
    calories: 640, protein_g: 38, fat_g: 24, carbs_g: 61,
  })
  assert.equal(payload.servings, 1)
  assert.equal(payload.item_type, 'custom')
})

test('buildRepeatPayload rejects rows it cannot reproduce', () => {
  assert.equal(buildRepeatPayload(null), null)
  assert.equal(buildRepeatPayload({ item_id: 'x', name: '', calories: 1, protein_g: 1, fat_g: 1, carbs_g: 1 }), null)
  assert.equal(buildRepeatPayload({ item_id: '', name: 'X', calories: 1, protein_g: 1, fat_g: 1, carbs_g: 1 }), null)
  assert.equal(buildRepeatPayload({ item_id: 'x', name: 'X', calories: 1, protein_g: 1 }), null)
})
