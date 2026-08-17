import assert from 'node:assert/strict'
import test from 'node:test'

import {
  REVIEW_CATEGORIES,
  buildCategoryCorrectionRequest,
  categoryCorrectionOutcome,
  createCategoryReviewDraft,
  createCategoryReviewLoading,
  normalizeCategoryReview,
} from './budgetCategoryReviewModel.js'

const reviewPayload = {
  data_ready: true,
  blockers: [],
  statement_import_id: 'statement-1',
  revision: 'revision-1',
  unresolved_count: 2,
  unresolved_amount_eur: 24.68,
  merchant_groups: [{
    merchant_key: 'vitaminas braga parq',
    merchant: 'Vitaminas Braga Parq',
    ordinals: [4, 1],
    transactions: [
      {
        ordinal: 4,
        date: '2026-08-04',
        merchant: 'Vitaminas Braga Parq',
        amount_eur: 12.34,
        description: 'Card payment',
        is_income: 0,
        category: 'Other',
      },
      {
        ordinal: 1,
        date: '2026-08-01',
        merchant: 'Vitaminas Braga Parq',
        amount_eur: 12.34,
        description: 'Card payment',
        is_income: 0,
        category: 'Other',
      },
    ],
  }],
  learned_merchants: [{
    id: 7,
    normalized_merchant: 'previous merchant',
    category: 'Shopping',
  }],
}

test('category draft remembers merchant by default and preserves exact ordinals', () => {
  assert.deepEqual(createCategoryReviewDraft({
    merchant_key: 'vitaminas braga parq',
    ordinals: [4, 1],
  }), {
    merchantKey: 'vitaminas braga parq',
    ordinals: [1, 4],
    category: '',
    rememberMerchant: true,
  })
})

test('correction request carries only server identity, exact group ordinals, category, and remember choice', () => {
  const draft = {
    ...createCategoryReviewDraft(reviewPayload.merchant_groups[0]),
    category: 'Food & Groceries',
    rememberMerchant: false,
  }

  assert.deepEqual(buildCategoryCorrectionRequest(
    reviewPayload.statement_import_id,
    reviewPayload.revision,
    draft,
  ), {
    statement_import_id: 'statement-1',
    expected_revision: 'revision-1',
    merchant_key: 'vitaminas braga parq',
    ordinals: [1, 4],
    corrected_category: 'Food & Groceries',
    remember_merchant: false,
  })
  assert.equal(buildCategoryCorrectionRequest('statement-1', 'revision-1', {
    ...draft,
    category: 'Other',
  }), null)
})

test('category draft refuses malformed merchant or ordinal data', () => {
  assert.equal(createCategoryReviewDraft({ merchant_key: ' ', ordinals: [1] }), null)
  assert.equal(createCategoryReviewDraft({ merchant_key: 'merchant', ordinals: [1, 1] }), null)
  assert.equal(createCategoryReviewDraft({ merchant_key: 'merchant', ordinals: [1, '2'] }), null)
})

test('review normalization preserves exact-cent totals and unique merchant ordinals', () => {
  const state = normalizeCategoryReview(reviewPayload)

  assert.equal(state.status, 'ready')
  assert.equal(state.unresolvedCount, 2)
  assert.equal(state.unresolvedAmountCents, 2468)
  assert.equal(state.unresolvedAmountEur, 24.68)
  assert.deepEqual(state.groups[0].ordinals, [1, 4])
  assert.deepEqual(state.groups[0].transactions.map(transaction => transaction.ordinal), [1, 4])
  assert.deepEqual(state.learnedMerchants, reviewPayload.learned_merchants)
})

test('server casefolded merchant keys remain actionable with Unicode display evidence', () => {
  const unicodePayload = {
    ...reviewPayload,
    merchant_groups: [{
      ...reviewPayload.merchant_groups[0],
      merchant_key: 'strasse market',
      merchant: 'Straße Market',
      transactions: reviewPayload.merchant_groups[0].transactions.map(transaction => ({
        ...transaction,
        merchant: 'Straße Market',
      })),
    }],
  }

  const state = normalizeCategoryReview(unicodePayload)
  const draft = { ...createCategoryReviewDraft(state.groups[0]), category: 'Shopping' }

  assert.equal(state.status, 'ready')
  assert.equal(state.actionable, true)
  assert.equal(draft.merchantKey, 'strasse market')
  assert.equal(buildCategoryCorrectionRequest(state.statementImportId, state.revision, draft).merchant_key, 'strasse market')
})

test('server merchant keys and ordinals remain unique across Unicode-safe groups', () => {
  const secondGroup = {
    merchant_key: 'second merchant',
    merchant: 'Second Merchant',
    ordinals: [7],
    transactions: [{
      ordinal: 7,
      date: '2026-08-07',
      merchant: 'Second Merchant',
      amount_eur: 3.21,
      description: 'Second payment',
      is_income: 0,
      category: 'Other',
    }],
  }
  const base = {
    ...reviewPayload,
    unresolved_count: 3,
    unresolved_amount_eur: 27.89,
    merchant_groups: [reviewPayload.merchant_groups[0], secondGroup],
  }

  assert.equal(normalizeCategoryReview({
    ...base,
    merchant_groups: [base.merchant_groups[0], { ...secondGroup, merchant_key: 'vitaminas braga parq' }],
  }).status, 'error')
  assert.equal(normalizeCategoryReview({
    ...base,
    merchant_groups: [base.merchant_groups[0], { ...secondGroup, ordinals: [4], transactions: [{ ...secondGroup.transactions[0], ordinal: 4 }] }],
  }).status, 'error')
})

test('review normalization fails closed for malformed server data', () => {
  const malformed = normalizeCategoryReview({
    ...reviewPayload,
    unresolved_amount_eur: 24.679,
    merchant_groups: [{
      ...reviewPayload.merchant_groups[0],
      ordinals: [1, 1],
    }],
  })

  assert.equal(malformed.status, 'error')
  assert.equal(malformed.actionable, false)
  assert.deepEqual(malformed.groups, [])
})

test('review normalization rejects missing, blank, or non-string display merchants', () => {
  for (const merchant of [undefined, ' ', 42]) {
    const group = { ...reviewPayload.merchant_groups[0], merchant }
    const malformed = normalizeCategoryReview({ ...reviewPayload, merchant_groups: [group] })

    assert.equal(malformed.status, 'error')
    assert.equal(malformed.actionable, false)
    assert.deepEqual(malformed.groups, [])
  }
})

test('review normalization rejects debit Income rows and mixed-direction merchant groups', () => {
  const debitWithIncome = normalizeCategoryReview({
    ...reviewPayload,
    merchant_groups: [{
      ...reviewPayload.merchant_groups[0],
      transactions: reviewPayload.merchant_groups[0].transactions.map(transaction => ({
        ...transaction,
        category: 'Income',
      })),
    }],
  })
  assert.equal(debitWithIncome.status, 'error')
  assert.equal(debitWithIncome.actionable, false)

  const mixedDirections = normalizeCategoryReview({
    ...reviewPayload,
    merchant_groups: [{
      ...reviewPayload.merchant_groups[0],
      transactions: reviewPayload.merchant_groups[0].transactions.map(transaction => ({
        ...transaction,
        is_income: transaction.ordinal === 1 ? 1 : 0,
      })),
    }],
  })
  assert.equal(mixedDirections.status, 'error')
  assert.equal(mixedDirections.actionable, false)
})

test('loading state is explicit and malformed payloads are not loading', () => {
  assert.deepEqual(createCategoryReviewLoading(), {
    status: 'loading',
    actionable: false,
    dataReady: false,
    blockers: [],
    statementImportId: null,
    revision: null,
    unresolvedCount: 0,
    unresolvedAmountCents: null,
    unresolvedAmountEur: null,
    groups: [],
    learnedMerchants: [],
  })
  assert.equal(normalizeCategoryReview(null).status, 'error')
  assert.equal(normalizeCategoryReview(null).actionable, false)
})

test('review normalization rejects numeric values with more than two lexical decimal places', () => {
  const malformed = normalizeCategoryReview({
    ...reviewPayload,
    unresolved_amount_eur: 24.68000000001,
  })
  assert.equal(malformed.status, 'error')
  assert.equal(malformed.actionable, false)

  const ordinary = normalizeCategoryReview({
    ...reviewPayload,
    unresolved_amount_eur: 24.68,
    merchant_groups: [{
      ...reviewPayload.merchant_groups[0],
      transactions: reviewPayload.merchant_groups[0].transactions.map(transaction => ({
        ...transaction,
        amount_eur: 12.34,
      })),
    }],
  })
  assert.equal(ordinary.status, 'ready')
  assert.equal(ordinary.unresolvedAmountCents, 2468)
})

test('review normalization blocks a non-ready server response without actionable groups', () => {
  const blocked = normalizeCategoryReview({
    data_ready: false,
    blockers: ['No verified statement'],
    statement_import_id: null,
    revision: null,
    unresolved_count: 0,
    unresolved_amount_eur: 0,
    merchant_groups: [],
    learned_merchants: [],
  })

  assert.deepEqual(blocked, {
    status: 'blocked',
    actionable: false,
    dataReady: false,
    blockers: ['No verified statement'],
    statementImportId: null,
    revision: null,
    unresolvedCount: 0,
    unresolvedAmountCents: 0,
    unresolvedAmountEur: 0,
    groups: [],
    learnedMerchants: [],
  })
})

test('empty ready queue is complete and known categories are shared by the UI', () => {
  const complete = normalizeCategoryReview({
    ...reviewPayload,
    unresolved_count: 0,
    unresolved_amount_eur: 0,
    merchant_groups: [],
  })

  assert.equal(complete.status, 'complete')
  assert.equal(complete.actionable, false)
  assert.deepEqual(REVIEW_CATEGORIES, [
    'Housing',
    'Food & Groceries',
    'Eating Out',
    'Transport',
    'Subscriptions',
    'Health & Sport',
    'Shopping',
    'Investment',
    'Emergency Fund',
    'Transfers',
    'Income',
    'Banking & Fees',
    'Other',
  ])
})

test('unresolved income rows remain reviewable but can only be corrected to Income', () => {
  const state = normalizeCategoryReview(reviewPayload)
  assert.equal(state.groups[0].allowedCategories.includes('Income'), false)

  const incomeState = normalizeCategoryReview({
    ...reviewPayload,
    merchant_groups: [{
      ...reviewPayload.merchant_groups[0],
      transactions: reviewPayload.merchant_groups[0].transactions.map(transaction => ({
        ...transaction,
        is_income: 1,
        category: 'Other',
        effective_category: 'Other',
      })),
    }],
  })
  assert.equal(incomeState.status, 'ready')
  assert.deepEqual(incomeState.groups[0].allowedCategories, ['Income'])
})

test('409 correction outcome requests a stale refresh and drops actionable state', () => {
  const current = normalizeCategoryReview(reviewPayload)
  assert.deepEqual(categoryCorrectionOutcome(current, { status: 409, message: 'stale' }), {
    status: 'stale',
    actionable: false,
    refreshRequired: true,
    draft: null,
    draftLocked: true,
    retryable: false,
    review: current,
    message: 'The statement changed. Refresh the review before retrying.',
  })
})

test('retryable correction failure retains the staged draft', () => {
  const current = normalizeCategoryReview(reviewPayload)
  const draft = { ...createCategoryReviewDraft(reviewPayload.merchant_groups[0]), category: 'Shopping' }

  assert.deepEqual(categoryCorrectionOutcome(current, { status: 503, message: 'offline', draft }), {
    status: 'error',
    actionable: true,
    refreshRequired: false,
    draft,
    draftLocked: false,
    retryable: true,
    review: current,
    message: 'offline',
  })
})

test('non-retryable client errors clear and lock the staged draft', () => {
  const current = normalizeCategoryReview(reviewPayload)
  const draft = { ...createCategoryReviewDraft(reviewPayload.merchant_groups[0]), category: 'Shopping' }

  assert.deepEqual(categoryCorrectionOutcome(current, { status: 422, message: 'invalid correction' }, draft), {
    status: 'error',
    actionable: false,
    refreshRequired: false,
    draft: null,
    draftLocked: true,
    retryable: false,
    review: current,
    message: 'invalid correction',
  })
})

test('malformed successful responses clear and lock the staged draft', () => {
  const current = normalizeCategoryReview(reviewPayload)
  const draft = { ...createCategoryReviewDraft(reviewPayload.merchant_groups[0]), category: 'Shopping' }
  const outcome = categoryCorrectionOutcome(current, {
    review: { ...reviewPayload, unresolved_count: -1 },
    summary: {},
    authority: {},
  }, draft)

  assert.equal(outcome.actionable, false)
  assert.equal(outcome.draft, null)
  assert.equal(outcome.draftLocked, true)
  assert.equal(outcome.retryable, false)
})

test('successful correction replaces the queue with the refreshed server review', () => {
  const current = normalizeCategoryReview(reviewPayload)
  const refreshed = normalizeCategoryReview({
    ...reviewPayload,
    revision: 'revision-2',
    unresolved_count: 0,
    unresolved_amount_eur: 0,
    merchant_groups: [],
  })

  assert.deepEqual(categoryCorrectionOutcome(current, {
    review: {
      ...reviewPayload,
      revision: 'revision-2',
      unresolved_count: 0,
      unresolved_amount_eur: 0,
      merchant_groups: [],
    },
    summary: { expenses_total: 24.68 },
    authority: { input_hash: 'authority-2' },
  }), {
    status: 'complete',
    actionable: false,
    refreshRequired: false,
    draft: null,
    draftLocked: true,
    retryable: false,
    review: refreshed,
    summary: { expenses_total: 24.68 },
    authority: { input_hash: 'authority-2' },
    message: '',
  })
})
