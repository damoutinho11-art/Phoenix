import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createAuthorityLoader,
  formatAuthorityMoney,
  protectedCashLabel,
  receiptSaveOutcome,
  unavailableAuthority,
  validateAuthorityPolicyDraft,
} from './budgetAuthorityModel.js'

const policy = {
  emergency_fund_floor_eur: 5000,
  emergency_fund_balance_eur: 5200,
  checking_buffer_eur: 300,
  food_budget_eur: 200,
  essential_spending_ceiling_eur: 950,
  salary_day_cutoff: 25,
  recurring_obligations: [{ amount_eur: 120, contains: ['utilities'] }],
}

const rawPolicy = {
  emergency_fund_floor_eur: '5000.00',
  emergency_fund_balance_eur: '5200.00',
  checking_buffer_eur: '300.00',
  food_budget_eur: '200.00',
  essential_spending_ceiling_eur: '950.00',
  salary_day_cutoff: '25',
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test('authority loader clears stale data and commits only the newest month response', async () => {
  const pending = new Map()
  const states = []
  const loader = createAuthorityLoader({
    request: month => {
      const next = deferred()
      pending.set(month, next)
      return next.promise
    },
    onState: state => states.push(state),
  })

  const august = loader.load('2026-08')
  const september = loader.load('2026-09')
  assert.deepEqual(states.map(state => [state.status, state.month, state.authority]), [
    ['loading', '2026-08', null],
    ['loading', '2026-09', null],
  ])

  pending.get('2026-08').resolve({ data_ready: true, weekly_budget_eur: 10 })
  assert.equal(await august, false)
  assert.equal(states.length, 2)

  pending.get('2026-09').resolve({ data_ready: true, weekly_budget_eur: 20 })
  assert.equal(await september, true)
  assert.deepEqual(states.at(-1), {
    status: 'ready',
    month: '2026-09',
    authority: { data_ready: true, weekly_budget_eur: 20 },
  })
})

test('authority loader ignores a deferred completion after unmount disposal', async () => {
  const pending = deferred()
  const states = []
  const loader = createAuthorityLoader({ request: () => pending.promise, onState: state => states.push(state) })

  const request = loader.load('2026-08')
  loader.dispose()
  pending.resolve({ data_ready: true })
  await request

  assert.deepEqual(states, [{ status: 'loading', month: '2026-08', authority: null }])
})

test('receipt terminal errors require a new PDF parse while retryable failures retain the receipt', () => {
  for (const message of [
    'Submitted transactions do not match statement receipt',
    'Statement receipt has expired',
    'Statement receipt has already been consumed',
    'Statement receipt is missing or invalid',
  ]) {
    assert.deepEqual(receiptSaveOutcome('receipt-1', message), {
      statementReceiptId: null,
      reuploadRequired: true,
      message: 'Receipt cannot be used. Re-upload and parse the PDF again before saving.',
    })
  }

  assert.deepEqual(receiptSaveOutcome('receipt-1', 'Network request failed'), {
    statementReceiptId: 'receipt-1',
    reuploadRequired: false,
    message: 'Network request failed',
  })
})

test('authority policy accepts exact canonical values and converts only after validation', () => {
  const result = validateAuthorityPolicyDraft(policy, rawPolicy, JSON.stringify(policy.recurring_obligations))

  assert.equal(result.ok, true)
  assert.equal(result.profile.checking_buffer_eur, 300)
  assert.equal(result.profile.salary_day_cutoff, 25)
  assert.equal(result.profile.recurring_obligations[0].amount_eur, 120)
})

test('authority policy rejects blank, partial, exponent, boolean text, and fractional-cent values', () => {
  for (const value of ['', '-', '1e3', 'true', '1.001', '300']) {
    const result = validateAuthorityPolicyDraft(policy, { ...rawPolicy, checking_buffer_eur: value }, JSON.stringify(policy.recurring_obligations))
    assert.equal(result.ok, false, value)
    assert.match(result.error, /CHECKING BUFFER EUR/)
  }

  const recurring = validateAuthorityPolicyDraft(policy, rawPolicy, '[{"amount_eur":1.001,"contains":["rent"]}]')
  assert.equal(recurring.ok, false)
  assert.match(recurring.error, /RECURRING OBLIGATIONS/)
})

test('unavailable authority telemetry remains explicitly unknown while backend zero remains zero', () => {
  const unavailable = unavailableAuthority('Authority unavailable. Refresh the ledger and try again.')
  assert.equal(formatAuthorityMoney(unavailable.deployable_capacity_eur), '—')
  assert.equal(formatAuthorityMoney(unavailable.weekly_budget_eur), '—')
  assert.equal(protectedCashLabel(unavailable.protected_cash), 'UNKNOWN')
  assert.deepEqual(unavailable.blockers, ['Authority unavailable. Refresh the ledger and try again.'])

  assert.equal(formatAuthorityMoney(0), '€0.00')
  assert.equal(protectedCashLabel({ checking_buffer_eur: 0, unpaid_bills_eur: 0 }), '€0.00')
  assert.equal(protectedCashLabel({ checking_buffer_eur: '0' }), 'UNKNOWN')
})
