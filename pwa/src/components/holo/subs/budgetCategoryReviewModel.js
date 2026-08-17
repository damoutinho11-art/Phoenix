export const REVIEW_CATEGORIES = [
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
]

const CATEGORY_SET = new Set(REVIEW_CATEGORIES)

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isText = value => typeof value === 'string' && value.trim().length > 0
const lexicalFractionDigits = value => {
  const [coefficient, exponentText] = String(value).toLowerCase().split('e')
  const fractionDigits = coefficient.includes('.')
    ? coefficient.length - coefficient.indexOf('.') - 1
    : 0
  const exponent = exponentText ? Number(exponentText) : 0
  return Math.max(0, fractionDigits - exponent)
}
const isExactCent = value => (
  typeof value === 'number'
  && Number.isFinite(value)
  && value >= 0
  && lexicalFractionDigits(value) <= 2
  && Number.isSafeInteger(Math.round(value * 100))
  && value === Math.round(value * 100) / 100
)
const cents = value => Math.round(value * 100)
const canonicalMerchant = value => value.trim().replace(/\s+/g, ' ').toLowerCase()
const validCategory = value => typeof value === 'string' && CATEGORY_SET.has(value)
const validOrdinalList = value => (
  Array.isArray(value)
  && value.length > 0
  && value.every(ordinal => Number.isInteger(ordinal) && ordinal >= 0)
  && new Set(value).size === value.length
)

const emptyState = (status, message = '') => ({
  status,
  actionable: false,
  dataReady: false,
  blockers: message ? [message] : [],
  statementImportId: null,
  revision: null,
  unresolvedCount: 0,
  unresolvedAmountCents: null,
  unresolvedAmountEur: null,
  groups: [],
  learnedMerchants: [],
})

export function createCategoryReviewLoading() {
  return emptyState('loading')
}

function validTransaction(transaction, expectedMerchantKey) {
  return isRecord(transaction)
    && Number.isInteger(transaction.ordinal)
    && transaction.ordinal >= 0
    && /^\d{4}-\d{2}-\d{2}$/.test(transaction.date)
    && isText(transaction.merchant)
    && canonicalMerchant(transaction.merchant) === expectedMerchantKey
    && isExactCent(transaction.amount_eur)
    && typeof transaction.description === 'string'
    && (transaction.is_income === 0 || transaction.is_income === 1)
    && validCategory(transaction.category)
    && (transaction.is_income === 1 || transaction.category !== 'Income')
}

function normalizeGroup(group) {
  if (
    !isRecord(group)
    || !isText(group.merchant)
    || !isText(group.merchant_key)
    || group.merchant_key !== canonicalMerchant(group.merchant_key)
  ) {
    return null
  }
  if (!validOrdinalList(group.ordinals) || !Array.isArray(group.transactions) || group.transactions.length !== group.ordinals.length) {
    return null
  }

  const ordinals = [...group.ordinals].sort((left, right) => left - right)
  const transactions = [...group.transactions].sort((left, right) => (left?.ordinal ?? -1) - (right?.ordinal ?? -1))
  if (!transactions.every(transaction => validTransaction(transaction, group.merchant_key))) return null
  if (!transactions.every((transaction, index) => transaction.ordinal === ordinals[index])) return null

  const directions = new Set(transactions.map(transaction => transaction.is_income))
  if (directions.size !== 1) return null

  const amountCents = transactions.reduce((sum, transaction) => sum + cents(transaction.amount_eur), 0)
  return {
    ...group,
    merchantKey: group.merchant_key,
    ordinals,
    transactions,
    amountCents,
    amountEur: amountCents / 100,
    allowedCategories: directions.has(0)
      ? REVIEW_CATEGORIES.filter(category => category !== 'Income')
      : ['Income'],
  }
}

function normalizeLearnedMerchants(value) {
  if (!Array.isArray(value)) return null
  if (!value.every(rule => (
    isRecord(rule)
    && Number.isInteger(rule.id)
    && rule.id > 0
    && isText(rule.normalized_merchant)
    && rule.normalized_merchant === canonicalMerchant(rule.normalized_merchant)
    && validCategory(rule.category)
  ))) return null
  const ids = value.map(rule => rule.id)
  const merchants = value.map(rule => rule.normalized_merchant)
  return new Set(ids).size === ids.length && new Set(merchants).size === merchants.length ? value : null
}

export function normalizeCategoryReview(payload) {
  if (!isRecord(payload) || typeof payload.data_ready !== 'boolean') {
    return emptyState('error', 'Review data was malformed. Refresh and try again.')
  }

  const blockersValid = Array.isArray(payload.blockers) && payload.blockers.every(isText)
  const learnedMerchants = normalizeLearnedMerchants(payload.learned_merchants)
  const commonValid = blockersValid && learnedMerchants !== null
  if (!commonValid) return emptyState('error', 'Review data was malformed. Refresh and try again.')

  if (!payload.data_ready) {
    if (
      payload.blockers.length === 0
      || payload.statement_import_id !== null
      || payload.revision !== null
      || payload.unresolved_count !== 0
      || payload.unresolved_amount_eur !== 0
      || !Array.isArray(payload.merchant_groups)
      || payload.merchant_groups.length !== 0
    ) return emptyState('error', 'Review data was malformed. Refresh and try again.')

    return {
      ...emptyState('blocked'),
      blockers: payload.blockers,
      unresolvedAmountCents: 0,
      unresolvedAmountEur: 0,
      learnedMerchants,
    }
  }

  if (
    !isText(payload.statement_import_id)
    || !isText(payload.revision)
    || payload.blockers.length !== 0
    || !Number.isInteger(payload.unresolved_count)
    || payload.unresolved_count < 0
    || !isExactCent(payload.unresolved_amount_eur)
    || !Array.isArray(payload.merchant_groups)
  ) return emptyState('error', 'Review data was malformed. Refresh and try again.')

  const groups = payload.merchant_groups.map(normalizeGroup)
  if (groups.some(group => group === null)) return emptyState('error', 'Review data was malformed. Refresh and try again.')
  const normalizedGroups = groups
  const allOrdinals = normalizedGroups.flatMap(group => group.ordinals)
  const allMerchants = normalizedGroups.map(group => group.merchant_key)
  const totalCents = normalizedGroups.reduce((sum, group) => sum + group.amountCents, 0)
  if (
    new Set(allOrdinals).size !== allOrdinals.length
    || new Set(allMerchants).size !== allMerchants.length
    || payload.unresolved_count !== allOrdinals.length
    || cents(payload.unresolved_amount_eur) !== totalCents
  ) return emptyState('error', 'Review data was malformed. Refresh and try again.')

  const complete = payload.unresolved_count === 0
  return {
    status: complete ? 'complete' : 'ready',
    actionable: !complete,
    dataReady: true,
    blockers: [],
    statementImportId: payload.statement_import_id,
    revision: payload.revision,
    unresolvedCount: payload.unresolved_count,
    unresolvedAmountCents: cents(payload.unresolved_amount_eur),
    unresolvedAmountEur: payload.unresolved_amount_eur,
    groups: normalizedGroups,
    learnedMerchants,
  }
}

export function createCategoryReviewDraft(group) {
  if (!isRecord(group)) return null
  const merchantKey = typeof group.merchant_key === 'string' ? group.merchant_key : group.merchantKey
  if (!isText(merchantKey) || merchantKey !== canonicalMerchant(merchantKey) || !validOrdinalList(group.ordinals)) return null
  return {
    merchantKey,
    ordinals: [...group.ordinals].sort((left, right) => left - right),
    category: '',
    rememberMerchant: true,
  }
}

export function buildCategoryCorrectionRequest(statementImportId, revision, draft) {
  if (
    !isText(statementImportId)
    || !isText(revision)
    || !isRecord(draft)
    || !isText(draft.merchantKey)
    || draft.merchantKey !== canonicalMerchant(draft.merchantKey)
    || !validOrdinalList(draft.ordinals)
    || !validCategory(draft.category)
    || draft.category === 'Other'
    || typeof draft.rememberMerchant !== 'boolean'
  ) return null

  return {
    statement_import_id: statementImportId,
    expected_revision: revision,
    merchant_key: draft.merchantKey,
    ordinals: [...draft.ordinals],
    corrected_category: draft.category,
    remember_merchant: draft.rememberMerchant,
  }
}

function errorStatus(error) {
  if (!error) return 0
  if (Number.isInteger(error.status)) return error.status
  if (Number.isInteger(error.statusCode)) return error.statusCode
  if (Number.isInteger(error.response?.status)) return error.response.status
  return 0
}

function errorMessage(error) {
  return typeof error?.message === 'string' && error.message.trim() ? error.message : 'Correction failed. Try again.'
}

export function categoryCorrectionOutcome(current, responseOrError, draft = null) {
  const status = errorStatus(responseOrError)
  const stagedDraft = draft || responseOrError?.draft || current?.draft || null
  if (status === 409) {
    return {
      status: 'stale',
      actionable: false,
      refreshRequired: true,
      draft: null,
      review: current,
      message: 'The statement changed. Refresh the review before retrying.',
    }
  }

  if (isRecord(responseOrError) && isRecord(responseOrError.review)) {
    const review = normalizeCategoryReview(responseOrError.review)
    if (review.status === 'error' || !isRecord(responseOrError.summary) || !isRecord(responseOrError.authority)) {
      return {
        status: 'error',
        actionable: false,
        refreshRequired: false,
        draft: null,
        review,
        message: 'Correction response was malformed. Refresh and try again.',
      }
    }
    return {
      status: review.status,
      actionable: review.actionable,
      refreshRequired: false,
      draft: null,
      review,
      summary: responseOrError.summary,
      authority: responseOrError.authority,
      message: '',
    }
  }

  const retryable = status === 0 || status >= 500
  return {
    status: 'error',
    actionable: retryable && Boolean(current?.actionable),
    refreshRequired: false,
    draft: retryable ? stagedDraft : null,
    review: current,
    message: errorMessage(responseOrError),
  }
}
