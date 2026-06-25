import { useState, useEffect, useCallback } from 'react'
import { getTrainingHistory, getTrainingStatus, logJump, postJarvisChat } from '../../api/client'

const BG = '#0a0a0a'
const CARD = '#111'
const BORDER = '#1a1a1a'
const TEXT = '#e8e8e8'
const DIM = '#555'
const ORANGE = '#ff9f43'
const CYAN = '#20d8ec'
const RED = '#ef5350'
const MONO = "'Share Tech Mono', monospace"
const DISPLAY = "'Oswald', 'Inter', sans-serif"

const CM_PER_INCH = 2.54
const TARGET_INCHES = 32

function inchesToCm(inches) { return +(inches * CM_PER_INCH).toFixed(1) }
function cmToInches(cm) { return +(cm / CM_PER_INCH).toFixed(1) }

// ─── Jump Trend Chart ────────────────────────────────────────────────────────

function JumpChart({ progression, onLog }) {
  if (!progression || progression.length === 0) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: '14px', color: DIM, marginBottom: '20px', lineHeight: 1.6 }}>
          No jumps logged yet —<br />tap + to add your first measurement
        </div>
        <button onClick={onLog} style={logBtnStyle(true)}>+ LOG JUMP</button>
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
      {/* Best numbers */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
        {bestApproach != null && (
          <div>
            <div style={{ fontFamily: MONO, fontSize: '38px', color: ORANGE, lineHeight: 1 }}>
              {bestApproach}"
            </div>
            <div style={{ fontSize: '10px', color: DIM, fontFamily: DISPLAY, letterSpacing: '0.08em' }}>BEST APPROACH</div>
          </div>
        )}
        {bestStanding != null && (
          <div>
            <div style={{ fontFamily: MONO, fontSize: '38px', color: TEXT, lineHeight: 1 }}>
              {bestStanding}"
            </div>
            <div style={{ fontSize: '10px', color: DIM, fontFamily: DISPLAY, letterSpacing: '0.08em' }}>BEST STANDING</div>
          </div>
        )}
        <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
          <button onClick={onLog} style={logBtnStyle(false)}>+</button>
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        {/* Target line */}
        <line x1={PAD.l} y1={targetY} x2={W - PAD.r} y2={targetY}
          stroke={CYAN} strokeWidth="1" strokeDasharray="5 3" opacity="0.6" />
        <text x={W - PAD.r + 2} y={targetY + 4} fontSize="8" fill={CYAN} opacity="0.7" fontFamily={MONO}>32"</text>

        {/* Standing line (secondary) */}
        {standingLine.length >= 2 && (
          <polyline points={standingLine.join(' ')} fill="none" stroke={TEXT} strokeWidth="1.5"
            strokeLinejoin="round" strokeLinecap="round" opacity="0.4" strokeDasharray="4 2" />
        )}

        {/* Approach line (primary) */}
        {approachLine.length >= 2 && (
          <polyline points={approachLine.join(' ')} fill="none" stroke={ORANGE} strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* Dots */}
        {progression.map((p, i) => {
          const x = PAD.l + i * xStep
          return (
            <g key={p.date}>
              {p.approach && (
                <circle cx={x.toFixed(1)} cy={(PAD.t + yScale(cmToInches(p.approach))).toFixed(1)} r="3.5"
                  fill={ORANGE} stroke={BG} strokeWidth="1.5" />
              )}
              {p.standing && (
                <circle cx={x.toFixed(1)} cy={(PAD.t + yScale(cmToInches(p.standing))).toFixed(1)} r="2.5"
                  fill={TEXT} stroke={BG} strokeWidth="1" opacity="0.5" />
              )}
            </g>
          )
        })}

        {/* X axis labels */}
        {progression.map((p, i) => (
          <text key={p.date} x={(PAD.l + i * xStep).toFixed(1)} y={H - 4}
            textAnchor="middle" fontSize="8" fill={DIM} fontFamily="Inter,sans-serif">
            {xLabels[i]}
          </text>
        ))}

        {/* Y axis labels */}
        {[0, 0.5, 1].map(t => {
          const v = yMin + t * yRange
          const y = PAD.t + yScale(v)
          return (
            <text key={t} x={PAD.l - 4} y={y + 3} textAnchor="end" fontSize="8" fill={DIM} fontFamily={MONO}>
              {Math.round(v)}"
            </text>
          )
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '12px', height: '2px', background: ORANGE }} />
          <span style={{ fontSize: '9px', color: DIM, fontFamily: DISPLAY }}>APPROACH</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '12px', height: '2px', background: TEXT, opacity: 0.4 }} />
          <span style={{ fontSize: '9px', color: DIM, fontFamily: DISPLAY }}>STANDING</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '12px', height: '1px', background: CYAN, opacity: 0.6 }} />
          <span style={{ fontSize: '9px', color: DIM, fontFamily: DISPLAY }}>32" TARGET</span>
        </div>
      </div>
    </div>
  )
}

function logBtnStyle(large) {
  return {
    background: ORANGE,
    border: 'none',
    borderRadius: large ? '8px' : '50%',
    width: large ? 'auto' : '36px',
    height: large ? 'auto' : '36px',
    padding: large ? '10px 24px' : '0',
    color: '#000',
    fontSize: large ? '13px' : '20px',
    fontWeight: 700,
    fontFamily: DISPLAY,
    letterSpacing: large ? '0.08em' : '0',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  }
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
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#131313', border: `1px solid ${BORDER}`, borderRadius: '16px 16px 0 0',
        padding: '24px 20px 36px', width: '100%', maxWidth: '480px',
      }}>
        <div style={{ fontSize: '12px', fontFamily: DISPLAY, letterSpacing: '0.12em', color: ORANGE, marginBottom: '20px' }}>
          LOG JUMP
        </div>

        {/* Type toggle */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {['approach', 'standing'].map(t => (
            <button key={t} onClick={() => setJumpType(t)} style={{
              flex: 1, padding: '10px', border: `1px solid ${jumpType === t ? ORANGE : BORDER}`,
              background: jumpType === t ? '#1a1200' : 'none', borderRadius: '8px',
              color: jumpType === t ? ORANGE : DIM, fontSize: '12px', fontWeight: 600,
              fontFamily: DISPLAY, letterSpacing: '0.08em', cursor: 'pointer',
            }}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Height stepper */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '10px', color: DIM, fontFamily: DISPLAY, letterSpacing: '0.1em', marginBottom: '12px' }}>
            HEIGHT
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
            <button onClick={() => adjust(-0.5)} style={stepperBtn()}>−</button>
            <div style={{ fontFamily: MONO, fontSize: '52px', color: TEXT, minWidth: '100px', textAlign: 'center', lineHeight: 1 }}>
              {inches}"
            </div>
            <button onClick={() => adjust(0.5)} style={stepperBtn()}>+</button>
          </div>
          <div style={{ fontSize: '11px', color: DIM, fontFamily: MONO, marginTop: '8px' }}>
            {inchesToCm(inches)} cm · target: {TARGET_INCHES}"
          </div>
        </div>

        {error && <div style={{ fontSize: '12px', color: RED, marginBottom: '12px', textAlign: 'center' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '13px', background: 'none', border: `1px solid ${BORDER}`,
            borderRadius: '8px', color: DIM, fontSize: '13px', fontFamily: DISPLAY,
            letterSpacing: '0.06em', cursor: 'pointer',
          }}>CANCEL</button>
          <button onClick={handleSubmit} disabled={submitting} style={{
            flex: 2, padding: '13px', background: submitting ? '#332200' : ORANGE,
            border: 'none', borderRadius: '8px', color: submitting ? DIM : '#000',
            fontSize: '13px', fontWeight: 700, fontFamily: DISPLAY, letterSpacing: '0.06em',
            cursor: submitting ? 'default' : 'pointer',
          }}>
            {submitting ? 'LOGGING…' : 'LOG'}
          </button>
        </div>
      </div>
    </div>
  )
}

function stepperBtn() {
  return {
    width: '52px', height: '52px', borderRadius: '50%', background: '#1a1a1a',
    border: `1px solid #2a2a2a`, color: ORANGE, fontSize: '26px',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1,
  }
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
      <div style={{ fontSize: '11px', fontFamily: DISPLAY, letterSpacing: '0.1em', color: DIM, marginBottom: '8px' }}>
        PERSONAL RECORDS
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {PR_EXERCISES.map(({ key, label, aliases }) => {
          const { kg, reps } = findPR(sessions, aliases)
          return (
            <div key={key} style={{
              flex: 1, background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: '8px', padding: '10px 8px', textAlign: 'center',
            }}>
              <div style={{ fontFamily: MONO, fontSize: '18px', color: kg != null ? ORANGE : DIM }}>
                {kg != null ? `${kg}kg` : '—'}
              </div>
              {reps != null && (
                <div style={{ fontSize: '10px', color: DIM, fontFamily: MONO, marginBottom: '2px' }}>×{reps}</div>
              )}
              <div style={{ fontSize: '9px', color: DIM, fontFamily: DISPLAY, letterSpacing: '0.06em', marginTop: '4px' }}>
                {label}
              </div>
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
  // allow today even if not yet logged
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
  // Monday-based week
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
  // Last 6 weeks
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
      <div style={{ fontSize: '11px', fontFamily: DISPLAY, letterSpacing: '0.1em', color: DIM, marginBottom: '8px' }}>
        WEEKLY VOLUME (SETS)
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: `${BAR_H + 20}px` }}>
        {weeks.map(w => {
          const h = w.sets === 0 ? 2 : Math.max(4, (w.sets / maxSets) * BAR_H)
          return (
            <div key={w.wk} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{ fontSize: '9px', color: w.sets > 0 ? ORANGE : DIM, fontFamily: MONO }}>{w.sets || ''}</div>
              <div style={{
                width: '100%', height: `${h}px`,
                background: w.sets > 0 ? ORANGE : '#1a1a1a',
                borderRadius: '3px 3px 0 0',
                opacity: w.sets > 0 ? 1 : 0.4,
              }} />
              <div style={{ fontSize: '9px', color: DIM, fontFamily: DISPLAY }}>{w.label}</div>
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
    <div style={{ margin: '0 16px 16px', padding: '12px 14px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '8px' }}>
      <div style={{ fontSize: '10px', fontFamily: DISPLAY, letterSpacing: '0.1em', color: CYAN, marginBottom: '6px' }}>
        JARVIS ASSESSMENT
      </div>
      {loading
        ? <div style={{ fontSize: '13px', color: DIM }}>Analysing…</div>
        : <div style={{ fontSize: '13px', color: TEXT, lineHeight: 1.5 }}>{text}</div>
      }
    </div>
  )
}

// ─── Recovery Strip ───────────────────────────────────────────────────────────

function RecoveryStrip({ fatigueWarning }) {
  const good = !fatigueWarning
  return (
    <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: good ? '#9dff6f' : '#f0b429', flexShrink: 0,
      }} />
      <div>
        <div style={{ fontSize: '10px', fontFamily: DISPLAY, letterSpacing: '0.08em', color: DIM, marginBottom: '2px' }}>RECOVERY</div>
        <div style={{ fontSize: '12px', color: good ? '#9dff6f' : '#f0b429', fontFamily: 'Inter,sans-serif' }}>
          {good ? 'Good — CNS fresh, full output expected' : fatigueWarning}
        </div>
      </div>
    </div>
  )
}

// ─── Today's Session Card ─────────────────────────────────────────────────────

const _BORDER_COLOR = {
  high_intensity: ORANGE,
  jump: CYAN,
  general: '#2a2a2a',
  iso_only: '#2a2a2a',
  rest: '#2a2a2a',
  peak: CYAN,
  attempt: ORANGE,
  deload: '#2a2a2a',
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

function TodayCard({ todaySession, dunkGoal }) {
  const [startMsg, setStartMsg] = useState(null)
  if (!todaySession) return null

  const stype = todaySession.session_type || 'general'
  const ww = todaySession.working_weights
  const exercises = todaySession.exercises || []
  const accentColor = _BORDER_COLOR[stype] || '#2a2a2a'
  const badgeLabel = _BADGE_LABEL[stype] || stype.toUpperCase()
  const isActive = !['rest', 'deload'].includes(stype)

  return (
    <div style={{
      margin: '14px 16px 0',
      background: CARD,
      border: `1px solid ${BORDER}`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ fontSize: '10px', fontFamily: DISPLAY, letterSpacing: '0.1em', color: ORANGE, fontWeight: 600 }}>
          TODAY
        </div>
        <div style={{
          fontSize: '9px', fontFamily: DISPLAY, letterSpacing: '0.08em',
          color: accentColor === '#2a2a2a' ? DIM : accentColor,
          background: accentColor === '#2a2a2a' ? '#1a1a1a' : `${accentColor}18`,
          border: `1px solid ${accentColor === '#2a2a2a' ? '#2a2a2a' : accentColor}44`,
          borderRadius: '3px', padding: '2px 6px',
        }}>
          {badgeLabel}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '11px', color: DIM }}>
          {dunkGoal?.days_to_attempt}d to attempt
        </div>
      </div>

      {/* Session name */}
      <div style={{ padding: '0 14px 8px', fontSize: '16px', color: TEXT, fontFamily: DISPLAY, letterSpacing: '0.06em', fontWeight: 600 }}>
        {todaySession.display_name || stype.toUpperCase()}
      </div>

      {/* Intensity line — only for high_intensity */}
      {ww && (
        <div style={{ padding: '0 14px 10px', fontSize: '11px', color: ORANGE, fontFamily: MONO }}>
          {ww.intensity_pct}% · {ww.sets}×{ww.reps}
        </div>
      )}

      {/* Exercise rows */}
      {exercises.length > 0 && (
        <div style={{ borderTop: `1px solid ${BORDER}` }}>
          {exercises.map((ex, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 14px',
              borderBottom: i < exercises.length - 1 ? `1px solid ${BORDER}` : 'none',
            }}>
              <div style={{ fontSize: '13px', color: TEXT }}>{ex.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                {ex.sets_reps && (
                  <span style={{ fontSize: '11px', color: DIM, fontFamily: MONO }}>{ex.sets_reps}</span>
                )}
                <span style={{
                  fontSize: '11px', fontFamily: MONO,
                  color: ex.label?.includes('kg') ? ORANGE : DIM,
                  background: ex.label?.includes('kg') ? `${ORANGE}15` : 'transparent',
                  border: ex.label?.includes('kg') ? `1px solid ${ORANGE}33` : 'none',
                  borderRadius: '4px', padding: ex.label?.includes('kg') ? '2px 6px' : '0',
                }}>
                  {ex.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top set note */}
      {ww?.top_set_note && (
        <div style={{ padding: '8px 14px', borderTop: `1px solid ${BORDER}`, fontSize: '11px', color: '#666', fontFamily: 'Inter,sans-serif', fontStyle: 'italic' }}>
          {ww.top_set_note}
        </div>
      )}

      {/* Notes (iso/deload) */}
      {todaySession.notes && !ww?.top_set_note && (
        <div style={{ padding: '8px 14px', borderTop: `1px solid ${BORDER}`, fontSize: '11px', color: '#666', fontFamily: 'Inter,sans-serif' }}>
          {todaySession.notes}
        </div>
      )}

      {/* Start session button */}
      {isActive && (
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${BORDER}` }}>
          {startMsg
            ? <div style={{ fontSize: '12px', color: DIM, textAlign: 'center' }}>{startMsg}</div>
            : (
              <button
                onClick={() => setStartMsg('Session logging coming soon — tap Log Jump to record your jumps.')}
                style={{
                  width: '100%', padding: '11px', background: 'none',
                  border: `1px solid ${ORANGE}55`, borderRadius: '8px',
                  color: ORANGE, fontSize: '12px', fontWeight: 600,
                  fontFamily: DISPLAY, letterSpacing: '0.1em', cursor: 'pointer',
                }}
              >
                ▶ START SESSION
              </button>
            )
          }
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TrainingMetrics({ onQuickAsk }) {
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
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, color: DIM }}>
      Loading…
    </div>
  )
  if (!history || !statusData) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, color: RED }}>
      Could not reach backend
    </div>
  )

  const sessions = history.sessions || []
  const jumpProgression = history.jump_progression || []
  const streak = calcStreak(sessions)
  const { today_session, dunk_goal, fatigue_warning } = statusData

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: BG, color: TEXT, fontFamily: 'Inter,sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${BORDER}`, paddingBottom: '10px' }}>
        <span style={{ fontFamily: DISPLAY, fontSize: '13px', letterSpacing: '0.12em', color: ORANGE, fontWeight: 600 }}>TRAINING</span>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {streak > 0 && (
            <span style={{ fontSize: '11px', color: DIM }}>
              <span style={{ color: ORANGE, fontFamily: MONO }}>{streak}</span> day streak
            </span>
          )}
          <span style={{ fontSize: '11px', color: DIM }}>
            {dunk_goal?.current_phase?.toUpperCase()} · W{dunk_goal?.current_mesocycle_week}
          </span>
        </div>
      </div>

      {/* Recovery status */}
      <RecoveryStrip fatigueWarning={fatigue_warning} />

      {/* Today's session */}
      <TodayCard todaySession={today_session} dunkGoal={dunk_goal} />

      {/* Jump chart section */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: '11px', fontFamily: DISPLAY, letterSpacing: '0.1em', color: DIM, marginBottom: '12px' }}>
          VERTICAL JUMP TREND
        </div>
      </div>
      <JumpChart progression={jumpProgression} onLog={() => setModalOpen(true)} />

      {/* JARVIS insight */}
      <JarvisInsight text={insight} loading={insightLoading} />

      {/* PR Tracker */}
      <PRTracker sessions={sessions} />

      {/* Volume chart */}
      <VolumeChart sessions={sessions} />

      {/* Quick ask */}
      {onQuickAsk && (
        <div style={{ padding: '0 16px 32px' }}>
          <div style={{ fontSize: '11px', fontFamily: DISPLAY, letterSpacing: '0.1em', color: DIM, marginBottom: '8px' }}>
            QUICK ASK
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[
              'Am I on track for the dunk attempt?',
              'What are my working weights today?',
              'Should I adjust my training this week?',
            ].map(q => (
              <button key={q} onClick={() => onQuickAsk(q)} style={{
                background: 'none', border: `1px solid ${BORDER}`, borderRadius: '8px',
                padding: '10px 14px', color: '#aaa', fontSize: '13px', textAlign: 'left',
                cursor: 'pointer', fontFamily: 'Inter,sans-serif',
              }}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Log jump modal */}
      {modalOpen && (
        <JumpModal
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); load() }}
        />
      )}
    </div>
  )
}
