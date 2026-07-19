import { useCallback, useEffect, useState } from 'react'
import {
  getFinanceSummary,
  getFinanceHoldings,
  getFinancePerformanceHistory,
  getNutritionStatus,
  getTrainingStatus,
  getTrainingRoutedSession,
  getTrainingHistory,
  getCalendarSnapshot,
  getConnectorsStatus,
} from '../../api/client'

// Fetches fast domain endpoints. Training retains explicit source state because
// operational controls must fail closed rather than render fixture values.
export default function useHoloData() {
  const [live, setLive] = useState({
    finance: null,
    holdings: null,
    financePerformance: null,
    nutrition: null,
    training: { status: null, routed: null, history: null, loading: true, error: null },
    calendar: null,
    connectors: null,
  })

  const refreshTraining = useCallback(async () => {
    setLive(s => ({ ...s, training: { ...s.training, loading: true, error: null } }))
    try {
      const [status, history] = await Promise.all([getTrainingStatus(), getTrainingHistory()])
      const routed = status.operational_state === 'active_plan'
        ? await getTrainingRoutedSession()
        : null
      setLive(s => ({ ...s, training: { status, routed, history, loading: false, error: null } }))
    } catch (error) {
      setLive(s => ({
        ...s,
        training: {
          ...s.training,
          loading: false,
          error: error instanceof Error ? error.message : 'Training data unavailable',
        },
      }))
    }
  }, [])

  useEffect(() => {
    let alive = true
    const grab = (key, fn) =>
      fn()
        .then(data => { if (alive) setLive(s => ({ ...s, [key]: data })) })
        .catch(() => {}) // Non-critical domains retain their existing presentation state.
    grab('finance', getFinanceSummary)
    grab('holdings', getFinanceHoldings)
    grab('financePerformance', getFinancePerformanceHistory)
    grab('nutrition', getNutritionStatus)
    refreshTraining()
    grab('calendar', getCalendarSnapshot)
    grab('connectors', getConnectorsStatus)
    return () => { alive = false }
  }, [refreshTraining])

  return { ...live, refreshTraining }
}
