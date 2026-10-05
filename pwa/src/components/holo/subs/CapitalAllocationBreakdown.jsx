import { ACC, a } from '../holoTokens'
import { financeBody, financeMicro } from './financeReadability'
import { formatAuthorityMoney } from './budgetAuthorityModel'

export function CapitalAllocationBreakdown({ authority }) {
  if (!authority?.data_ready || !(authority.approved_one_time_capital_eur > 0)) return null
  return <div style={{ marginTop: 10 }}>
    <div style={financeMicro({ color: a(ACC, 'cc') })}>
      MONTHLY CAPACITY · {formatAuthorityMoney(authority.regular_deployable_eur)}
    </div>
    <div style={financeMicro({ marginTop: 6, color: a(ACC, 'cc') })}>
      ONE-TIME CAPITAL AVAILABLE · {formatAuthorityMoney(authority.one_time_deployable_eur)}
    </div>
    <div style={financeBody({ marginTop: 6, color: a(ACC, '99') })}>
      {formatAuthorityMoney(authority.approved_one_time_capital_eur)} approved this month; not income.
      {' '}Both amounts are included in deployable cash and respect reserves and recorded purchases.
      {' '}Unused capital requires a new review next month.
    </div>
  </div>
}
