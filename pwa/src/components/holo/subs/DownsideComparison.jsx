import { ACC, Y, a } from '../holoTokens'

const euros = cents => new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(cents/100)
const pct = value => `${value < 0 ? '−' : ''}${Math.abs(value)}%`
const cell = {padding:'10px 12px',textAlign:'left',verticalAlign:'top',borderBottom:`1px solid ${a(ACC,'22')}`}

export function DownsideComparison({ report }) {
  if (!report?.plans?.length) return null
  const scenarios = report.plans[0].scenarios || []
  const historicalWindow = scenario => {
    const window = report.historical_windows?.[scenario.id]
    return window?.observed_start && window?.observed_end
      ? `Observed common endpoints ${window.observed_start} to ${window.observed_end}; endpoint change, not maximum drawdown.`
      : 'No common observed historical window available.'
  }
  const missing = [...new Set(report.plans.flatMap(p=>p.scenarios.filter(s=>s.status!=='CALCULATED').map(s=>s.reason)).filter(Boolean))]
  return <details style={{margin:'16px 0'}}>
    <summary style={{cursor:'pointer',color:ACC}}>Portfolio downside comparison</summary>
    <p>Estimated scenario losses include entry costs. Your {report.drawdown_tolerance_reference_pct}% tolerance is a reference, not a maximum possible loss.</p>
    <div style={{overflowX:'auto'}} tabIndex={0} role="region" aria-label="Portfolio downside scenario table">
      <table style={{borderCollapse:'collapse',width:'100%',minWidth:640,fontSize:13}}>
        <caption style={{textAlign:'left',padding:'8px 0'}}>Same starting portfolio and contribution; different research choices.</caption>
        <thead><tr><th scope="col" style={cell}>Plan</th><th scope="col" style={cell}>Cash afterward</th>
          {scenarios.map(s=><th scope="col" style={cell} key={s.id}>{s.label}</th>)}
        </tr></thead>
        <tbody>{report.plans.map(plan=><tr key={plan.id}>
          <th scope="row" style={{...cell,minWidth:160,fontWeight:400}}>{plan.label}
            {plan.trades?.length>0 && <div>{plan.trades.map(t=>`${t.symbol} ${euros(t.cash_outlay_cents)}`).join(' · ')}</div>}
          </th>
          <td style={cell}>{euros(plan.cash_after_contribution_cents)}<div>{plan.cash_weight_pct.toFixed(1)}%</div></td>
          {plan.scenarios.map(s=><td style={{...cell,color:s.exceeds_tolerance?Y:undefined}} key={s.id}>
            {s.status==='CALCULATED' ? <>{euros(s.loss_including_entry_cost_cents)}<div>{s.loss_pct_of_starting_wealth.toFixed(1)}%</div>
              {s.exceeds_tolerance && <small>Above your tolerance reference</small>}</> : 'Incomplete'}
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {missing.length>0 && <p>Unavailable scenario evidence: {missing.join(' ')}</p>}
    <p>{report.classification_basis}</p>
    <ul>{scenarios.map(s=><li key={s.id}>{s.label}: {s.kind==='hypothetical'
      ? Object.entries(s.shocks_pct || {}).map(([asset,shock])=>`${asset} ${pct(shock)}`).join(', ')
      : historicalWindow(s)}</li>)}</ul>
    <ul>{report.limitations?.map((text,index)=><li key={index}>{text}</li>)}</ul>
  </details>
}
