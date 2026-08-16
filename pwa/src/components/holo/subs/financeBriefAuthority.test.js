import assert from 'node:assert/strict'
import test from 'node:test'

import { formatCashAuthorityBrief } from './financeBriefAuthority.js'

test('verified authority explains protected cash, deployable capacity, and remaining windows', () => {
  const text = formatCashAuthorityBrief({
    data_ready: true,
    blockers: [],
    deployable_capacity_eur: 760,
    weekly_budget_eur: 190,
    remaining_weekly_windows: 4,
    protected_cash: {
      checking_buffer_eur: 300,
      food_eur: 200,
      unpaid_bills_eur: 120,
      emergency_shortfall_eur: 0,
    },
    source: { quality_status: 'reconciled', receipt_verified: true },
  })

  assert.equal(text, [
    'CASH AUTHORITY — VERIFIED',
    'PROTECTED — €620.00',
    'DEPLOYABLE — €760.00',
    'REMAINING WEEKLY WINDOWS — 4',
  ].join('\n'))
})

test('blocked authority explains blockers without inventing protected or deployable values', () => {
  const text = formatCashAuthorityBrief({
    data_ready: false,
    blockers: ['Statement snapshot is stale.', 'Current investment week is closed.'],
    weekly_budget_eur: 0,
  })

  assert.equal(text, [
    'CASH AUTHORITY — BLOCKED',
    'BLOCKER — Statement snapshot is stale.',
    'BLOCKER — Current investment week is closed.',
  ].join('\n'))
  assert.doesNotMatch(text, /€0\.00/)
})

test('malformed ready authority fails closed instead of claiming verification', () => {
  const text = formatCashAuthorityBrief({
    data_ready: true,
    blockers: [],
    deployable_capacity_eur: 760,
    remaining_weekly_windows: 4,
    protected_cash: null,
    source: { quality_status: 'reconciled', receipt_verified: true },
  })

  assert.equal(text, 'CASH AUTHORITY — BLOCKED\nBLOCKER — Authority evidence unavailable.')
})
