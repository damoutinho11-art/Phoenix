const SAFETY_KEYS = [
  'broker_connection',
  'orders_created',
  'trades_executed',
  'portfolio_state_updated',
  'recommendation_overridden',
]

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function symbolOf(value) {
  return value && typeof value === 'object'
    ? value.symbol || value.ticker || null
    : null
}

export function formatMoney(value) {
  const amount = finiteNumber(value)
  if (amount === null) return '—'
  return `€${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatPercent(value) {
  const ratio = finiteNumber(value)
  return ratio === null ? '—' : `${(ratio * 100).toFixed(1)}%`
}

export function humanizeKey(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function findEtfAsset(sections, checklistItems) {
  const sleeves = sections?.etf_candidate_universe?.sleeves || {}
  const configuredAssets = new Set(Object.keys(sleeves))
  const recommendationLegs = asArray(sections?.recommendation_data_provenance?.legs)
  const recommendationAsset = recommendationLegs.find(leg => configuredAssets.has(leg?.asset))?.asset
  if (recommendationAsset) return recommendationAsset
  return checklistItems.find(item => configuredAssets.has(item?.asset))?.asset || null
}

function normalizePerformance(performance) {
  const points = asArray(performance?.snapshots)
    .map(snapshot => ({
      id: snapshot?.id ?? null,
      timestamp: snapshot?.created_at || snapshot?.as_of || null,
      value: finiteNumber(snapshot?.total_value_eur),
      cash: finiteNumber(snapshot?.cash_eur),
      invested: finiteNumber(snapshot?.invested_value_eur),
    }))
    .filter(point => (
      point.timestamp
      && point.value !== null
      && Number.isFinite(new Date(point.timestamp).getTime())
    ))
    .sort((left, right) => (
      new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
    ))

  return {
    source: performance?.source || 'unknown',
    message: performance?.message || null,
    historyStatus: points.length >= 2
      ? 'READY'
      : points.length === 0
        ? 'EMPTY'
        : 'INSUFFICIENT_HISTORY',
    points,
  }
}

export function listFailedFinanceSources(results, labels) {
  return asArray(results)
    .map((result, index) => result?.status === 'rejected' ? labels?.[index] : null)
    .filter(Boolean)
}

export function buildFinanceDashboardModel(payload = {}) {
  const summary = payload.summary || {}
  const recommendation = payload.recommendation || {}
  const checklist = payload.checklist || {}
  const coverage = payload.coverage || {}
  const sections = coverage.sections || {}
  const coverageSummary = sections.coverage_summary || {}
  const checklistItems = asArray(checklist.checklist_items)
  const etfAsset = findEtfAsset(sections, checklistItems)
  const etfCoverage = etfAsset
    ? sections.etf_candidate_universe?.sleeves?.[etfAsset] || {}
    : {}
  const researchWinner = etfCoverage.research_winner || null
  const checklistCandidate = etfCoverage.checklist_candidate || etfCoverage.selected_candidate || null
  const selectedCandidate = etfCoverage.selected_candidate || checklistCandidate
  const validatedLegs = finiteNumber(coverageSummary.current_legs_with_validated_research)
  const totalLegs = finiteNumber(coverageSummary.total_current_recommendation_legs)
  const actions = checklistItems.map(item => ({
    ...item,
    amount: finiteNumber(item?.amount ?? item?.amount_eur),
    symbol: item?.symbol || item?.ticker || symbolOf(item?.resolved_candidate),
    label: item?.instrument_display_name || item?.instrument?.display_name || humanizeKey(item?.asset),
  }))
  const weekClosed = checklist.checklist_status === 'WEEK_CLOSED'
    || recommendation.week_closed === true

  const safetySources = [sections.safety || {}, checklist.safety_flags || {}]
  const safety = Object.fromEntries(SAFETY_KEYS.map(key => {
    const source = safetySources.find(candidate => Object.hasOwn(candidate, key))
    return [key, source ? source[key] : null]
  }))

  const actionCopy = weekClosed
    ? `${checklist.week_label || recommendation.week_label || 'Current week'} approved. Recommendation window closed; next window ${recommendation.next_window || 'next week'}.`
    : actions.length
    ? `PHOENIX recommends ${actions
      .map(item => `${formatMoney(item.amount)} ${item.symbol || item.label} via ${item.platform || humanizeKey(item.route)}`)
      .join(' and ')}. Manual only — nothing has been ordered or executed.`
    : 'No complete manual-buy checklist was returned. Nothing has been ordered or executed.'

  return {
    meta: {
      asOf: summary.as_of || null,
      pricesRefreshedAt: summary.prices_refreshed_at || null,
      weekLabel: checklist.week_label || recommendation.week_label || null,
      coverageVerdict: coverage.verdict || null,
      evidenceLabel: validatedLegs !== null && totalLegs !== null
        ? `${validatedLegs}/${totalLegs}`
        : '—',
      warnings: asArray(coverage.warnings),
      blockers: asArray(coverage.blockers),
    },
    hero: {
      totalValue: finiteNumber(summary.total_invested),
      weekBudget: finiteNumber(checklist.week_budget ?? recommendation.week_budget),
      requiresApproval: checklist.requires_approval ?? recommendation.requires_approval ?? null,
      briefStatus: checklist.brief_status || recommendation.brief_status || null,
      weekDone: recommendation.week_done === true,
      weekClosed,
      nextWindow: recommendation.next_window || null,
      actionCopy,
    },
    actions,
    selection: {
      asset: etfAsset,
      researchWinner,
      checklistCandidate,
      selectedCandidate,
      researchSymbol: symbolOf(researchWinner),
      checklistSymbol: symbolOf(checklistCandidate),
      selectedSymbol: symbolOf(selectedCandidate),
      gapReason: etfCoverage.selection_gap_reason || null,
      candidates: asArray(etfCoverage.candidates),
    },
    safety,
    portfolio: {
      totalValue: finiteNumber(summary.total_invested),
      sleeves: asArray(summary.sleeve_summary),
      state: payload.portfolioState || null,
      pnl: payload.pnl || null,
    },
    performance: normalizePerformance(payload.performance),
    audit: {
      memos: asArray(payload.memos?.memos ?? payload.memos),
      records: asArray(payload.records?.records ?? payload.records),
    },
  }
}
