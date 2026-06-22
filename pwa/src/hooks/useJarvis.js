import { useState, useCallback } from 'react'
import {
  getHealth,
  getFinanceSummary,
  getFinanceRecommendation,
  getCalendarSnapshot,
  getFinanceBrief,
  getTrainingStatus,
  getTrainingBrief,
  getNutritionStatus,
  getRecipes,
  getLidlStaples,
  getNutritionBrief,
  getCrossDomainAlerts,
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

function formatTraining(data) {
  const g = data.dunk_goal
  const c = data.cut_status
  const lines = [
    `Dunk goal: ${g.days_to_attempt} days to attempt window (${g.weeks_to_attempt.toFixed(1)} weeks). Phase: ${g.current_phase}, week ${g.current_mesocycle_week}.`,
    `Today: ${data.today_session.session_type.toUpperCase()}.`,
    `Cut: ${c.days_remaining} days remaining. Target: ${c.target_bf_pct}% BF.`,
  ]
  if (data.fatigue_warning) lines.push(`⚡ ${data.fatigue_warning}`)
  if (data.has_hard_conflicts) lines.push(`⚠ CONFLICT: ${data.conflicts[0].detail}`)
  return lines.join('\n')
}

function formatNutrition(data) {
  const t = data.target
  const lines = [
    `${data.phase.toUpperCase()} — ${data.is_training_day ? 'Training day' : 'Rest day'}`,
    `Target: ${t.calories} kcal | ${t.protein_g}g protein | ${t.carbs_g}g carbs | ${t.fat_g}g fat`,
    `Logged: ${data.logged.total_calories} kcal | ${data.logged.total_protein_g}g protein`,
    `Remaining: ${data.remaining_calories} kcal | ${data.remaining_protein_g}g protein`,
  ]
  if (data.suggested_recipes.length > 0) {
    const names = data.suggested_recipes.map(r => r.name).join(', ')
    lines.push(`Suggested: ${names}`)
  }
  return lines.join('\n')
}

function formatRecipes(data) {
  if (!data.recipes || data.recipes.length === 0) return 'No recipes found.'
  return data.recipes.slice(0, 5).map(r =>
    `${r.name} — ${r.calories} kcal | ${r.protein_g}g protein`
  ).join('\n')
}

function formatShopping(data) {
  return data.staples.map(s =>
    `${s.name} (${s.unit}) — €${s.price_eur.toFixed(2)} | P:${s.protein_g}g`
  ).join('\n')
}

function formatHealth(data) {
  return `Status: ${data.status}. Domains online: ${data.domains.join(', ')}.`
}

function formatAlerts(data) {
  if (!data.alerts || data.alerts.length === 0) return 'No conflicts or alerts today.'
  return data.alerts.join('\n')
}

const UNREACHABLE = "I can't reach the server right now. Make sure the desktop is running."

const UNKNOWN_INTENT =
  "I don't understand that yet. Try: portfolio, recommendation, brief, training, calendar, nutrition, recipes, shopping, status."

function detectIntent(text) {
  const t = text.toLowerCase().trim()
  if (/\b(alerts|conflicts|crossdomain|cross domain|intelligence)\b/.test(t)) return 'alerts'
  if (/\b(portfolio|finance|summary|holdings)\b/.test(t)) return 'summary'
  if (/\b(recommendation|invest|weekly|buy)\b/.test(t)) return 'recommendation'
  if (/\b(calendar|schedule|rehearsal|plaan|opera)\b/.test(t)) return 'calendar'
  if (/\b(health|status|ping)\b/.test(t)) return 'health'
  if (/training brief|workout brief|session brief/.test(t)) return 'training_brief'
  if (/\b(brief|explain|why|reasoning|analysis)\b/.test(t)) return 'brief'
  if (/\b(training|workout|session|dunk|legs|jump|squat)\b/.test(t)) return 'training'
  if (/nutrition brief|food brief|macro brief/.test(t)) return 'nutrition_brief'
  if (/\b(nutrition|macros|food|eat|diet|calories)\b/.test(t)) return 'nutrition'
  if (/\b(recipes|recipe|meal|breakfast|lunch|dinner|cook)\b/.test(t)) return 'recipes'
  if (/\b(shopping|lidl|groceries|staples)\b/.test(t)) return 'shopping'
  return null
}

export function useJarvis() {
  const [messages, setMessages] = useState([])
  const [apiStatus, setApiStatus] = useState('unknown')
  const [loading, setLoading] = useState(false)

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
    const intent = detectIntent(text)
    if (!intent) {
      addMessage('jarvis', UNKNOWN_INTENT)
      return
    }
    setLoading(true)
    try {
      let response
      if (intent === 'alerts') response = formatAlerts(await getCrossDomainAlerts())
      else if (intent === 'summary') response = formatFinanceSummary(await getFinanceSummary())
      else if (intent === 'recommendation') response = formatRecommendation(await getFinanceRecommendation())
      else if (intent === 'calendar') response = formatCalendarSnapshot(await getCalendarSnapshot())
      else if (intent === 'health') response = formatHealth(await getHealth())
      else if (intent === 'brief') response = (await getFinanceBrief()).brief
      else if (intent === 'training') response = formatTraining(await getTrainingStatus())
      else if (intent === 'training_brief') response = (await getTrainingBrief()).brief
      else if (intent === 'nutrition') response = formatNutrition(await getNutritionStatus())
      else if (intent === 'recipes') response = formatRecipes(await getRecipes())
      else if (intent === 'nutrition_brief') response = (await getNutritionBrief()).brief
      else if (intent === 'shopping') response = formatShopping(await getLidlStaples())
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
