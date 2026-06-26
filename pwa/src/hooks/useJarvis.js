import { useState, useCallback, useRef, useEffect } from 'react'
import { speak } from '../services/tts'
import {
  getFinanceSummary,
  getCalendarSnapshot,
  getTrainingStatus,
  getNutritionStatus,
  getCrossDomainAlerts,
  logMeal,
  deleteMeal,
  logWeight,
  lookupBarcode,
  postJarvisChat,
} from '../api/client'

function timeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

function formatFinanceSummary(data) {
  const overweight = data.sleeve_summary.filter(s => s.band_status === 'above_max').map(s => s.name)
  const underweight = data.sleeve_summary.filter(s => s.band_status === 'below_min').map(s => s.name)
  const lines = [`Finance: €${data.total_invested.toFixed(2)} invested.`]
  if (overweight.length) lines.push(`Above band: ${overweight.join(', ')}.`)
  if (underweight.length) lines.push(`Building: ${underweight.join(', ')}.`)
  if (data.staleness_warning) lines.push(`⚠ ${data.staleness_warning}`)
  return lines.join('\n')
}

function formatCalendarSnapshot(data, { brief = false } = {}) {
  const lines = []
  if (data.events.length === 0) {
    lines.push('Calendar: No events in the current window.')
    const aug = data.fetch_warnings && data.fetch_warnings.find(w => w.includes('AUGUST'))
    if (aug) lines.push('Season gap — next events from August 12.')
  } else {
    lines.push(`Calendar: ${data.events.length} event(s) found.`)
    data.events.slice(0, 5).forEach(e => {
      lines.push(`  ${e.date} ${e.time_start || ''} — ${e.title}`)
    })
  }
  if (!brief && data.fetch_warnings && data.fetch_warnings.length > 0) {
    lines.push(`\nNotes (${data.fetch_warnings.length}):`)
    data.fetch_warnings.forEach(w => lines.push(`  · ${w}`))
  }
  if (data.staleness_warning) lines.push(`\n⚠ ${data.staleness_warning}`)
  return lines.join('\n')
}

function formatBarcode(data) {
  return [
    `${data.name} (${data.barcode})`,
    `${data.calories} kcal | ${data.protein_g}g protein | ${data.fat_g}g fat | ${data.carbs_g}g carbs per 100g`,
    `Source: ${data.source}`,
  ].join('\n')
}

function detectDomain(text) {
  const t = text.toLowerCase()
  if (/\b(portfolio|finance|invest|buy|etf|btc|crypto|recommendation|brief|holdings|budget)\b/.test(t)) return 'finance'
  if (/\b(training|workout|session|dunk|legs|push|pull|squat|jump|lift|gym)\b/.test(t)) return 'training'
  if (/\b(nutrition|macros|food|eat|diet|calories|protein|carbs|fat|recipe|meal|cook|shopping|lidl)\b/.test(t)) return 'nutrition'
  if (/\b(calendar|schedule|rehearsal|opera|concert|performance)\b/.test(t)) return 'calendar'
  return 'home'
}

const UNREACHABLE = "I can't reach the server right now. Make sure the desktop is running."

export function useJarvis() {
  const [messages, setMessages] = useState([])
  const [apiStatus, setApiStatus] = useState('unknown')
  const [loading, setLoading] = useState(false)
  const historyRef = useRef([])

  useEffect(() => {
    historyRef.current = messages
  }, [messages])

  const addMessage = useCallback((role, text) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), role, text }])
  }, [])

  const greet = useCallback(async () => {
    setLoading(true)
    try {
      const [summary, calendar, trainingData, nutritionData, alerts] = await Promise.all([
        getFinanceSummary(),
        getCalendarSnapshot(),
        getTrainingStatus(),
        getNutritionStatus(),
        getCrossDomainAlerts(),
      ])
      setApiStatus('ok')
      const lines = [`Good ${timeOfDay()}.`]
      if (alerts.alerts && alerts.alerts.length > 0) {
        lines.push(...alerts.alerts)
      }
      lines.push(
        formatFinanceSummary(summary),
        formatCalendarSnapshot(calendar, { brief: true }),
        `Today: ${trainingData.today_session.session_type.toUpperCase()}. ${trainingData.dunk_goal.days_to_attempt} days to attempt.`,
        `Nutrition: ${nutritionData.remaining_calories} kcal remaining | ${nutritionData.remaining_protein_g}g protein to hit target.`,
      )
      addMessage('jarvis', lines.join('\n'))
    } catch {
      setApiStatus('error')
      addMessage('jarvis', `Good ${timeOfDay()}.\n${UNREACHABLE}`)
    } finally {
      setLoading(false)
    }
  }, [addMessage])

  const send = useCallback(async (text) => {
    addMessage('user', text)
    const t = text.toLowerCase().trim()
    setLoading(true)
    try {
      let response

      if (/\b(log weight|weigh|weight today)\b/.test(t)) {
        const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:kg)?/i)
        response = match
          ? `Weight logged: ${(await logWeight(Number(match[1].replace(',', '.')))).weight_kg} kg.`
          : 'Tell me the weight in kilograms, for example: log weight 73.2 kg.'
      } else if (/\bbarcode\s+\d+\b/.test(t)) {
        const barcode = text.match(/\d+/)?.[0]
        response = formatBarcode(await lookupBarcode(barcode))
      } else {
        const domain = detectDomain(text)
        const history = historyRef.current
          .slice(-10)
          .map(m => ({ role: m.role === 'jarvis' ? 'assistant' : 'user', content: m.text }))
        const data = await postJarvisChat({ message: text, domain, history })
        response = data.response
      }

      setApiStatus('ok')
      addMessage('jarvis', response)
      speak(response)
    } catch {
      setApiStatus('error')
      addMessage('jarvis', UNREACHABLE)
    } finally {
      setLoading(false)
    }
  }, [addMessage])

  const lookupBarcodeItem = useCallback(async (barcode) => {
    setLoading(true)
    try {
      const product = await lookupBarcode(barcode)
      setApiStatus('ok')
      addMessage('jarvis', formatBarcode(product))
      return product
    } catch {
      setApiStatus('error')
      addMessage('jarvis', 'Barcode not found or the lookup service is unavailable.')
      return null
    } finally {
      setLoading(false)
    }
  }, [addMessage])

  const logMealItem = useCallback((item) => logMeal(item), [])
  const deleteMealItem = useCallback((mealId) => deleteMeal(mealId), [])
  const recordWeight = useCallback((weightKg) => logWeight(weightKg), [])

  return {
    messages,
    apiStatus,
    loading,
    greet,
    send,
    lookupBarcodeItem,
    logMealItem,
    deleteMealItem,
    recordWeight,
  }
}
