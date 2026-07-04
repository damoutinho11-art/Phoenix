import { useEffect, useState } from 'react'
import {
  getCalendarSnapshot,
  getCrossDomainAlerts,
  getFinanceSummary,
  getNutritionStatus,
  getTrainingStatus,
} from '../api/client'

const MONO = 'var(--phx-font-mono)'
const DISPLAY = 'var(--phx-font-display)'
const BODY = 'var(--phx-font-body)'
const TEXT = 'var(--phx-text)'
const MUTED = 'var(--phx-muted)'

const DOMAIN_COLORS = {
  calendar: 'var(--phx-calendar)',
  training: 'var(--phx-training)',
  nutrition: 'var(--phx-nutrition)',
  finance: 'var(--phx-finance)',
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'GOOD MORNING'
  if (h < 18) return 'GOOD AFTERNOON'
  return 'GOOD EVENING'
}

function clockLine() {
  const now = new Date()
  const day = now.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return `${day} · ${time}`
}

function formatEur(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : '—'
}

function Reactor({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open the PHOENIX voice deck"
      style={{ position: 'relative', width: 148, height: 148, margin: '4px auto 2px', display: 'block', background: 'none', border: 'none', cursor: 'pointer', filter: 'drop-shadow(0 0 22px rgba(32,216,236,.22))' }}
    >
      <svg width="148" height="148" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(32,216,236,.4)" strokeWidth=".7" strokeDasharray="1 3.1" />
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(32,216,236,.16)" strokeWidth="1" />
        <circle cx="50" cy="50" r="42" fill="none" stroke="#20d8ec" strokeWidth="1.4" strokeLinecap="round"
          strokeDasharray="66 198"
          style={{ transformOrigin: '50% 50%', animation: 'phx-reactor-sweep 6s linear infinite' }} />
        <circle cx="50" cy="50" r="34" fill="rgba(3,10,14,.9)" stroke="rgba(125,240,255,.3)" strokeWidth=".8" />
        <circle cx="50" cy="50" r="5.5" fill="#7df0ff" style={{ filter: 'drop-shadow(0 0 6px #20d8ec)' }} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 34, fontFamily: MONO, fontSize: 7, letterSpacing: '.26em', color: 'rgba(125,240,255,.6)' }}>
        VOICE DECK
      </span>
    </button>
  )
}

function BriefRow({ color, label, fact, action, onClick, loading }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', display: 'grid', gap: 3,
        padding: '10px 12px', border: '1px solid color-mix(in srgb, ' + color + ' 16%, transparent)',
        borderLeft: '3px solid ' + color, background: 'color-mix(in srgb, ' + color + ' 4%, transparent)',
        cursor: 'pointer',
      }}
    >
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.24em', color: 'color-mix(in srgb, ' + color + ' 72%, white 8%)', textTransform: 'uppercase' }}>{label}</span>
        {action && <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.14em', color: MUTED, textTransform: 'uppercase' }}>{action} →</span>}
      </span>
      {loading
        ? <span className="phx-skeleton" style={{ height: 14, width: '62%' }} />
        : <span style={{ fontFamily: BODY, fontSize: 14, fontWeight: 500, color: TEXT, lineHeight: 1.35 }}>{fact}</span>}
    </button>
  )
}

export default function MissionControl({ onOpenDomain, onLogMeal, onQuickAsk, onVoiceDeck }) {
  const [calendar, setCalendar] = useState(null)
  const [training, setTraining] = useState(null)
  const [nutrition, setNutrition] = useState(null)
  const [finance, setFinance] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [failed, setFailed] = useState({})

  useEffect(() => {
    let alive = true
    const grab = (fn, set, key) => fn()
      .then(v => { if (alive) set(v) })
      .catch(() => { if (alive) setFailed(f => ({ ...f, [key]: true })) })
    grab(getCalendarSnapshot, setCalendar, 'calendar')
    grab(getTrainingStatus, setTraining, 'training')
    grab(getNutritionStatus, setNutrition, 'nutrition')
    grab(getFinanceSummary, setFinance, 'finance')
    grab(getCrossDomainAlerts, setAlerts, 'alerts')
    return () => { alive = false }
  }, [])

  const nextEvent = calendar?.events?.[0] || null
  const calFact = failed.calendar ? 'Snapshot offline'
    : !calendar ? null
    : nextEvent ? `Next: ${nextEvent.time_start || '--:--'} ${nextEvent.title}`
    : 'Open slate — no events in the visible window'

  const session = training?.today_session
  const days = training?.dunk_goal?.days_to_attempt
  const trnFact = failed.training ? 'Status offline'
    : !training ? null
    : `${(session?.session_type || 'SESSION').toUpperCase()} day · ${days != null ? `${days} days to dunk attempt` : 'mission clock unset'}`

  const nutFact = failed.nutrition ? 'Status offline'
    : !nutrition ? null
    : `${Math.round(nutrition.remaining_calories ?? 0).toLocaleString('en-US')} kcal · ${Math.round(nutrition.remaining_protein_g ?? 0)} g protein open`

  const finFact = failed.finance ? 'Summary offline'
    : !finance ? null
    : `${formatEur(finance.total_invested)} invested · ${finance.week_done ? 'week closed' : 'weekly deploy open'}`

  return (
    <div className="phx-scope-finance" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: 'radial-gradient(circle at 50% 0%, rgba(32,216,236,.09), transparent 30rem), linear-gradient(180deg, #071019 0%, var(--phx-bg) 46%, #04090e 100%)', color: TEXT, fontFamily: BODY }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 18px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 0 11px', borderBottom: '1px solid rgba(32,216,236,.1)' }}>
          <span style={{ fontFamily: MONO, fontSize: 8.3, letterSpacing: '.28em', color: 'rgba(32,216,236,.46)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>PHOENIX · PERSONAL HEURISTIC OPERATING ENGINE</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 8.3, letterSpacing: '.28em', color: 'var(--phx-positive)', flexShrink: 0 }}>
            <i style={{ width: 5, height: 5, borderRadius: 99, background: 'currentColor', boxShadow: '0 0 8px currentColor' }} />ONLINE
          </span>
        </div>

        <div style={{ textAlign: 'center', padding: '18px 0 4px' }}>
          <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.29em', color: 'rgba(32,216,236,.55)' }}>{clockLine()}</div>
          <h1 style={{ margin: '6px 0 0', fontFamily: DISPLAY, fontSize: 'clamp(26px, 6vw, 34px)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: TEXT }}>
            {greeting()}, <span style={{ color: '#20d8ec', textShadow: '0 0 28px rgba(32,216,236,.35)' }}>DIOGO</span>
          </h1>
        </div>

        <Reactor onClick={onVoiceDeck} />

        {alerts?.alerts?.length > 0 && (
          <div style={{ display: 'grid', gap: 6, margin: '10px 0 14px' }}>
            {alerts.alerts.slice(0, 3).map(text => (
              <div key={text} style={{ padding: '7px 11px', border: '1px solid color-mix(in srgb, var(--phx-caution) 22%, transparent)', borderLeft: '2px solid var(--phx-caution)', background: 'color-mix(in srgb, var(--phx-caution) 4%, transparent)', fontFamily: MONO, fontSize: 9.5, letterSpacing: '.06em', color: 'var(--phx-caution)', lineHeight: 1.5 }}>
                ⚠ {text}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gap: 8, marginTop: alerts?.alerts?.length ? 0 : 14 }}>
          <BriefRow color={DOMAIN_COLORS.calendar} label="Calendar · Next" fact={calFact} loading={!calFact} action="Open" onClick={() => onOpenDomain('calendar')} />
          <BriefRow color={DOMAIN_COLORS.training} label="Training · Today" fact={trnFact} loading={!trnFact} action="Open" onClick={() => onOpenDomain('training')} />
          <BriefRow color={DOMAIN_COLORS.nutrition} label="Nutrition · Remaining" fact={nutFact} loading={!nutFact} action="Log" onClick={() => onOpenDomain('nutrition')} />
          <BriefRow color={DOMAIN_COLORS.finance} label="Finance · Position" fact={finFact} loading={!finFact} action="Open" onClick={() => onOpenDomain('finance')} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 7, marginTop: 14 }}>
          {[
            ['RUN SCAN', () => onOpenDomain('training')],
            ['LOG MEAL', onLogMeal],
            ['DAY BRIEF', () => onQuickAsk('Give me my full day brief across calendar, training, nutrition, and finance.')],
            ['ASK', () => onQuickAsk(null)],
          ].map(([label, fn]) => (
            <button key={label} type="button" className="phx-btn" onClick={fn} style={{ minHeight: '2.5rem', padding: '.55rem .3rem', fontSize: 8.5 }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 16, textAlign: 'center', fontFamily: MONO, fontSize: 7.5, letterSpacing: '.2em', color: 'rgba(32,216,236,.28)' }}>
          READ-ONLY BRIEF · TAP THE REACTOR FOR VOICE
        </div>
      </div>
    </div>
  )
}
