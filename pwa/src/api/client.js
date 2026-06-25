const BASE_URL = 'http://localhost:8000'

async function apiFetch(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export async function getHealth() {
  return apiFetch('/health')
}

export async function getFinanceSummary() {
  return apiFetch('/finance/summary')
}

export async function getFinanceRecommendation() {
  return apiFetch('/finance/recommendation')
}

export async function getCalendarSnapshot() {
  return apiFetch('/calendar/snapshot')
}

export async function getFinanceBrief() {
  return apiFetch('/finance/brief')
}

export async function getTrainingStatus() {
  return apiFetch('/training/status')
}

export async function getTrainingBrief() {
  return apiFetch('/training/brief')
}

export async function getTrainingHistory() {
  return apiFetch('/training/history')
}

export async function logJump({ date, jump_type, height_cm, notes }) {
  return apiFetch('/training/log/jump', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, jump_type, height_cm, notes }),
  })
}

export async function getNutritionStatus() {
  return apiFetch('/nutrition/status')
}

export async function getRecipes(params = {}) {
  const q = new URLSearchParams(params).toString()
  return apiFetch(`/nutrition/recipes${q ? '?' + q : ''}`)
}

export async function getLidlStaples() {
  return apiFetch('/nutrition/staples')
}

export async function getNutritionBrief() {
  return apiFetch('/nutrition/brief')
}

export async function getCrossDomainAlerts() {
  return apiFetch('/cross-domain/alerts')
}

export async function logMeal(item) {
  return apiFetch('/nutrition/log/meal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  })
}

export async function deleteMeal(mealId) {
  return apiFetch(`/nutrition/log/meal/${mealId}`, { method: 'DELETE' })
}

export async function logWeight(weightKg) {
  return apiFetch('/nutrition/log/weight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weight_kg: weightKg }),
  })
}

export async function lookupBarcode(barcode) {
  return apiFetch(`/barcode/lookup/${encodeURIComponent(barcode)}`)
}

export async function getWeightHistory(days = 30) {
  return apiFetch(`/nutrition/log/weight/history?days=${days}`)
}

export async function postJarvisChat({ message, domain = 'home', history = [] }) {
  return apiFetch('/jarvis/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, domain, history }),
  })
}

export async function getMealHistory(days = 14) {
  return apiFetch(`/nutrition/log/meals/history?days=${days}`)
}

export async function getFinanceHoldings() {
  return apiFetch('/finance/holdings')
}

export async function postFinanceRefreshPrices() {
  return apiFetch('/finance/refresh-prices', { method: 'POST' })
}

export async function getFinanceBriefHistory() {
  return apiFetch('/finance/brief/history')
}

export async function postBriefAction(briefId, action) {
  return apiFetch(`/finance/brief/${briefId}/${action}`, { method: 'POST' })
}

export async function logSession(payload) {
  return apiFetch('/training/log/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
