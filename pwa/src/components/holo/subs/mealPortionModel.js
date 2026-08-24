// ── NUTRITION // PORTION MODEL ──
// Pure helpers that turn a food-brain entry plus a user-entered portion into a
// loggable macro payload. Kept free of React so `node --test` can cover the
// arithmetic that decides what actually lands in the meal log.
//
// Two portion models exist because the food brain stores two different shapes:
//   • staples + barcode → macros quoted per a gram/ml basis ("100g", "1 egg (60g)")
//     so the natural input is grams.
//   • recipes → macros quoted per serving ("1 of 6 servings") with no gram
//     weight, so the natural input is a serving multiplier.

const PAREN_BASIS = /\((\d+(?:[.,]\d+)?)\s*(?:g|ml)\)/i
const LEADING_BASIS = /^(\d+(?:[.,]\d+)?)\s*(?:g|ml)\b/i

const MACRO_KEYS = ['calories', 'protein_g', 'fat_g', 'carbs_g']

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function round1(value) {
  return +value.toFixed(1)
}

// Servings keeps more precision than macros: a 45 g portion of a 100 g basis is
// 0.45, and rounding that to 0.5 would misreport the portion actually eaten.
function round2(value) {
  return +value.toFixed(2)
}

/**
 * Grams (or ml, treated 1:1) that a staple's quoted macros correspond to.
 * A parenthesised weight wins over a leading count so "1 egg (60g)" resolves to
 * 60 rather than 1.
 * Returns null when the unit carries no usable weight — the caller must then
 * fall back to serving-based entry instead of silently inventing a basis.
 */
export function gramBasis(unit) {
  if (typeof unit !== 'string') return null
  const paren = unit.match(PAREN_BASIS)
  if (paren) {
    const grams = toNumber(paren[1])
    return grams && grams > 0 ? grams : null
  }
  const leading = unit.match(LEADING_BASIS)
  if (leading) {
    const grams = toNumber(leading[1])
    return grams && grams > 0 ? grams : null
  }
  return null
}

/**
 * Human hint for a piece-based unit, e.g. "1 egg (60g)" → "1 egg = 60 g".
 * Returns null for plain weight units where the basis is already obvious.
 */
export function basisHint(unit) {
  if (typeof unit !== 'string') return null
  const paren = unit.match(PAREN_BASIS)
  if (!paren) return null
  const grams = toNumber(paren[1])
  if (!grams || grams <= 0) return null
  const label = unit.slice(0, paren.index).trim()
  return label ? `${label} = ${grams} g` : null
}

/** True when this food can be logged by typing grams. */
export function supportsGrams(item) {
  return gramBasis(item?.unit) !== null
}

/**
 * Scale per-basis macros to an arbitrary gram amount.
 * Returns null on a missing basis or a non-positive/invalid amount so the UI
 * can keep the log button disabled rather than posting zeros.
 */
export function scaleToGrams(item, grams) {
  const basis = gramBasis(item?.unit)
  const amount = toNumber(grams)
  if (basis === null || amount === null || amount <= 0) return null
  const factor = amount / basis
  const scaled = {}
  for (const key of MACRO_KEYS) {
    const base = toNumber(item?.[key]) ?? 0
    scaled[key] = round1(base * factor)
  }
  return scaled
}

/**
 * Scale per-serving macros by a serving multiplier (recipes).
 */
export function scaleToServings(item, servings) {
  const amount = toNumber(servings)
  if (amount === null || amount <= 0) return null
  const scaled = {}
  for (const key of MACRO_KEYS) {
    const base = toNumber(item?.[key]) ?? 0
    scaled[key] = round1(base * amount)
  }
  return scaled
}

/**
 * Merge staples and recipes into one searchable list.
 * Staples come first because gram entry is the faster path for whole foods.
 */
export function searchFoods(query, { staples = [], recipes = [] } = {}, limit = 40) {
  const tagged = [
    ...staples.map(s => ({ ...s, kind: 'staple' })),
    ...recipes.map(r => ({ ...r, kind: 'recipe' })),
  ]
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return tagged.slice(0, limit)
  const matches = tagged.filter(item => String(item.name ?? '').toLowerCase().includes(q))
  // Prefix matches rank above mid-string ones so "chick" surfaces "Chicken Breast".
  matches.sort((a, b) => {
    const ap = String(a.name ?? '').toLowerCase().startsWith(q) ? 0 : 1
    const bp = String(b.name ?? '').toLowerCase().startsWith(q) ? 0 : 1
    return ap - bp
  })
  return matches.slice(0, limit)
}

/**
 * Build the POST /nutrition/log/meal body for a gram-entered staple.
 * `servings` carries the real ratio so the backend keeps per-item fidelity
 * instead of receiving one opaque composed blob.
 */
export function buildGramPayload(item, grams) {
  const macros = scaleToGrams(item, grams)
  if (!macros) return null
  const basis = gramBasis(item.unit)
  const amount = toNumber(grams)
  return {
    item_id: String(item.id),
    item_type: item.kind === 'barcode' ? 'barcode' : 'staple',
    name: `${item.name} · ${amount}g`,
    servings: round2(amount / basis),
    ...macros,
    source: item.kind === 'barcode' ? 'barcode' : 'lidl_staple',
  }
}

/** Build the log body for a recipe logged by serving count. */
export function buildServingPayload(item, servings) {
  const macros = scaleToServings(item, servings)
  if (!macros) return null
  const amount = toNumber(servings)
  return {
    item_id: String(item.id),
    item_type: 'recipe',
    name: amount === 1 ? item.name : `${item.name} · ×${amount}`,
    servings: amount,
    ...macros,
    source: 'recipe',
  }
}

/**
 * Normalise a /barcode/lookup response into a food the composer can portion.
 *
 * The API states which basis its macros use. Only "100g" may be scaled by
 * grams; a serving-based product becomes gram-scalable solely when Open Food
 * Facts also gave a serving weight. Otherwise `unit` stays null, `supportsGrams`
 * is false, and the caller falls back to whole-serving entry rather than
 * pretending the numbers are per 100 g.
 */
export function barcodeFood(product) {
  const name = String(product?.name ?? '').trim()
  if (!name) return null
  const macros = {}
  for (const key of MACRO_KEYS) {
    const value = toNumber(product?.[key])
    if (value === null || value < 0) return null
    macros[key] = value
  }
  let unit = null
  if (product.macro_basis === '100g') {
    unit = '100g'
  } else if (product.macro_basis === 'serving') {
    const size = toNumber(product.serving_size_g)
    if (size !== null && size > 0) unit = `1 serving (${size}g)`
  }
  return {
    id: `barcode-${product.barcode ?? name}`,
    name,
    unit,
    kind: 'barcode',
    ...macros,
  }
}

/**
 * Re-log a row from /nutrition/log/meals/recent exactly as it was.
 * Its macros are already the scaled amount that was eaten, so they are copied
 * rather than re-derived.
 */
export function buildRepeatPayload(meal) {
  const name = String(meal?.name ?? '').trim()
  const itemId = String(meal?.item_id ?? '').trim()
  if (!name || !itemId) return null
  const macros = {}
  for (const key of MACRO_KEYS) {
    const value = toNumber(meal?.[key])
    if (value === null || value < 0) return null
    macros[key] = round1(value)
  }
  const servings = toNumber(meal?.servings)
  return {
    item_id: itemId,
    item_type: String(meal?.item_type || 'manual'),
    name,
    servings: servings !== null && servings > 0 ? servings : 1,
    ...macros,
    source: 'repeat',
  }
}

/** Build the log body for a hand-entered food. */
export function buildCustomPayload(custom) {
  const name = String(custom?.name ?? '').trim()
  if (!name) return null
  const macros = {}
  for (const key of MACRO_KEYS) {
    const value = toNumber(custom?.[key])
    if (value === null || value < 0) return null
    macros[key] = round1(value)
  }
  return {
    item_id: `custom-${Date.now()}`,
    item_type: 'custom',
    name,
    servings: 1,
    ...macros,
    source: 'custom_manual',
  }
}
