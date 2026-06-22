import { useState, useCallback } from 'react'
import {
  getHealth,
  getFinanceSummary,
  getFinanceRecommendation,
  getCalendarSnapshot,
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

function formatRecommendation(data) {
  const lines = [`Weekly budget: €${data.week_budget.toFixed(2)}`]
  lines.push(`Mode: ${data.portfolio_mode}`)
  if (data.recommendations.length === 0) {
    lines.push('No buys recommended this week.')
  } else {
    data.recommendations.forEach(r => {
      lines.push(`  ${r.asset.toUpperCase()} €${r.amount.toFixed(2)} via ${r.route} (${r.lane})`)
    })
  }
  lines.push(data.rationale)
  lines.push('Requires manual approval. No trades executed.')
  if (data.warnings.length) lines.push(`Notes: ${data.warnings.join('; ')}`)
  return lines.join('\n')
}

function formatHealth(data) {
  return `Status: ${data.status}. Domains online: ${data.domains.join(', ')}.`
}

const UNREACHABLE = "I can't reach the server right now. Make sure the desktop is running."

const UNKNOWN_INTENT =
  "I don't understand that yet. Try: portfolio, recommendation, calendar, status."

function detectIntent(text) {
  const t = text.toLowerCase().trim()
  if (/\b(portfolio|finance|summary|holdings)\b/.test(t)) return 'summary'
  if (/\b(recommendation|invest|weekly|buy)\b/.test(t)) return 'recommendation'
  if (/\b(calendar|schedule|rehearsal|plaan|opera)\b/.test(t)) return 'calendar'
  if (/\b(health|status|ping)\b/.test(t)) return 'health'
  return null
}

export function useJarvis() {
  const [messages, setMessages] = useState([])
  const [apiStatus, setApiStatus] = useState('unknown') // 'ok' | 'error' | 'unknown'
  const [loading, setLoading] = useState(false)

  const addMessage = useCallback((role, text) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), role, text }])
  }, [])

  const greet = useCallback(async () => {
    setLoading(true)
    try {
      const [summary, calendar] = await Promise.all([
        getFinanceSummary(),
        getCalendarSnapshot(),
      ])
      setApiStatus('ok')
      const lines = [
        `Good ${timeOfDay()}.`,
        formatFinanceSummary(summary),
        formatCalendarSnapshot(calendar, { brief: true }),
      ]
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
    const intent = detectIntent(text)
    if (!intent) {
      addMessage('jarvis', UNKNOWN_INTENT)
      return
    }
    setLoading(true)
    try {
      let response
      if (intent === 'summary') response = formatFinanceSummary(await getFinanceSummary())
      else if (intent === 'recommendation') response = formatRecommendation(await getFinanceRecommendation())
      else if (intent === 'calendar') response = formatCalendarSnapshot(await getCalendarSnapshot())
      else if (intent === 'health') response = formatHealth(await getHealth())
      setApiStatus('ok')
      addMessage('jarvis', response)
    } catch {
      setApiStatus('error')
      addMessage('jarvis', UNREACHABLE)
    } finally {
      setLoading(false)
    }
  }, [addMessage])

  return { messages, apiStatus, loading, greet, send }
}
