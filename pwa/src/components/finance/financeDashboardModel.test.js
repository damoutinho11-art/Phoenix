import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildFinanceDashboardModel,
  formatMoney,
  formatPercent,
  humanizeKey,
  listFailedFinanceSources,
} from './financeDashboardModel.js'

test('uses the backend checklist candidate without recomputing ETF selection', () => {
  const model = buildFinanceDashboardModel({
    coverage: {
      verdict: 'DATA_TRANSPARENT',
      sections: {
        coverage_summary: {
          current_legs_with_validated_research: 2,
          total_current_recommendation_legs: 2,
        },
        recommendation_data_provenance: {
          legs: [
            { asset: 'btc', resolved_candidate: { symbol: 'BTC-USD' } },
            { asset: 'growth_nasdaq_etf', resolved_candidate: { symbol: 'CNDX.L' } },
          ],
        },
        etf_candidate_universe: {
          sleeves: {
            growth_nasdaq_etf: {
              research_winner: { symbol: 'EQQQ.L', broker_availability_status: 'not_publicly_verified' },
              checklist_candidate: { symbol: 'CNDX.L', broker_availability_status: 'public_verified' },
              selected_candidate: { symbol: 'CNDX.L', broker_availability_status: 'public_verified' },
              selection_gap_reason: 'EQQQ.L is not publicly verified, so CNDX.L is used.',
            },
          },
        },
      },
    },
    checklist: {
      checklist_items: [
        { asset: 'btc', amount: 46.15, symbol: 'BTC', platform: 'LHV Crypto' },
        { asset: 'growth_nasdaq_etf', amount: 69.23, symbol: 'CNDX.L', platform: 'Lightyear' },
      ],
    },
  })

  assert.equal(model.selection.asset, 'growth_nasdaq_etf')
  assert.equal(model.selection.researchSymbol, 'EQQQ.L')
  assert.equal(model.selection.checklistSymbol, 'CNDX.L')
  assert.equal(model.selection.selectedSymbol, 'CNDX.L')
  assert.equal(model.actions[1].symbol, 'CNDX.L')
  assert.equal(model.meta.evidenceLabel, '2/2')
})

test('marks one real performance point as insufficient history', () => {
  const model = buildFinanceDashboardModel({
    performance: {
      source: 'real_sqlite',
      snapshots: [
        { id: 1, created_at: '2026-06-30T10:00:00Z', total_value_eur: 100 },
      ],
    },
  })

  assert.equal(model.performance.historyStatus, 'INSUFFICIENT_HISTORY')
  assert.equal(model.performance.points.length, 1)
  assert.equal(model.performance.source, 'real_sqlite')
})

test('orders real performance observations and rejects invalid timestamps', () => {
  const model = buildFinanceDashboardModel({
    performance: {
      snapshots: [
        { id: 2, created_at: '2026-06-30T10:00:00Z', total_value_eur: 105 },
        { id: 3, created_at: 'not-a-date', total_value_eur: 999 },
        { id: 1, created_at: '2026-06-29T10:00:00Z', total_value_eur: 100 },
        { id: 4, created_at: '2026-07-01T10:00:00Z', total_value_eur: null },
      ],
    },
  })

  assert.deepEqual(model.performance.points.map(point => point.id), [1, 2])
  assert.equal(model.performance.historyStatus, 'READY')
})

test('preserves explicit false safety flags and treats missing flags as unknown', () => {
  const model = buildFinanceDashboardModel({
    checklist: { safety_flags: { trades_executed: false } },
  })

  assert.equal(model.safety.trades_executed, false)
  assert.equal(model.safety.broker_connection, null)
  assert.equal(model.safety.orders_created, null)
})

test('keeps backend checklist empty instead of deriving actions from recommendations', () => {
  const model = buildFinanceDashboardModel({
    recommendation: {
      recommendations: [{ asset: 'btc', amount: 46.15, route: 'lhv_crypto' }],
    },
    checklist: { checklist_items: [] },
  })

  assert.deepEqual(model.actions, [])
  assert.match(model.hero.actionCopy, /No complete manual-buy checklist/)
})

test('uses selected candidate as the backward-compatible checklist alias', () => {
  const model = buildFinanceDashboardModel({
    coverage: {
      sections: {
        recommendation_data_provenance: {
          legs: [{ asset: 'quality_etf', resolved_candidate: { symbol: 'IS3Q.DE' } }],
        },
        etf_candidate_universe: {
          sleeves: {
            quality_etf: {
              selected_candidate: { symbol: 'IS3Q.DE', broker_availability_status: 'public_verified' },
            },
          },
        },
      },
    },
  })

  assert.equal(model.selection.checklistSymbol, 'IS3Q.DE')
  assert.equal(model.selection.selectedSymbol, 'IS3Q.DE')
})

test('formatters return honest placeholders for unavailable values', () => {
  assert.equal(formatMoney(null), '—')
  assert.equal(formatMoney(46.15), '€46.15')
  assert.equal(formatPercent(null), '—')
  assert.equal(formatPercent(0.125), '12.5%')
  assert.equal(humanizeKey('growth_nasdaq_etf'), 'Growth Nasdaq Etf')
})

test('names each unavailable finance source from settled reads', () => {
  const failures = listFailedFinanceSources([
    { status: 'fulfilled', value: {} },
    { status: 'rejected', reason: new Error('HTTP 503') },
    { status: 'rejected', reason: new Error('HTTP 500') },
  ], ['summary', 'checklist', 'performance history'])

  assert.deepEqual(failures, ['checklist', 'performance history'])
})
