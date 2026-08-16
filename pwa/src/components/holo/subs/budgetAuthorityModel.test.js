import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDefaultUtilityBill,
  createAuthorityLoader,
  formatAuthorityMoney,
  preparePolicyEditor,
  protectedCashLabel,
  reconciliationView,
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
  recurring_obligations: [{ name: 'Rent', amount_eur: 120, contains: ['utilities', 'rent'], enabled: true }],
}

const billDrafts = [{
  name: 'Rent', amount_eur: '120.00', contains: 'utilities, rent', enabled: true,
}]

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

test('default Utilities bill is canonical for the policy editor', () => {
  assert.deepEqual(createDefaultUtilityBill(), {
    name: 'Utilities',
    amount_eur: '150.00',
    contains: 'utility, electric, water',
    enabled: true,
  })
})

test('legacy policy prepares a version 2 Utilities reserve without persisting implicitly', () => {
  const legacy = { version: 1, recurring_obligations: [] }
  const editor = preparePolicyEditor(legacy, true)

  assert.equal(editor.migrationRequired, true)
  assert.equal(editor.rawFields.checking_buffer_eur, '')
  assert.deepEqual(editor.bills, [createDefaultUtilityBill()])
  assert.deepEqual(legacy, { version: 1, recurring_obligations: [] })
})

test('policy editor turns stored canonical bills into editable monetary and term drafts', () => {
  const editor = preparePolicyEditor(policy, false)

  assert.equal(editor.migrationRequired, false)
  assert.equal(editor.rawFields.checking_buffer_eur, '300.00')
  assert.equal(editor.rawFields.salary_day_cutoff, '25')
  assert.deepEqual(editor.bills, [{
    name: 'Rent', amount_eur: '120.00', contains: 'utilities, rent', enabled: true,
  }])
})

test('authority policy validates structured bills and upgrades only successful output to version 2', () => {
  const legacy = { ...policy, version: 1 }
  const result = validateAuthorityPolicyDraft(legacy, rawPolicy, billDrafts)

  assert.equal(result.ok, true)
  assert.equal(result.profile.checking_buffer_eur, 300)
  assert.equal(result.profile.salary_day_cutoff, 25)
  assert.equal(result.profile.recurring_obligations[0].amount_eur, 120)
  assert.deepEqual(result.profile.recurring_obligations[0], {
    name: 'Rent', amount_eur: 120, contains: ['utilities', 'rent'], enabled: true,
  })
  assert.equal(result.profile.version, 2)
  assert.equal(legacy.version, 1)
})

test('authority policy rejects blank, partial, exponent, boolean text, and fractional-cent values', () => {
  for (const value of ['', '-', '1e3', 'true', '1.001', '300']) {
    const result = validateAuthorityPolicyDraft(policy, { ...rawPolicy, checking_buffer_eur: value }, billDrafts)
    assert.equal(result.ok, false, value)
    assert.match(result.error, /CHECKING BUFFER EUR/)
  }
})

test('authority policy reports row-specific structured bill errors', () => {
  assert.deepEqual(
    validateAuthorityPolicyDraft(policy, rawPolicy, [{ ...billDrafts[0], name: '  ' }]),
    { ok: false, error: 'Bill 1 name is required' },
  )
  assert.deepEqual(
    validateAuthorityPolicyDraft(policy, rawPolicy, [{ ...billDrafts[0], name: 'Utilities', amount_eur: '1.001' }]),
    { ok: false, error: 'Utilities reserve requires an exact-cent EUR amount' },
  )
  assert.deepEqual(
    validateAuthorityPolicyDraft(policy, rawPolicy, [{ ...billDrafts[0], name: 'Utilities', contains: ' , ' }]),
    { ok: false, error: 'Utilities needs at least one matching term' },
  )
})

test('authority policy retains disabled bills in the canonical policy', () => {
  const result = validateAuthorityPolicyDraft(policy, rawPolicy, [{ ...billDrafts[0], enabled: false }])

  assert.deepEqual(result, {
    ok: true,
    profile: {
      ...policy,
      version: 2,
      recurring_obligations: [{
        name: 'Rent', amount_eur: 120, contains: ['utilities', 'rent'], enabled: false,
      }],
    },
  })
})

test('reconciliation view activates only a reconciled zero-difference PDF receipt', () => {
  const quality = {
    status: 'reconciled',
    statement_rows: 3,
    parsed_rows: 3,
    opening_balance_eur: 100,
    closing_balance_eur: 85,
    net_movement_eur: -15,
    balance_difference_eur: 0,
    statement_end_date: '2026-08-31',
    warnings: [],
    unmatched_rows: [],
  }
  const activated = reconciliationView(quality, 'receipt-1')

  assert.equal(activated.reconciled, true)
  assert.equal(activated.canActivate, true)
  assert.deepEqual(activated.metrics, [
    { label: 'STATEMENT ROWS', value: '3' },
    { label: 'PARSED ROWS', value: '3' },
    { label: 'OPENING BALANCE', value: 'EUR 100.00' },
    { label: 'CLOSING BALANCE', value: 'EUR 85.00' },
    { label: 'NET MOVEMENT', value: 'EUR -15.00' },
    { label: 'BALANCE DIFFERENCE', value: 'EUR 0.00' },
    { label: 'STATEMENT END', value: '2026-08-31' },
  ])

  for (const [nextQuality, receiptId] of [
    [{ ...quality, status: 'review_required' }, 'receipt-1'],
    [{ ...quality, balance_difference_eur: 0.01 }, 'receipt-1'],
    [quality, null],
    [null, 'receipt-1'],
  ]) {
    assert.equal(reconciliationView(nextQuality, receiptId).canActivate, false)
  }
})

test('reconciliation view stabilizes malformed diagnostics for display', () => {
  const view = reconciliationView({
    status: 'reconciled',
    warnings: ['  Missing closing balance.  ', 2],
    unmatched_rows: ['  malformed row  ', null],
  }, 'receipt-1')

  assert.equal(view.reconciled, true)
  assert.equal(view.canActivate, false)
  assert.deepEqual(view.warnings, ['Missing closing balance.'])
  assert.deepEqual(view.unmatchedRows, ['malformed row'])
  assert.deepEqual(view.metrics, [
    { label: 'STATEMENT ROWS', value: '—' },
    { label: 'PARSED ROWS', value: '—' },
    { label: 'OPENING BALANCE', value: '—' },
    { label: 'CLOSING BALANCE', value: '—' },
    { label: 'NET MOVEMENT', value: '—' },
    { label: 'BALANCE DIFFERENCE', value: '—' },
    { label: 'STATEMENT END', value: '—' },
  ])
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
