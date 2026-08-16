export const AUTHORITY_NUMERIC_FIELDS = [
  ['emergency_fund_floor_eur', 'EMERGENCY FLOOR EUR'],
  ['emergency_fund_balance_eur', 'EMERGENCY BALANCE EUR'],
  ['checking_buffer_eur', 'CHECKING BUFFER EUR'],
  ['food_budget_eur', 'FOOD BUDGET EUR'],
  ['essential_spending_ceiling_eur', 'ESSENTIAL CEILING EUR'],
  ['salary_day_cutoff', 'SALARY CUTOFF DAY'],
]

const CANONICAL_MONEY = /^(?:0|[1-9]\d*)\.\d{2}$/
const CANONICAL_CUTOFF = /^(?:[1-9]|[12]\d|3[01])$/
const TERMINAL_RECEIPT_ERROR = /submitted transactions do not match statement receipt|statement receipt has expired|statement receipt has already been consumed|statement receipt is missing or invalid/i

function exactCent(value) {
  return typeof value === 'number'
    && Number.isFinite(value)
    && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8
}

function canonicalMoneyDraft(value) {
  return exactCent(value) && value >= 0 ? value.toFixed(2) : ''
}

function billTitle(bill, index) {
  return typeof bill?.name === 'string' && bill.name.trim()
    ? bill.name.trim()
    : `Bill ${index + 1}`
}

function matchingTerms(value) {
  return typeof value === 'string'
    ? value.split(',').map(term => term.trim()).filter(Boolean)
    : []
}

function validCanonicalBill(bill) {
  return bill
    && typeof bill === 'object'
    && typeof bill.name === 'string'
    && bill.name.trim()
    && exactCent(bill.amount_eur)
    && bill.amount_eur >= 0
    && Array.isArray(bill.contains)
    && bill.contains.length > 0
    && bill.contains.every(term => typeof term === 'string' && term.trim())
    && typeof bill.enabled === 'boolean'
}

function legacyBillDrafts(bills) {
  if (Array.isArray(bills)) return bills
  if (typeof bills !== 'string') return null
  try {
    const parsed = JSON.parse(bills)
    if (!Array.isArray(parsed)) return null
    return parsed.map(bill => ({
      ...bill,
      amount_eur: typeof bill?.amount_eur === 'number'
        ? canonicalMoneyDraft(bill.amount_eur)
        : bill?.amount_eur,
      contains: Array.isArray(bill?.contains) ? bill.contains.join(', ') : bill?.contains,
    }))
  } catch {
    return null
  }
}

function displayList(value, limit = 25) {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => typeof item === 'string')
    .map(item => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, limit)
}

function displayNumber(value, { integer = false, signed = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  if (integer && (!Number.isInteger(value) || value < 0)) return '—'
  if (!integer && !exactCent(value)) return '—'
  if (!signed && value < 0) return '—'
  return integer ? String(value) : `EUR ${value.toFixed(2)}`
}

function displayDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '—'
}

export function createDefaultUtilityBill() {
  return {
    name: 'Utilities',
    amount_eur: '150.00',
    contains: 'utility, electric, water',
    enabled: true,
  }
}

export function preparePolicyEditor(profile, migrationRequired) {
  const source = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {}
  const bills = Array.isArray(source.recurring_obligations) && source.recurring_obligations.length
    ? source.recurring_obligations.map(bill => ({
      name: typeof bill?.name === 'string' ? bill.name : '',
      amount_eur: canonicalMoneyDraft(bill?.amount_eur),
      contains: Array.isArray(bill?.contains) ? bill.contains.filter(term => typeof term === 'string').join(', ') : '',
      enabled: bill?.enabled === true,
    }))
    : [createDefaultUtilityBill()]

  return {
    migrationRequired: migrationRequired === true,
    rawFields: Object.fromEntries(AUTHORITY_NUMERIC_FIELDS.map(([key]) => [
      key,
      key === 'salary_day_cutoff'
        ? (Number.isInteger(source[key]) && source[key] >= 1 && source[key] <= 31 ? String(source[key]) : '')
        : canonicalMoneyDraft(source[key]),
    ])),
    bills,
  }
}

export function validRecurringObligations(value) {
  return Array.isArray(value) && value.every(validCanonicalBill)
}

export function validateAuthorityPolicyDraft(profile, rawFields, bills) {
  const next = { ...profile }
  for (const [key, label] of AUTHORITY_NUMERIC_FIELDS.slice(0, -1)) {
    const raw = rawFields?.[key]
    if (typeof raw !== 'string' || !CANONICAL_MONEY.test(raw)) {
      return { ok: false, error: `${label} requires a canonical EUR amount.` }
    }
    const value = Number(raw)
    if (!Number.isFinite(value) || !exactCent(value)) {
      return { ok: false, error: `${label} requires an exact-cent EUR amount.` }
    }
    next[key] = value
  }

  const cutoff = rawFields?.salary_day_cutoff
  if (typeof cutoff !== 'string' || !CANONICAL_CUTOFF.test(cutoff)) {
    return { ok: false, error: 'SALARY CUTOFF DAY requires an integer from 1 to 31.' }
  }
  next.salary_day_cutoff = Number(cutoff)

  const billDrafts = legacyBillDrafts(bills)
  if (!billDrafts) {
    return { ok: false, error: 'Bills must be a list.' }
  }
  const obligations = []
  for (const [index, bill] of billDrafts.entries()) {
    if (!bill || typeof bill !== 'object' || typeof bill.name !== 'string' || !bill.name.trim()) {
      return { ok: false, error: `Bill ${index + 1} name is required` }
    }
    const name = billTitle(bill, index)
    if (typeof bill.amount_eur !== 'string' || !CANONICAL_MONEY.test(bill.amount_eur)) {
      return { ok: false, error: `${name} reserve requires an exact-cent EUR amount` }
    }
    const amount = Number(bill.amount_eur)
    if (!Number.isFinite(amount) || !exactCent(amount)) {
      return { ok: false, error: `${name} reserve requires an exact-cent EUR amount` }
    }
    const contains = matchingTerms(bill.contains)
    if (!contains.length) {
      return { ok: false, error: `${name} needs at least one matching term` }
    }
    if (typeof bill.enabled !== 'boolean') {
      return { ok: false, error: `${name} enabled state must be true or false` }
    }
    obligations.push({ name, amount_eur: amount, contains, enabled: bill.enabled })
  }
  next.recurring_obligations = obligations
  next.version = 2
  return { ok: true, profile: next }
}

export function reconciliationView(quality, receiptId) {
  const source = quality && typeof quality === 'object' && !Array.isArray(quality) ? quality : {}
  const difference = source.balance_difference_eur
  const reconciled = source.status === 'reconciled'
  const exactMonetaryEvidence = [
    source.opening_balance_eur,
    source.closing_balance_eur,
    source.net_movement_eur,
    difference,
  ].every(exactCent)
  const canActivate = reconciled
    && exactMonetaryEvidence
    && typeof difference === 'number'
    && Number.isFinite(difference)
    && difference === 0
    && typeof receiptId === 'string'
    && receiptId.trim().length > 0

  return {
    reconciled,
    canActivate,
    metrics: [
      { label: 'STATEMENT ROWS', value: displayNumber(source.statement_rows, { integer: true }) },
      { label: 'PARSED ROWS', value: displayNumber(source.parsed_rows, { integer: true }) },
      { label: 'OPENING BALANCE', value: displayNumber(source.opening_balance_eur) },
      { label: 'CLOSING BALANCE', value: displayNumber(source.closing_balance_eur) },
      { label: 'NET MOVEMENT', value: displayNumber(source.net_movement_eur, { signed: true }) },
      { label: 'BALANCE DIFFERENCE', value: displayNumber(source.balance_difference_eur, { signed: true }) },
      { label: 'STATEMENT END', value: displayDate(source.statement_end_date) },
    ],
    warnings: displayList(source.warnings),
    unmatchedRows: displayList(source.unmatched_rows),
  }
}

export function receiptSaveOutcome(statementReceiptId, errorMessage) {
  const message = String(errorMessage || 'Save failed. Try again.')
  if (TERMINAL_RECEIPT_ERROR.test(message)) {
    return {
      statementReceiptId: null,
      reuploadRequired: true,
      message: 'Receipt cannot be used. Re-upload and parse the PDF again before saving.',
    }
  }
  return { statementReceiptId, reuploadRequired: false, message }
}

export function unavailableAuthority(message = 'Authority unavailable. Refresh the ledger and try again.') {
  return {
    data_ready: false,
    blockers: [message],
    deployable_capacity_eur: null,
    weekly_budget_eur: null,
    remaining_weekly_windows: null,
    protected_cash: null,
    source: null,
  }
}

export function formatAuthorityMoney(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `€${value.toFixed(2)}` : '—'
}

export function formatAuthorityWindows(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '—'
}

export function protectedCashLabel(protectedCash) {
  if (!protectedCash || typeof protectedCash !== 'object' || Array.isArray(protectedCash)) return 'UNKNOWN'
  const values = Object.values(protectedCash)
  if (!values.every(value => typeof value === 'number' && Number.isFinite(value))) return 'UNKNOWN'
  return formatAuthorityMoney(values.reduce((sum, value) => sum + value, 0))
}

export function createAuthorityLoader({ request, onState }) {
  let sequence = 0
  let controller = null

  const load = async month => {
    const requestId = ++sequence
    controller?.abort()
    controller = new AbortController()
    const currentController = controller
    onState({ status: 'loading', month, authority: null })
    try {
      const authority = await request(month, { signal: currentController.signal })
      if (requestId === sequence && !currentController.signal.aborted) {
        onState({ status: 'ready', month, authority })
        return true
      }
      return false
    } catch (error) {
      if (requestId === sequence && !currentController.signal.aborted) {
        onState({
          status: 'unavailable',
          month,
          authority: unavailableAuthority(),
        })
        return true
      }
      return false
    }
  }

  return {
    load,
    dispose: () => {
      sequence += 1
      controller?.abort()
    },
  }
}
