import { useCallback, useEffect, useRef, useState } from 'react'
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
import {
  isCurrentTrainingRequest,
  reconcileTrainingSources,
} from './trainingLive.js'

const sourceState = () => ({ loading: true, error: null, verifiedAt: null })
const errorMessage = error => error instanceof Error ? error.message : String(error || 'SOURCE_UNAVAILABLE')

// Fetches the fast, real domain endpoints once on mount. Finance carries an
// explicit source state so a failed request cannot masquerade as live data.
export default function useHoloData() {
  const [live, setLive] = useState({
    finance: null,
    holdings: null,
    financePerformance: null,
    nutrition: null,
    training: { status: null, routed: null, history: null, loading: true, error: null },
    calendar: null,
    connectors: null,
    status: {
      finance: sourceState(),
    },
  })
  const trainingRequest = useRef(0)

  const refreshTraining = useCallback(async () => {
    const requestId = trainingRequest.current + 1
    trainingRequest.current = requestId
    setLive(s => ({ ...s, training: { ...s.training, loading: true, error: null } }))
    try {
      const [status, history] = await Promise.all([getTrainingStatus(), getTrainingHistory()])
      const routed = status.operational_state === 'active_plan'
        ? await getTrainingRoutedSession()
        : null
      if (!isCurrentTrainingRequest(requestId, trainingRequest.current)) return
      const training = reconcileTrainingSources({ status, routed, history })
      setLive(s => ({ ...s, training }))
    } catch (error) {
      if (!isCurrentTrainingRequest(requestId, trainingRequest.current)) return
      setLive(s => ({
        ...s,
        training: {
          status: null,
          routed: null,
          history: s.training.history,
          loading: false,
          error: error instanceof Error ? error.message : 'Training data unavailable',
        },
      }))
    }
  }, [])

  useEffect(() => {
    let alive = true
    const grab = (key, fn, { tracked = false } = {}) =>
      fn()
        .then(data => {
          if (!alive) return
          setLive(s => ({
            ...s,
            [key]: data,
            ...(tracked ? {
              status: {
                ...s.status,
                [key]: { loading: false, error: null, verifiedAt: new Date().toISOString() },
              },
            } : {}),
          }))
        })
        .catch(error => {
          if (!alive || !tracked) return
          setLive(s => ({
            ...s,
            [key]: null,
            status: {
              ...s.status,
              [key]: { loading: false, error: errorMessage(error), verifiedAt: null },
            },
          }))
        })
    grab('finance', getFinanceSummary, { tracked: true })
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
