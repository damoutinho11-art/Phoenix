import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import TodayProtocol from './TodayProtocol'

const protocol = {
  protocol_id: '12345678901234567890',
  target: { calories: 2600, protein_g: 175, carbs_g: 315, fat_g: 70 },
  target_gap: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  target_matched: true,
  meals: [{
    meal_id: 'breakfast', title: 'Breakfast', timing: '08:00', portable: false,
    items: [{ item_id: 'cereal', name: 'Cookie Crisp', quantity_g: 100, measurement_state: 'as_served', is_estimate: false }],
    total: { calories: 380, protein_g: 7, carbs_g: 80, fat_g: 4 },
  }],
}

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

function api(overrides = {}) {
  return {
    getTodayProtocol: vi.fn().mockResolvedValue(protocol),
    getRecompositionReview: vi.fn().mockResolvedValue({ status: 'insufficient_evidence', complete_days: 0 }),
    postTodayProtocolLogMeal: vi.fn().mockResolvedValue({ status: 'logged' }),
    postTodayProtocolReplan: vi.fn().mockResolvedValue(protocol),
    ...overrides,
  }
}

afterEach(cleanup)

describe('TodayProtocol command boundary', () => {
  it('does not write until the user confirms one meal', async () => {
    const client = api()
    const user = userEvent.setup()
    render(<TodayProtocol api={client} />)

    await screen.findByRole('button', { name: 'EAT & LOG' })
    await user.click(screen.getByRole('button', { name: 'EAT & LOG' }))
    expect(client.postTodayProtocolLogMeal).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'CONFIRM LOG' }))
    await waitFor(() => expect(client.postTodayProtocolLogMeal).toHaveBeenCalledTimes(1))
    expect(client.postTodayProtocolLogMeal).toHaveBeenCalledWith({
      protocol_id: protocol.protocol_id,
      meal_id: 'breakfast',
    })
  })

  it('suppresses duplicate confirm clicks while a log request is pending', async () => {
    const pending = deferred()
    const client = api({ postTodayProtocolLogMeal: vi.fn(() => pending.promise) })
    const user = userEvent.setup()
    render(<TodayProtocol api={client} />)

    await user.click(await screen.findByRole('button', { name: 'EAT & LOG' }))
    const confirm = screen.getByRole('button', { name: 'CONFIRM LOG' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(client.postTodayProtocolLogMeal).toHaveBeenCalledTimes(1)
    pending.resolve({ status: 'logged' })
  })

  it('shows the stale refresh state and retains entered grams after a 409', async () => {
    const stale = Object.assign(new Error('stale'), { status: 409 })
    const client = api({ postTodayProtocolReplan: vi.fn().mockRejectedValue(stale) })
    const user = userEvent.setup()
    render(<TodayProtocol api={client} />)

    const input = await screen.findByRole('spinbutton', { name: 'Adjust Cookie Crisp grams' })
    await user.clear(input)
    await user.type(input, '125')
    await user.click(screen.getByRole('button', { name: 'ADJUST PORTION' }))

    expect(await screen.findByText(/Protocol changed\. Refresh before continuing\./i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'REFRESH' })).toBeTruthy()
    expect(screen.getByRole('spinbutton', { name: 'Adjust Cookie Crisp grams' }).value).toBe('125')
  })
})
