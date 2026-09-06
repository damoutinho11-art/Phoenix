import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { getNutritionShoppingList } from '../../api/client'
import ShoppingList from './ShoppingList'

vi.mock('../../api/client', () => ({
  getNutritionShoppingList: vi.fn(),
}))

afterEach(() => {
  cleanup()
  getNutritionShoppingList.mockReset()
})

async function showNextMeal() {
  getNutritionShoppingList
    .mockResolvedValueOnce({
      source: 'today_protocol_4_days',
      days: 4,
      need_to_buy: [],
      already_have: [],
      categories: {},
    })
    .mockResolvedValueOnce({
      source: 'meal_builder',
      source_title: 'Next meal',
      need_to_buy_count: 1,
      already_have_count: 0,
      need_to_buy: [{
        item_id: 'chicken',
        item_type: 'food',
        name: 'Chicken Breast',
        category: 'protein',
        quantity: 0,
        servings: 1.5,
        unit: '100g',
        measurement_state: '',
      }],
      already_have: [],
      categories: {},
    })

  const user = userEvent.setup()
  render(<ShoppingList onBack={() => {}} />)
  await user.click(await screen.findByRole('button', { name: 'FROM NEXT MEAL' }))
  await screen.findByText('Chicken Breast')
}

it('shows an exact four-day current-protocol grocery list', async () => {
  getNutritionShoppingList.mockResolvedValue({
    source: 'today_protocol_4_days',
    source_title: 'Four days · current protocol',
    days: 4,
    principle: 'Phoenix creates a pantry-aware shopping list only.',
    need_to_buy_count: 1,
    already_have_count: 1,
    estimated_missing_cost_eur: 0,
    estimated_full_cost_eur: 0,
    need_to_buy: [{
      item_id: 'cookie_crisp',
      item_type: 'food',
      name: 'Cookie Crisp',
      category: 'carbs',
      quantity: 154,
      unit: 'g',
      measurement_state: 'as served',
      source_label: 'REFERENCE ESTIMATE',
      is_estimate: true,
    }],
    already_have: [{
      item_id: 'yogurt',
      item_type: 'food',
      name: '0% Greek Yogurt',
      category: 'dairy / eggs',
      quantity: 1125.2,
      unit: 'g',
      measurement_state: 'as served',
      source_label: 'INVENTORY ESTIMATE',
      is_estimate: true,
      already_have: true,
    }],
    categories: {},
  })

  render(<ShoppingList onBack={() => {}} />)

  expect(await screen.findByText('4 DAYS · CURRENT PROTOCOL')).toBeTruthy()
  expect(screen.getByText('154 g · as served')).toBeTruthy()
  expect(screen.getByText('REFERENCE ESTIMATE')).toBeTruthy()
  expect(screen.getByText('4 DAY SUPPLY').nextElementSibling.textContent).toBe('4')
  expect(getNutritionShoppingList).toHaveBeenCalledWith('today_protocol_4_days')
})

it('falls back to servings for a next-meal item without an exact quantity', async () => {
  await showNextMeal()

  expect(screen.getByText('1.5× · 100g')).toBeTruthy()
})

it('hides the four-day supply summary for a next-meal response', async () => {
  await showNextMeal()

  expect(screen.queryByText('4 DAY SUPPLY')).toBeNull()
})

it('shows only the unavailable state when the grocery request fails', async () => {
  getNutritionShoppingList.mockRejectedValue(new Error('offline'))

  render(<ShoppingList onBack={() => {}} />)

  expect(await screen.findByText('Shopping list unavailable. Start the backend and refresh.')).toBeTruthy()
  expect(screen.queryByText('Nothing missing. Your pantry covers this plan.')).toBeNull()
})
