import { useState } from 'react'
import { runFinanceOptimizer } from '../../../api/client'
import { ACC, BODY, a, deep } from '../holoTokens'
import { financeBody, financeButton } from './financeReadability'
import { DownsideComparison } from './DownsideComparison'

const euros = cents => new Intl.NumberFormat('en-IE', {style:'currency', currency:'EUR'}).format(cents / 100)
const labels = {RESEARCH_READY:'Research comparison ready', INSUFFICIENT_DATA:'More verified data needed',
  RISK_REVIEW:'Portfolio risk needs review', AMBIGUOUS:'No clear choice between plans', WEEK_CLOSED:'This week is already closed'}

export function OptimizerSummary() {
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function compare() {
    setBusy(true)
    setResult(null)
    setError('')
    try { setResult(await runFinanceOptimizer()) }
    catch { setError('Portfolio comparison unavailable. Retry when finance sources are connected.') }
    finally { setBusy(false) }
  }
  const plan = result?.selected_plan
  return <div style={{marginTop:16, ...financeBody({color:BODY})}}>
    <button disabled={busy} onClick={compare} style={{minHeight:36, padding:'0 14px',
      ...financeButton({color:ACC}), background:deep(50), border:`1px solid ${a(ACC,'44')}`, cursor:busy?'wait':'pointer'}}>
      {busy ? 'COMPARING VERIFIED HISTORY…' : 'COMPARE PORTFOLIO OPTIONS'}
    </button>
    <p>Research comparison only. The optimizer is being evaluated and does not replace the current weekly recommendation.</p>
    <div role="status" aria-live="polite">
      {busy && <p>Checking holdings, broker evidence and five years of public prices. This can take about a minute.</p>}
      {error && <p>{error}</p>}
      {result && <>
        <p>{labels[result.status] || 'Comparison unavailable'}{result.as_of ? ` · ${result.as_of}` : ''}.
          {Number.isFinite(result.evaluated_plans) ? ` Compared ${result.evaluated_plans} plans; ${result.feasible_plans} passed the historical risk screen.` : ''}</p>
        {plan && <p>Research choice: {plan.trades.length
          ? plan.trades.map(t=>`${t.symbol}: ${euros(t.cash_outlay_cents)}`).join(' · ')
          : 'Keep the contribution in cash'}.
          {' '}Unspent contribution: {euros(plan.unspent_contribution_cents)}.
          {' '}Estimated entry costs: {euros(plan.estimated_cost_cents)}.
          {' '}Modeled historical drawdown: {plan.historical_drawdown_pct.toFixed(1)}%.</p>}
        {result.blockers?.length > 0 && <p>{result.blockers.join(' ')}</p>}
        {result.validation_assessment && <p>{result.validation_assessment}</p>}
        <DownsideComparison report={result.downside_comparison} />
        {result.limitations?.length > 0 && <details><summary>Comparison assumptions and limits</summary>
          <ul>{result.limitations.map((text,i)=><li key={i}>{text}</li>)}</ul>
        </details>}
      </>}
    </div>
  </div>
}
