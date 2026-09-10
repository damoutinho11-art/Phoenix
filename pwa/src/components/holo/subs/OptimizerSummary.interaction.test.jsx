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
})
