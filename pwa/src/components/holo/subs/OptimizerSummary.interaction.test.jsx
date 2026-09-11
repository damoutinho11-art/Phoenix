import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OptimizerSummary } from './OptimizerSummary'

vi.mock('../../../api/client', () => ({ runFinanceOptimizer: vi.fn() }))
import { runFinanceOptimizer } from '../../../api/client'

describe('portfolio comparison in existing brief', () => {
  it('labels suggested amounts as research and offers no execution action', async () => {
    runFinanceOptimizer.mockResolvedValue({ as_of: '2026-09-10', status: 'RESEARCH_READY',
      promotion_status: 'NOT_VALIDATED', evaluated_plans: 66, feasible_plans: 40,
      selected_plan: { trades: [{symbol:'BTC-EUR',cash_outlay_cents:6000}],
        unspent_contribution_cents:4000, estimated_cost_cents:30, historical_drawdown_pct:25 },
      blockers: [], limitations: ['Historical losses are not a future-loss limit.'] })
    const view = render(<OptimizerSummary />)
    fireEvent.click(screen.getByRole('button', {name:'COMPARE PORTFOLIO OPTIONS'}))
    await waitFor(() => expect(screen.getByText(/BTC-EUR: €60.00/)).toBeTruthy())
    expect(screen.getByText(/Research comparison only/)).toBeTruthy()
    expect(screen.queryByRole('button', {name:/approve|execute|buy/i})).toBeNull()
    view.unmount()
  })

  it('reports missing evidence without manufacturing a choice', async () => {
    runFinanceOptimizer.mockResolvedValue({status:'INSUFFICIENT_DATA', selected_plan:null,
      blockers:['Held instrument history unavailable.'], promotion_status:'NOT_VALIDATED'})
    const view = render(<OptimizerSummary />)
    fireEvent.click(screen.getByRole('button', {name:'COMPARE PORTFOLIO OPTIONS'}))
    await waitFor(() => expect(screen.getByText(/Held instrument history unavailable/)).toBeTruthy())
    expect(screen.queryByText(/Research choice:/)).toBeNull()
    view.unmount()
  })

  it('shows stress assumptions, remaining cash and incomplete evidence without buy controls', async () => {
    runFinanceOptimizer.mockResolvedValue({status:'RESEARCH_READY',promotion_status:'NOT_VALIDATED',
      downside_comparison:{drawdown_tolerance_reference_pct:40, classification_basis:'Configured sleeve assumptions.',
        historical_windows:{historical_2022:{observed_start:'2022-01-04',observed_end:'2022-10-11'}},
        plans:[{id:'selected',label:'Research choice',trades:[],cash_after_contribution_cents:66000,
          cash_weight_pct:20,scenarios:[{id:'crypto_shock',label:'Illustrative crypto shock',kind:'hypothetical',
            shocks_pct:{crypto:-80,equity:-10},status:'CALCULATED',loss_including_entry_cost_cents:120000,
            loss_pct_of_starting_wealth:45,exceeds_tolerance:true},
          {id:'historical_2022',label:'Observed 2022 window',kind:'historical_window',status:'INCOMPLETE',reason:'Missing historical instrument.'}]}],
        limitations:['Illustrative shocks are not forecasts.']}})
    const view = render(<OptimizerSummary />)
    fireEvent.click(screen.getByRole('button', {name:'COMPARE PORTFOLIO OPTIONS'}))
    await waitFor(() => expect(screen.getByText('Portfolio downside comparison')).toBeTruthy())
    fireEvent.click(screen.getByText('Portfolio downside comparison'))
    expect(screen.getByText(/€660.00/)).toBeTruthy()
    expect(screen.getByText(/€1,200.00/)).toBeTruthy()
    expect(screen.getByText(/Above your tolerance reference/)).toBeTruthy()
    expect(screen.getByText(/Missing historical instrument/)).toBeTruthy()
    expect(screen.getByText(/crypto −80%/)).toBeTruthy()
    expect(screen.getByText(/Observed common endpoints 2022-01-04 to 2022-10-11/)).toBeTruthy()
    expect(screen.queryByRole('button',{name:/approve|execute|buy/i})).toBeNull()
    view.unmount()
  })
})
