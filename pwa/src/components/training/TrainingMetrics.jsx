import { useState, useEffect, useCallback } from 'react'
import { getTrainingHistory, getTrainingStatus, logJump, postJarvisChat } from '../../api/client'

const CM_PER_INCH = 2.54
const TARGET_INCHES = 32

function inchesToCm(inches) { return +(inches * CM_PER_INCH).toFixed(1) }
function cmToInches(cm) { return +(cm / CM_PER_INCH).toFixed(1) }

const _BORDER_COLOR = {
  high_intensity: 'var(--accent-training)',
  jump: 'var(--cyan)',
  general: 'rgba(32,216,236,.12)',
  iso_only: 'rgba(32,216,236,.12)',
  rest: 'rgba(32,216,236,.08)',
  peak: 'var(--cyan)',
  attempt: 'var(--accent-training)',
  deload: 'rgba(32,216,236,.08)',
}

const _BADGE_LABEL = {
  high_intensity: 'LOWER',
  general: 'UPPER',
  jump: 'JUMP',
  iso_only: 'ISO',
  rest: 'REST',
  peak: 'PEAK',
  attempt: 'ATTEMPT',
  deload: 'DELOAD',
}

// ─── Jump Trend Chart ────────────────────────────────────────────────────────

function JumpChart({ progression, onLog }) {
  if (!progression || progression.length === 0) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)', marginBottom: 20, lineHeight: 1.6 }}>
          No jumps logged yet —<br />tap + to add your first measurement
        </div>
        <button onClick={onLog} className="action lg" style={{ background: 'rgba(255,143,46,.12)', borderColor: 'var(--accent-training)', color: 'var(--accent-training)' }}>
          + LOG JUMP
        </button>
      </div>
    )
  }

  const approachPts = progression.filter(p => p.approach != null)
  const bestApproach = approachPts.length ? Math.max(...approachPts.map(p => cmToInches(p.approach))) : null
  const bestStanding = progression.filter(p => p.standing != null).length
    ? Math.max(...progression.filter(p => p.standing != null).map(p => cmToInches(p.standing)))
    : null

  const W = 340, H = 130, PAD = { t: 14, r: 14, b: 28, l: 36 }
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b

  const allInches = progression.flatMap(p => [
    p.approach ? cmToInches(p.approach) : null,
    p.standing ? cmToInches(p.standing) : null,
  ].filter(Boolean))
  const yMin = Math.min(TARGET_INCHES - 4, ...(allInches.length ? allInches : [TARGET_INCHES - 4]))
  const yMax = Math.max(TARGET_INCHES + 2, ...(allInches.length ? allInches : [TARGET_INCHES + 2]))
  const yRange = yMax - yMin

  const xStep = plotW / Math.max(1, progression.length - 1)
  const yScale = v => plotH - ((v - yMin) / yRange) * plotH
  const targetY = PAD.t + yScale(TARGET_INCHES)

  const approachLine = progression
    .map((p, i) => p.approach ? `${(PAD.l + i * xStep).toFixed(1)},${(PAD.t + yScale(cmToInches(p.approach))).toFixed(1)}` : null)
    .filter(Boolean)
  const standingLine = progression
    .map((p, i) => p.standing ? `${(PAD.l + i * xStep).toFixed(1)},${(PAD.t + yScale(cmToInches(p.standing))).toFixed(1)}` : null)
    .filter(Boolean)

  const xLabels = progression.map(p => {
    const d = new Date(p.date + 'T00:00:00')
    return `${d.getMonth() + 1}/${d.getDate()}`
  })

  return (
    <div style={{ padding: '0 16px 8px' }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        {bestApproach != null && (
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 38, color: 'var(--accent-training)', lineHeight: 1 }}>
              {bestApproach}"
            </div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 9, color: 'var(--muted)', letterSpacing: '.08em' }}>BEST APPROACH</div>
          </div>
        )}
        {bestStanding != null && (
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 38, color: 'var(--text)', lineHeight: 1 }}>
              {bestStanding}"
            </div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 9, color: 'var(--muted)', letterSpacing: '.08em' }}>BEST STANDING</div>
          </div>
        )}
        <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
          <button onClick={onLog} className="action" style={{ borderColor: 'var(--accent-training)', color: 'var(--accent-training)', background: 'rgba(255,143,46,.08)', fontSize: 16, padding: '6px 12px' }}>+</button>
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        <line x1={PAD.l} y1={targetY} x2={W - PAD.r} y2={targetY}
          stroke="var(--cyan)" strokeWidth="1" strokeDasharray="5 3" opacity="0.6" />
        <text x={W - PAD.r + 2} y={targetY + 4} fontSize="8" fill="var(--cyan)" opacity="0.7" fontFamily="'Share Tech Mono', monospace">32"</text>

        {standingLine.length >= 2 && (
          <polyline points={standingLine.join(' ')} fill="none" stroke="var(--text)" strokeWidth="1.5"
            strokeLinejoin="round" strokeLinecap="round" opacity="0.4" strokeDasharray="4 2" />
        )}

        {approachLine.length >= 2 && (
          <polyline points={approachLine.join(' ')} fill="none" stroke="#ff8f2e" strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" />
        )}

        {progression.map((p, i) => {
          const x = PAD.l + i * xStep
          return (
            <g key={p.date}>
              {p.approach && (
                <circle cx={x.toFixed(1)} cy={(PAD.t + yScale(cmToInches(p.approach))).toFixed(1)} r="3.5"
                  fill="#ff8f2e" stroke="var(--bg)" strokeWidth="1.5" />
              )}
              {p.standing && (
                <circle cx={x.toFixed(1)} cy={(PAD.t + yScale(cmToInches(p.standing))).toFixed(1)} r="2.5"
                  fill="var(--text)" stroke="var(--bg)" strokeWidth="1" opacity="0.5" />
              )}
            </g>
          )
        })}

        {progression.map((p, i) => (
          <text key={p.date} x={(PAD.l + i * xStep).toFixed(1)} y={H - 4}
            textAnchor="middle" fontSize="8" fill="var(--dim)" fontFamily="'Saira Condensed', sans-serif">
            {xLabels[i]}
          </text>
        ))}

        {[0, 0.5, 1].map(t => {
          const v = yMin + t * yRange
          const y = PAD.t + yScale(v)
          return (
            <text key={t} x={PAD.l - 4} y={y + 3} textAnchor="end" fontSize="8" fill="var(--dim)" fontFamily="'Share Tech Mono', monospace">
              {Math.round(v)}"
            </text>
          )
        })}
      </svg>

      <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
        {[['#ff8f2e', 'APPROACH'], ['rgba(201,246,255,.4)', 'STANDING'], ['var(--cyan)', '32" TARGET']].map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 12, height: 2, background: c }} />
            <span style={{ fontFamily: 'var(--display)', fontSize: 9, color: 'var(--muted)' }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Log Jump Modal ───────────────────────────────────────────────────────────

function JumpModal({ onClose, onSuccess }) {
  const [jumpType, setJumpType] = useState('approach')
  const [inches, setInches] = useState(24)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function adjust(delta) {
    setInches(v => Math.max(10, Math.min(50, +(v + delta).toFixed(1))))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      const today = new Date().toISOString().slice(0, 10)
      await logJump({ date: today, jump_type: jumpType, height_cm: inchesToCm(inches) })
      onSuccess()
    } catch {
      setError('Failed to log. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="glass" style={{ padding: '24px 20px 36px', width: '100%', maxWidth: 480, borderRadius: 0 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent-training)', letterSpacing: '.12em', marginBottom: 20 }}>
          LOG JUMP
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {['approach', 'standing'].map(t => (
            <button key={t} onClick={() => setJumpType(t)} className={`action${jumpType === t ? '' : ' ghost'}`} style={{ flex: 1, justifyContent: 'center', ...(jumpType === t ? { borderColor: 'var(--accent-training)', color: 'var(--accent-training)', background: 'rgba(255,143,46,.1)' } : {}) }}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '.1em', marginBottom: 12 }}>HEIGHT</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            <button onClick={() => adjust(-0.5)} className="action ghost" style={{ width: 52, height: 52, fontSize: 24, color: 'var(--accent-training)' }}>−</button>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 52, color: 'var(--text)', minWidth: 100, textAlign: 'center', lineHeight: 1 }}>
              {inches}"
            </div>
            <button onClick={() => adjust(0.5)} className="action ghost" style={{ width: 52, height: 52, fontSize: 24, color: 'var(--accent-training)' }}>+</button>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>
            {inchesToCm(inches)} cm · target: {TARGET_INCHES}"
          </div>
        </div>

        {error && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', marginBottom: 12, textAlign: 'center' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} className="action ghost" style={{ flex: 1 }}>CANCEL</button>
          <button onClick={handleSubmit} disabled={submitting} className={`action lg${submitting ? ' ghost' : ''}`} style={{ flex: 2, justifyContent: 'center', ...(!submitting ? { borderColor: 'var(--accent-training)', color: 'var(--accent-training)', background: 'rgba(255,143,46,.1)' } : {}) }}>
            {submitting ? 'LOGGING…' : 'LOG'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── PR Tracker ───────────────────────────────────────────────────────────────

const PR_EXERCISES = [
  { key: 'hex_bar_jump', label: 'HEX BAR JUMP', aliases: ['hex bar', 'hex_bar'] },
  { key: 'back_squat',   label: 'BACK SQUAT',   aliases: ['back squat', 'back_squat', 'squat'] },
  { key: 'power_clean',  label: 'POWER CLEAN',  aliases: ['power clean', 'power_clean', 'clean'] },
]

function findPR(sessions, aliases) {
  let bestKg = null
  let bestReps = null
  for (const s of sessions) {
    for (const ex of (s.exercises || [])) {
      const name = ex.name?.toLowerCase() || ''
      if (!aliases.some(a => name.includes(a))) continue
      for (const set of (ex.sets || [])) {
        if (set.weight_kg > (bestKg ?? -1)) {
          bestKg = set.weight_kg
          bestReps = set.reps
        }
      }
    }
  }
  return { kg: bestKg, reps: bestReps }
}

function PRTracker({ sessions }) {
  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div className="panel-title">PERSONAL RECORDS</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {PR_EXERCISES.map(({ key, label, aliases }) => {
          const { kg, reps } = findPR(sessions, aliases)
          return (
            <div key={key} className="metric" style={{ flex: 1, flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div className="value" style={{ fontSize: 18, color: kg != null ? 'var(--accent-training)' : 'var(--dim)' }}>
                {kg != null ? `${kg}kg` : '—'}
              </div>
              {reps != null && <div className="label" style={{ marginBottom: 2 }}>×{reps}</div>}
              <div className="label" style={{ marginTop: 4 }}>{label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Session Streak ───────────────────────────────────────────────────────────

function calcStreak(sessions) {
  if (!sessions.length) return 0
  const dates = new Set(sessions.map(s => s.date))
  let streak = 0
  let d = new Date()
  d.setHours(0, 0, 0, 0)
  const todayStr = d.toISOString().slice(0, 10)
  if (!dates.has(todayStr)) d.setDate(d.getDate() - 1)
  while (true) {
    const str = d.toISOString().slice(0, 10)
    if (!dates.has(str)) break
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

// ─── Weekly Volume Chart ──────────────────────────────────────────────────────

function weekStart(d) {
  const dt = new Date(d + 'T00:00:00')
  const day = dt.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  dt.setDate(dt.getDate() + diff)
  return dt.toISOString().slice(0, 10)
}

function buildWeeklyVolume(sessions) {
  const byWeek = {}
  for (const s of sessions) {
    const wk = weekStart(s.date)
    const sets = (s.exercises || []).reduce((acc, ex) => acc + (ex.sets?.length ?? 0), 0)
    byWeek[wk] = (byWeek[wk] ?? 0) + sets
  }
  const weeks = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i * 7)
    const wk = weekStart(d.toISOString().slice(0, 10))
    const label = `W${6 - i}`
    weeks.push({ wk, label, sets: byWeek[wk] ?? 0 })
  }
  return weeks
}

function VolumeChart({ sessions }) {
  const weeks = buildWeeklyVolume(sessions)
  const maxSets = Math.max(1, ...weeks.map(w => w.sets))
  const BAR_H = 60

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div className="panel-title">WEEKLY VOLUME (SETS)</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: `${BAR_H + 20}px` }}>
        {weeks.map(w => {
          const h = w.sets === 0 ? 2 : Math.max(4, (w.sets / maxSets) * BAR_H)
          return (
            <div key={w.wk} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: w.sets > 0 ? 'var(--accent-training)' : 'var(--dim)' }}>{w.sets || ''}</div>
              <div style={{
                width: '100%', height: `${h}px`,
                background: w.sets > 0 ? 'var(--accent-training)' : 'rgba(32,216,236,.1)',
                borderRadius: '3px 3px 0 0',
                boxShadow: w.sets > 0 ? '0 0 8px var(--accent-training)' : 'none',
              }} />
              <div style={{ fontFamily: 'var(--display)', fontSize: 9, color: 'var(--dim)' }}>{w.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── JARVIS Insight ───────────────────────────────────────────────────────────

function JarvisInsight({ text, loading }) {
  if (!text && !loading) return null
  return (
    <div className="glass" style={{ margin: '0 16px 16px', padding: '12px 14px', borderLeft: '3px solid var(--cyan)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--cyan)', letterSpacing: '.1em', marginBottom: 6 }}>
        JARVIS ASSESSMENT
      </div>
      {loading
        ? <div style={{ fontFamily: 'var(--body)', fontSize: 13, color: 'var(--dim)' }}>Analysing…</div>
        : <div style={{ fontFamily: 'var(--body)', fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{text}</div>
      }
    </div>
  )
}

// ─── Recovery Strip ───────────────────────────────────────────────────────────

function RecoveryStrip({ fatigueWarning }) {
  const good = !fatigueWarning
  return (
    <div className="row" style={{ margin: '12px 16px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: good ? 'var(--green)' : 'var(--gold)', flexShrink: 0,
        boxShadow: `0 0 8px ${good ? 'var(--green)' : 'var(--gold)'}`,
      }} />
      <div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: '.08em', marginBottom: 2 }}>RECOVERY</div>
        <div style={{ fontFamily: 'var(--body)', fontSize: 12, color: good ? 'var(--green)' : 'var(--gold)' }}>
          {good ? 'Good — CNS fresh, full output expected' : fatigueWarning}
        </div>
      </div>
    </div>
  )
}

// ─── Today's Session Card ─────────────────────────────────────────────────────

function TodayCard({ todaySession, dunkGoal, onStartSession }) {
  if (!todaySession) return null

  const stype = todaySession.session_type || 'general'
  const ww = todaySession.working_weights
  const exercises = todaySession.exercises || []
  const accentColor = _BORDER_COLOR[stype] || 'rgba(32,216,236,.12)'
  const badgeLabel = _BADGE_LABEL[stype] || stype.toUpperCase()
  const isActive = !['rest', 'deload'].includes(stype)

  return (
    <div className="glass" style={{
      margin: '14px 16px 0',
      borderLeft: `3px solid ${accentColor}`,
    }}>
      <div style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 9, color: 'var(--accent-training)', letterSpacing: '.1em' }}>TODAY</div>
        <span className="badge" style={{ color: accentColor, borderColor: accentColor + '44', background: accentColor + '18' }}>{badgeLabel}</span>
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>
          {dunkGoal?.days_to_attempt}d to attempt
        </div>
      </div>

      <div style={{ padding: '0 14px 8px', fontFamily: 'var(--display)', fontSize: 16, color: 'var(--text)', letterSpacing: '.06em' }}>
        {todaySession.display_name || stype.toUpperCase()}
      </div>

      {ww && (
        <div style={{ padding: '0 14px 10px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent-training)' }}>
          {ww.intensity_pct}% · {ww.sets}×{ww.reps}
        </div>
      )}

      {exercises.length > 0 && (
        <div style={{ borderTop: '1px solid var(--line)' }}>
          {exercises.map((ex, i) => (
            <div key={i} className="row" style={{
              padding: '9px 14px',
              borderBottom: i < exercises.length - 1 ? '1px solid var(--line)' : 'none',
              border: 'none', borderRadius: 0,
            }}>
              <div className="row-title" style={{ fontSize: 13 }}>{ex.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {ex.sets_reps && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>{ex.sets_reps}</span>
                )}
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 10,
                  color: ex.label?.includes('kg') ? 'var(--accent-training)' : 'var(--muted)',
                }}>
                  {ex.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {ww?.top_set_note && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--line)', fontFamily: 'var(--body)', fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
          {ww.top_set_note}
        </div>
      )}

      {todaySession.notes && !ww?.top_set_note && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--line)', fontFamily: 'var(--body)', fontSize: 11, color: 'var(--muted)' }}>
          {todaySession.notes}
        </div>
      )}

      {isActive && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)' }}>
          <button
            onClick={onStartSession}
            className="action lg"
            style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--accent-training)', color: 'var(--accent-training)', background: 'rgba(255,143,46,.08)' }}
          >
            ▶ START SESSION
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TrainingMetrics({ onQuickAsk, onNav }) {
  const [history, setHistory] = useState(null)
  const [statusData, setStatusData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [insight, setInsight] = useState(null)
  const [insightLoading, setInsightLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [h, s] = await Promise.all([getTrainingHistory(), getTrainingStatus()])
      setHistory(h)
      setStatusData(s)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!history) return
    setInsightLoading(true)
    postJarvisChat({
      domain: 'training',
      message: 'Give me a one-sentence assessment of my jump progression and whether I\'m on track for the dunk attempt',
    }).then(r => setInsight(r?.response || null))
      .catch(() => {})
      .finally(() => setInsightLoading(false))
  }, [history])

  if (loading) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
      Loading…
    </div>
  )
  if (!history || !statusData) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--red)', fontFamily: 'var(--mono)' }}>
      Could not reach backend
    </div>
  )

  const sessions = history.sessions || []
  const jumpProgression = history.jump_progression || []
  const streak = calcStreak(sessions)
  const { today_session, dunk_goal, fatigue_warning } = statusData

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'transparent', color: 'var(--text)', fontFamily: 'var(--body)' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: '.12em', color: 'var(--accent-training)' }}>TRAINING</span>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {streak > 0 && (
            <span className="badge" style={{ color: 'var(--accent-training)', borderColor: 'var(--accent-training)44' }}>
              <span style={{ fontFamily: 'var(--mono)' }}>{streak}</span> DAY STREAK
            </span>
          )}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>
            {dunk_goal?.current_phase?.toUpperCase()} · W{dunk_goal?.current_mesocycle_week}
          </span>
        </div>
      </div>

      <RecoveryStrip fatigueWarning={fatigue_warning} />
      <TodayCard todaySession={today_session} dunkGoal={dunk_goal} onStartSession={() => onNav?.('active-session')} />

      <div style={{ padding: '20px 16px 0' }}>
        <div className="panel-title">VERTICAL JUMP TREND</div>
      </div>
      <JumpChart progression={jumpProgression} onLog={() => setModalOpen(true)} />

      <JarvisInsight text={insight} loading={insightLoading} />
      <PRTracker sessions={sessions} />
      <VolumeChart sessions={sessions} />

      {onQuickAsk && (
        <div style={{ padding: '0 16px 32px' }}>
          <div className="panel-title">QUICK ASK</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              'Am I on track for the dunk attempt?',
              'What are my working weights today?',
              'Should I adjust my training this week?',
            ].map(q => (
              <button key={q} onClick={() => onQuickAsk(q)} className="action ghost" style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11 }}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <JumpModal
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); load() }}
        />
      )}
    </div>
  )
}
