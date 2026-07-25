import { useCallback, useEffect, useState } from 'react'
import {
  getTrainingHistory,
  getTrainingRoutedSession,
  getTrainingStatus,
} from '../../api/client'
import { SessionSub } from '../holo/subs/TrainingSubs'
import { normalizeTrainingLive } from '../holo/trainingLive.js'


export default function ActiveSession({ onBack }) {
  const [source, setSource] = useState({
    status: null,
    routed: null,
    history: null,
    loading: true,
    error: null,
  })

  const refreshTraining = useCallback(async () => {
    setSource(current => ({ ...current, loading: true, error: null }))
    try {
      const [status, history] = await Promise.all([
        getTrainingStatus(),
        getTrainingHistory(),
      ])
      const routed = status.operational_state === 'active_plan'
        ? await getTrainingRoutedSession()
        : null
      setSource({ status, routed, history, loading: false, error: null })
    } catch (error) {
      setSource(current => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'Training data unavailable',
      }))
    }
  }, [])

  useEffect(() => { refreshTraining() }, [refreshTraining])

  return (
    <SessionSub
      onClose={onBack}
      training={normalizeTrainingLive(source)}
      refreshTraining={refreshTraining}
    />
  )
}
