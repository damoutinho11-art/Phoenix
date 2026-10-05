import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CapitalAllocationBreakdown } from './CapitalAllocationBreakdown'

afterEach(cleanup)
it('separates regular capacity and usable capital without presenting the full approval as extra cash', () => {
  render(<CapitalAllocationBreakdown authority={{ data_ready: true,
    approved_one_time_capital_eur: 1255.46, regular_deployable_eur: 1185.16,
    one_time_deployable_eur: 1107.81 }} />)
  expect(screen.getByText(/MONTHLY CAPACITY/).textContent).toContain('€1185.16')
  expect(screen.getByText(/ONE-TIME CAPITAL AVAILABLE/).textContent).toContain('€1107.81')
  expect(screen.getByText(/1255.46 approved/)).toBeTruthy()
  expect(screen.getByText(/not income/)).toBeTruthy()
})
it.each([null, { data_ready: false, approved_one_time_capital_eur: 1255.46 },
  { data_ready: true, approved_one_time_capital_eur: 0 }])('hides an unavailable allocation', authority => {
  const { container } = render(<CapitalAllocationBreakdown authority={authority} />)
  expect(container.textContent).toBe('')
})
