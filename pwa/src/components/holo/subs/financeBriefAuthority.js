const exactCent = value => (
  typeof value === 'number'
  && Number.isFinite(value)
  && value >= 0
  && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8
)

const eur = value => `€${value.toFixed(2)}`

const blocked = blockers => [
  'CASH AUTHORITY — BLOCKED',
  ...(blockers.length ? blockers : ['Authority evidence unavailable.']).map(value => `BLOCKER — ${value}`),
].join('\n')

export function formatCashAuthorityBrief(authority) {
  if (!authority || typeof authority !== 'object' || Array.isArray(authority)) {
    return blocked([])
  }

  if (authority.data_ready === false) {
    const blockers = Array.isArray(authority.blockers)
      ? authority.blockers.filter(value => typeof value === 'string' && value.trim())
      : []
    return blocked(blockers)
  }

  const protectedCash = authority.protected_cash
  const protectedValues = protectedCash && typeof protectedCash === 'object' && !Array.isArray(protectedCash)
    ? Object.values(protectedCash)
    : []
  const verified = authority.data_ready === true
    && Array.isArray(authority.blockers)
    && authority.blockers.length === 0
    && exactCent(authority.weekly_budget_eur)
    && authority.weekly_budget_eur > 0
    && exactCent(authority.deployable_capacity_eur)
    && Number.isInteger(authority.remaining_weekly_windows)
    && authority.remaining_weekly_windows > 0
    && protectedValues.length > 0
    && protectedValues.every(exactCent)
    && authority.source?.quality_status === 'reconciled'
    && authority.source?.receipt_verified === true

  if (!verified) return blocked([])

  const protectedTotal = protectedValues.reduce((sum, value) => sum + value, 0)
  return [
    'CASH AUTHORITY — VERIFIED',
    `PROTECTED — ${eur(protectedTotal)}`,
    `DEPLOYABLE — ${eur(authority.deployable_capacity_eur)}`,
    `REMAINING WEEKLY WINDOWS — ${authority.remaining_weekly_windows}`,
  ].join('\n')
}
