import assert from 'node:assert/strict'
import test from 'node:test'

import {
  REVIEW_CATEGORIES,
  categoryCorrectionOutcome,
  createCategoryReviewDraft,
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

test('income is forbidden for debit groups while income rows can select income', () => {
  const state = normalizeCategoryReview(reviewPayload)
  assert.equal(state.groups[0].allowedCategories.includes('Income'), false)

  const incomeState = normalizeCategoryReview({
    ...reviewPayload,
    merchant_groups: [{
      ...reviewPayload.merchant_groups[0],
      transactions: reviewPayload.merchant_groups[0].transactions.map(transaction => ({
        ...transaction,
        is_income: 1,
      })),
    }],
  })
  assert.equal(incomeState.groups[0].allowedCategories.includes('Income'), true)
})

test('409 correction outcome requests a stale refresh and drops actionable state', () => {
  const current = normalizeCategoryReview(reviewPayload)
  assert.deepEqual(categoryCorrectionOutcome(current, { status: 409, message: 'stale' }), {
    status: 'stale',
    actionable: false,
    refreshRequired: true,
    draft: null,
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
    review: current,
    message: 'offline',
  })
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
    review: refreshed,
    summary: { expenses_total: 24.68 },
    authority: { input_hash: 'authority-2' },
    message: '',
  })
})
