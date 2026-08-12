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

export function validRecurringObligations(value) {
  return Array.isArray(value) && value.every(obligation => (
    obligation
    && typeof obligation === 'object'
    && exactCent(obligation.amount_eur)
    && obligation.amount_eur >= 0
    && Array.isArray(obligation.contains)
    && obligation.contains.length > 0
    && obligation.contains.every(token => typeof token === 'string' && token.trim())
  ))
}

export function validateAuthorityPolicyDraft(profile, rawFields, recurringDraft) {
  const next = { ...profile }
  for (const [key, label] of AUTHORITY_NUMERIC_FIELDS.slice(0, -1)) {
    const raw = rawFields[key]
    if (typeof raw !== 'string' || !CANONICAL_MONEY.test(raw)) {
      return { ok: false, error: `${label} requires a canonical EUR amount.` }
    }
    const value = Number(raw)
    if (!Number.isFinite(value) || !exactCent(value)) {
      return { ok: false, error: `${label} requires an exact-cent EUR amount.` }
    }
    next[key] = value
  }

  const cutoff = rawFields.salary_day_cutoff
  if (typeof cutoff !== 'string' || !CANONICAL_CUTOFF.test(cutoff)) {
    return { ok: false, error: 'SALARY CUTOFF DAY requires an integer from 1 to 31.' }
  }
  next.salary_day_cutoff = Number(cutoff)

  let obligations
  try {
    obligations = JSON.parse(recurringDraft)
  } catch {
    return { ok: false, error: 'RECURRING OBLIGATIONS must be valid JSON.' }
  }
  if (!validRecurringObligations(obligations)) {
    return { ok: false, error: 'RECURRING OBLIGATIONS require exact-cent amount_eur and contains values.' }
  }
  next.recurring_obligations = obligations
  return { ok: true, profile: next }
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
