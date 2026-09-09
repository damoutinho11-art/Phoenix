import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LedgerContent } from './LedgerContent'
import { getFinanceLedger } from '../../../api/client'

vi.mock('../../../api/client', () => ({
  getFinanceLedger: vi.fn(), postManualFinanceTransaction: vi.fn(),
  getFinanceTransactionApplyPreview: vi.fn(), postFinanceTransactionApply: vi.fn(),
  postFinanceTransactionVoid: vi.fn(),
}))
afterEach(() => { cleanup(); vi.resetAllMocks() })

test('a first ETH or SOL buy can be recorded before either is in holdings', async () => {
  getFinanceLedger.mockResolvedValue({ transactions: [] })
  render(<LedgerContent assets={['btc', 'global_core_etf']} />)
  const asset = await screen.findByRole('combobox', { name: 'ASSET' })
  for (const value of ['eth', 'sol']) {
    expect(screen.getByRole('option', { name: value.toUpperCase() })).toBeTruthy()
    fireEvent.change(asset, { target: { value } })
    expect(asset.value).toBe(value)
  }
})
