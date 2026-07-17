const BASE_URL = (import.meta.env?.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

async function apiFetch(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options)
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const detail = payload?.detail || payload?.message || payload || `HTTP ${response.status}`
    throw new Error(detail)
  }
  return payload
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

export async function getFinanceManualBuyChecklist() {
  return apiFetch('/finance/manual-buy-checklist')
}

export async function getFinanceDataCoverage() {
  return apiFetch('/finance/data-coverage')
}

export async function getCalendarSnapshot() {
  return apiFetch('/calendar/snapshot')
}

export async function getCalendarPlaanLiveStatus() {
  return apiFetch('/calendar/plaan-live/status')
}

export async function getCalendarPlaanLivePreview() {
  return apiFetch('/calendar/plaan-live/preview')
}

export async function getConnectorsStatus() {
  return apiFetch('/calendar/connectors/status')
}

export async function getGoogleCalendarStatus() {
  return apiFetch('/calendar/google/status')
}

export async function getGoogleCalendarPreview(days = 14) {
  return apiFetch(`/calendar/google/preview?days=${encodeURIComponent(days)}`)
}

export async function getGmailStatus() {
  return apiFetch('/gmail/status')
}

export async function searchGmail(query, maxResults = 10) {
  const params = new URLSearchParams({ max_results: String(maxResults) })
  if (query) params.set('q', query)
  return apiFetch(`/gmail/search?${params.toString()}`)
}

export async function getUnifiedCalendar(days = 14) {
  return apiFetch(`/calendar/unified?days=${encodeURIComponent(days)}`)
}

export async function disconnectGoogle() {
  return apiFetch('/auth/google/disconnect', { method: 'POST' })
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

export const getTrainingCurrentPlan = () => apiFetch('/training/plan/current')

export const getTrainingPlanProposal = id => apiFetch(`/training/plan/proposals/${encodeURIComponent(id)}`)

export const postTrainingPlanProposal = payload => apiFetch('/training/plan/proposals', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})

export const applyTrainingPlanProposal = id => apiFetch(`/training/plan/proposals/${encodeURIComponent(id)}/apply`, { method: 'POST' })

export const rejectTrainingPlanProposal = id => apiFetch(`/training/plan/proposals/${encodeURIComponent(id)}/reject`, { method: 'POST' })

export const getTrainingPlanHistory = () => apiFetch('/training/plans/history')

export const getTrainingRules = () => apiFetch('/training/rules')

export async function getTrainingRoutedSession({ explicitReset = false } = {}) {
  return apiFetch(`/training/routed-session${explicitReset ? '?explicit_reset=true' : ''}`)
}

export async function postTrainingReadinessScan(payload) {
  return apiFetch('/training/readiness-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function postTrainingCapacityBlock(payload) {
  return apiFetch('/training/log/capacity-block', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function postTrainingJumpBalance(payload) {
  return apiFetch('/training/log/jump-balance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
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

export async function getRecentMeals(limit = 20) {
  return apiFetch(`/nutrition/log/meals/recent?limit=${limit}`)
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

export async function getJarvisAiStatus() {
  return apiFetch('/jarvis/ai/status')
}

export async function getJarvisActivity() {
  return apiFetch('/jarvis/activity')
}

export async function getNewsStatus() {
  return apiFetch('/news/status')
}

export async function getNewsHeadlines(topic = 'home', limit = 5) {
  return apiFetch(`/news/headlines?topic=${encodeURIComponent(topic)}&limit=${limit}`)
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

export async function getFinancePortfolioState() {
  return apiFetch('/finance/portfolio-state')
}

export async function getFinancePnl() {
  return apiFetch('/finance/pnl')
}

export async function postFinanceRefreshPrices() {
  return apiFetch('/finance/refresh-prices', { method: 'POST' })
}

export async function getFinanceBriefHistory() {
  return apiFetch('/finance/brief/history')
}

export async function getFinancePerformanceHistory() {
  return apiFetch('/finance/performance/history')
}

export async function getFinanceResearchMemos() {
  return apiFetch('/finance/research/memos')
}

export async function getFinanceResearchMemo(memoId) {
  return apiFetch(`/finance/research/memos/${memoId}`)
}

export async function postFinanceResearchMemo(payload) {
  return apiFetch('/finance/research/memos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function postFinanceResearchMemoQualityGate(memoId) {
  return apiFetch(`/finance/research/memos/${memoId}/quality-gate`, { method: 'POST' })
}

export async function postFinanceResearchQualityGateAll() {
  return apiFetch('/finance/research/quality-gate/run', { method: 'POST' })
}

export async function postFinanceResearchSynthesizeMemo(memoId, runQualityGateAfter = false) {
  return apiFetch(`/finance/research/memos/${memoId}/synthesize-from-evidence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_quality_gate_after: runQualityGateAfter }),
  })
}

export async function postFinanceResearchGenerateEvidence(memoId, runQualityGateAfter = false) {
  return apiFetch(`/finance/research/memos/${memoId}/generate-evidence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_quality_gate_after: runQualityGateAfter }),
  })
}

export async function postFinanceResearchDraftMemo(payload) {
  return apiFetch('/finance/research/draft-memo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function getFinanceResearchValidationRecords() {
  return apiFetch('/finance/research/validation-records')
}

export async function getFinanceResearchValidationRecord(recordId) {
  return apiFetch(`/finance/research/validation-records/${recordId}`)
}

export async function postFinanceResearchValidationRecord(payload) {
  return apiFetch('/finance/research/validation-records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function postFinanceResearchMemoAutopilot(memoId) {
  return apiFetch(`/finance/research/memos/${memoId}/autopilot`, { method: 'POST' })
}

export async function deleteFinanceResearchMemo(memoId) {
  return apiFetch(`/finance/research/memos/${memoId}`, { method: 'DELETE' })
}

export async function postFinanceResearchAutopilotRun() {
  return apiFetch('/finance/research/autopilot/run', { method: 'POST' })
}

export async function postBriefAction(briefId, action) {
  return apiFetch(`/finance/brief/${briefId}/${action}`, { method: 'POST' })
}

export async function deleteBrief(briefId) {
  return apiFetch(`/finance/brief/${briefId}`, { method: 'DELETE' })
}

export async function deletePerformanceSnapshot(snapshotId) {
  return apiFetch(`/finance/performance/snapshot/${snapshotId}`, { method: 'DELETE' })
}

export async function getFinanceLedger() {
  return apiFetch('/finance/ledger')
}

export async function postManualFinanceTransaction(payload) {
  return apiFetch('/finance/ledger/manual-transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function logSleep(eventType) {
  return apiFetch('/training/log/sleep', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: eventType }),
  })
}

export async function logSleepDuration(minutes) {
  return apiFetch('/training/log/sleep-duration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ minutes }),
  })
}

export async function getLastSleep() {
  return apiFetch('/training/sleep/last')
}

export async function getTrainingRecovery() {
  return apiFetch('/training/recovery')
}

export async function logSoreness(score) {
  return apiFetch('/training/log/soreness', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score }),
  })
}

export async function logSession(payload) {
  return apiFetch('/training/log/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function parseBudgetTransactions(rawText) {
  return apiFetch('/budget/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_text: rawText, source: 'text' }),
  })
}

export async function parseBudgetPdf(file) {
  const formData = new FormData()
  formData.append('file', file)
  return apiFetch('/budget/parse-pdf', {
    method: 'POST',
    body: formData,
  })
}

export async function saveBudgetTransactions(transactions) {
  return apiFetch('/budget/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions }),
  })
}

export async function getBudgetSummary(month) {
  return apiFetch(`/budget/summary?month=${month}`)
}

export async function getBudgetTransactions(month) {
  return apiFetch(`/budget/transactions?month=${month}`)
}

export async function getBudgetMonths() {
  return apiFetch('/budget/months')
}

export async function getFinanceTransactionApplyPreview(transactionId) {
  return apiFetch(`/finance/ledger/${transactionId}/apply-preview`)
}

export async function postFinanceTransactionApply(transactionId) {
  return apiFetch(`/finance/ledger/${transactionId}/apply`, { method: 'POST' })
}

export async function postFinanceTransactionVoid(transactionId, reason) {
  return apiFetch(`/finance/ledger/${transactionId}/void`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason || 'Manual void by user' }),
  })
}

export async function postFinancePatchUnits(asset, units, holdingsEur, reason) {
  return apiFetch('/finance/portfolio-state/patch-units', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asset,
      units,
      holdings_eur: holdingsEur != null ? holdingsEur : undefined,
      reason: reason || 'Manual data correction',
    }),
  })
}

export async function getNutritionMealBuilder() {
  return apiFetch('/nutrition/meal-builder')
}

export async function logBuiltMeal(payloadOrSuggestionId) {
  const payload = typeof payloadOrSuggestionId === 'string'
    ? { suggestion_id: payloadOrSuggestionId }
    : payloadOrSuggestionId
  return apiFetch('/nutrition/log/built-meal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function getNutritionDayPlan() {
  return apiFetch('/nutrition/day-plan')
}

export async function logDayPlan(payload) {
  return apiFetch('/nutrition/log/day-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function getNutritionMemory(kind) {
  const query = kind ? `?kind=${encodeURIComponent(kind)}` : ''
  return apiFetch(`/nutrition/memory${query}`)
}

export async function saveNutritionMemory(payload) {
  return apiFetch('/nutrition/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function deleteNutritionMemory(memoryId) {
  return apiFetch(`/nutrition/memory/${memoryId}`, { method: 'DELETE' })
}

export async function getRepeatYesterdayPreview() {
  return apiFetch('/nutrition/repeat/yesterday')
}

export async function logRepeatYesterday() {
  return apiFetch('/nutrition/log/repeat-yesterday', { method: 'POST' })
}

export async function getNutritionShoppingList(source = 'day_plan', suggestionId = '') {
  const params = new URLSearchParams({ source })
  if (suggestionId) params.set('suggestion_id', suggestionId)
  return apiFetch(`/nutrition/shopping-list?${params.toString()}`)
}

export async function getNutritionWeeklyPlan(days = 7, startDate = '') {
  const params = new URLSearchParams({ days: String(days) })
  if (startDate) params.set('start_date', startDate)
  return apiFetch(`/nutrition/weekly-plan?${params.toString()}`)
}

export async function logWeeklyPlan(payload) {
  return apiFetch('/nutrition/log/weekly-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function getNutritionAcceptanceGate() {
  return apiFetch('/nutrition/acceptance-gate')
}

export async function getNutritionCalendarBridge(days = 7, startDate = '') {
  const params = new URLSearchParams({ days: String(days) })
  if (startDate) params.set('start_date', startDate)
  return apiFetch(`/nutrition/calendar-bridge?${params.toString()}`)
}

export async function getCalendarPlaanLatestImport() {
  return apiFetch('/calendar/plaan-live/imports/latest')
}

export async function importCalendarPlaanSnapshot({ snapshot, label = 'manual Plaan snapshot', source = 'manual_paste' }) {
  return apiFetch('/calendar/plaan-live/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot, label, source }),
  })
}

export async function importPlaanExcel(file, label = 'manual Plaan Excel import') {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('label', label)
  return apiFetch('/calendar/plaan-live/import/excel', {
    method: 'POST',
    body: formData,
  })
}

export async function getCalendarFeedStatus() {
  return apiFetch('/calendar/feed/status')
}

export async function getBudgetMemory() {
  return apiFetch('/budget/memory')
}

export async function saveBudgetMemory(profile) {
  return apiFetch('/budget/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile }),
  })
}
