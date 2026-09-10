import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LedgerContent } from './LedgerContent'
import { getFinanceLedger, postManualFinanceTransaction } from '../../../api/client'

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

test('an ETF record preserves the actual purchased ticker', async () => {
  getFinanceLedger.mockResolvedValue({ transactions: [] })
  postManualFinanceTransaction.mockResolvedValue({})
  render(<LedgerContent assets={['global_core_etf']} />)
  fireEvent.change(await screen.findByRole('combobox', { name: 'ASSET' }), { target: { value: 'global_core_etf' } })
  const ticker = screen.getByRole('textbox', { name: /INSTRUMENT SYMBOL/ })
  fireEvent.change(ticker, { target: { value: 'SPYI.DE' } })
  for (const [label, value] of [['PLATFORM', 'Lightyear'], ['AMOUNT €', '100'], ['UNITS', '10'], ['PRICE', '10']]) {
    fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: /SAVE/ }))
  expect(postManualFinanceTransaction).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'SPYI.DE', asset: 'global_core_etf' }))
})
