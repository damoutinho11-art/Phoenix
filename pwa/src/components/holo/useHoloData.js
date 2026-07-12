import { useEffect, useState } from 'react'
import {
  getFinanceSummary,
  getFinanceHoldings,
  getNutritionStatus,
  getTrainingStatus,
  getCalendarSnapshot,
  getConnectorsStatus,
} from '../../api/client'

// Fetches the fast, real domain endpoints once on mount. Each key stays null
// until (and unless) its endpoint answers — consumers fall back to fixtures
// per-field, so a dead backend still renders the full scene.
export default function useHoloData() {
  const [live, setLive] = useState({
    finance: null,
    holdings: null,
    nutrition: null,
    training: null,
    calendar: null,
    connectors: null,
  })

  useEffect(() => {
    let alive = true
    const grab = (key, fn) =>
      fn()
        .then(data => { if (alive) setLive(s => ({ ...s, [key]: data })) })
        .catch(() => {}) // fixture fallback
    grab('finance', getFinanceSummary)
    grab('holdings', getFinanceHoldings)
    grab('nutrition', getNutritionStatus)
    grab('training', getTrainingStatus)
    grab('calendar', getCalendarSnapshot)
    grab('connectors', getConnectorsStatus)
    return () => { alive = false }
  }, [])

  return live
}
