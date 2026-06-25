import { useState, useEffect, useRef, useCallback } from 'react'
import { getTrainingStatus, logSession } from '../../api/client'

const BG = '#0a0a0a'
const CARD = '#111'
const BORDER = '#1a1a1a'
const TEXT = '#e8e8e8'
const DIM = '#555'
const ORANGE = '#ff9f43'
const GREEN = '#9dff6f'
const MONO = "'Share Tech Mono', monospace"
const DISPLAY = "'Oswald', 'Inter', sans-serif"

// Map engine session_type → SessionLogRequest session_type
const SESSION_TYPE_MAP = {
  high_intensity: 'Legs',
  general: 'Upper',
  jump: 'Legs',
  iso_only: 'Lower',
  peak: 'Lower',
  attempt: 'Legs',
  deload: 'Lower',
}

// Rest duration by session type (seconds)
function restDuration(sessionType) {
  if (sessionType === 'high_intensity') return 240
  if (sessionType === 'general') return 120
  return 90
}

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function parseExercises(exercises) {
  return exercises.map((ex, eIdx) => {
    const match = ex.sets_reps?.match(/(\d+)[×x](\d+)/)
    const numSets = match ? parseInt(match[1]) : 3
    const targetReps = match ? parseInt(match[2]) : 10
    const kgMatch = ex.label?.match(/(\d+(?:\.\d+)?)kg/)
    const targetKg = kgMatch ? parseFloat(kgMatch[1]) : 0
    return { name: ex.name, targetKg, targetReps, numSets, exerciseIdx: eIdx }
  })
}

function buildFlatSets(parsedExercises) {
  const flat = []
  for (const ex of parsedExercises) {
    for (let s = 1; s <= ex.numSets; s++) {
      flat.push({
        key: `${ex.exerciseIdx}-${s}`,
        exerciseName: ex.name,
        exerciseIdx: ex.exerciseIdx,
        setNum: s,
        totalSets: ex.numSets,
        targetKg: ex.targetKg,
        targetReps: ex.targetReps,
      })
    }
  }
  return flat
}

// ── Stepper button ──────────────────────────────────────────────────────────
function Stepper({ label, value, display, onInc, onDec }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '10px', color: DIM, fontFamily: DISPLAY, letterSpacing: '0.1em', marginBottom: '10px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
        <button onClick={onDec} style={stepBtn()}>−</button>
        <div style={{ fontFamily: MONO, fontSize: '44px', color: TEXT, minWidth: '90px', textAlign: 'center', lineHeight: 1 }}>
          {display}
        </div>
        <button onClick={onInc} style={stepBtn()}>+</button>
      </div>
    </div>
  )
}

function stepBtn() {
  return {
    width: '48px', height: '48px', borderRadius: '50%', background: '#1a1a1a',
    border: '1px solid #2a2a2a', color: ORANGE, fontSize: '24px',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
  }
}

// ── Log Modal ───────────────────────────────────────────────────────────────
function LogModal({ set, onLog, onCancel }) {
  const [kg, setKg] = useState(set.targetKg || 0)
  const [reps, setReps] = useState(set.targetReps || 10)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onCancel()}
    >
      <div style={{ background: '#131313', border: `1px solid ${BORDER}`, borderRadius: '16px 16px 0 0', padding: '24px 20px 36px', width: '100%', maxWidth: '480px' }}>
        <div style={{ fontSize: '11px', fontFamily: DISPLAY, letterSpacing: '0.12em', color: ORANGE, marginBottom: '4px' }}>
          LOG SET
        </div>
        <div style={{ fontSize: '14px', color: TEXT, fontFamily: DISPLAY, marginBottom: '28px' }}>
          {set.exerciseName} · Set {set.setNum}/{set.totalSets}
        </div>

        <div style={{ display: 'flex', gap: '32px', justifyContent: 'center', marginBottom: '32px' }}>
          <Stepper
            label="WEIGHT (KG)"
            value={kg}
            display={kg % 1 === 0 ? `${kg}` : kg.toFixed(1)}
            onDec={() => setKg(v => Math.max(0, +(v - 2.5).toFixed(1)))}
            onInc={() => setKg(v => +(v + 2.5).toFixed(1))}
          />
          <Stepper
            label="REPS"
            value={reps}
            display={reps}
            onDec={() => setReps(v => Math.max(1, v - 1))}
            onInc={() => setReps(v => v + 1)}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '13px', background: 'none', border: `1px solid ${BORDER}`,
            borderRadius: '8px', color: DIM, fontSize: '13px', fontFamily: DISPLAY,
            letterSpacing: '0.06em', cursor: 'pointer',
          }}>CANCEL</button>
          <button onClick={() => onLog({ kg, reps })} style={{
            flex: 2, padding: '13px', background: ORANGE, border: 'none',
            borderRadius: '8px', color: '#000', fontSize: '13px', fontWeight: 700,
            fontFamily: DISPLAY, letterSpacing: '0.06em', cursor: 'pointer',
          }}>LOG SET</button>
        </div>
      </div>
    </div>
  )
}

// ── Rest Timer ──────────────────────────────────────────────────────────────
function RestTimer({ seconds, nextSet, onSkip }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 90,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px',
    }}>
      <div style={{ fontSize: '11px', fontFamily: DISPLAY, letterSpacing: '0.2em', color: DIM }}>REST</div>
      <div style={{ fontFamily: MONO, fontSize: '72px', color: ORANGE, lineHeight: 1 }}>{fmt(seconds)}</div>
      {nextSet && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: DIM, fontFamily: DISPLAY, letterSpacing: '0.1em', marginBottom: '6px' }}>NEXT</div>
          <div style={{ fontSize: '14px', color: TEXT, fontFamily: DISPLAY }}>
            {nextSet.exerciseName} · Set {nextSet.setNum} · {nextSet.targetKg}kg × {nextSet.targetReps}
          </div>
        </div>
      )}
      <button onClick={onSkip} style={{
        marginTop: '8px', padding: '10px 28px', background: 'none',
        border: `1px solid ${BORDER}`, borderRadius: '8px',
        color: DIM, fontSize: '12px', fontFamily: DISPLAY, letterSpacing: '0.1em', cursor: 'pointer',
      }}>SKIP REST</button>
    </div>
  )
}

// ── Complete Screen ─────────────────────────────────────────────────────────
function CompleteScreen({ duration, setsLogged, topLift, onBack }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: BG, padding: '32px', gap: '16px' }}>
      <div style={{ fontSize: '52px', color: GREEN }}>✓</div>
      <div style={{ fontFamily: DISPLAY, fontSize: '28px', color: GREEN, letterSpacing: '0.1em' }}>SESSION COMPLETE</div>
      <div style={{ display: 'flex', gap: '24px', marginTop: '8px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: MONO, fontSize: '28px', color: TEXT }}>{fmt(duration)}</div>
          <div style={{ fontSize: '10px', color: DIM, fontFamily: DISPLAY, letterSpacing: '0.08em', marginTop: '4px' }}>DURATION</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: MONO, fontSize: '28px', color: TEXT }}>{setsLogged}</div>
          <div style={{ fontSize: '10px', color: DIM, fontFamily: DISPLAY, letterSpacing: '0.08em', marginTop: '4px' }}>SETS</div>
        </div>
      </div>
      {topLift && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: DIM, fontFamily: DISPLAY, letterSpacing: '0.08em', marginBottom: '4px' }}>TOP LIFT</div>
          <div style={{ fontSize: '16px', color: ORANGE, fontFamily: DISPLAY }}>{topLift}</div>
        </div>
      )}
      <button onClick={onBack} style={{
        marginTop: '16px', padding: '13px 32px', background: ORANGE,
        border: 'none', borderRadius: '8px', color: '#000',
        fontSize: '13px', fontWeight: 700, fontFamily: DISPLAY, letterSpacing: '0.1em', cursor: 'pointer',
      }}>BACK TO DASHBOARD</button>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function ActiveSession({ onBack }) {
  const [statusData, setStatusData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sets, setSets] = useState([])
  const [logged, setLogged] = useState({})       // key → { kg, reps }
  const [logModal, setLogModal] = useState(null) // set object or null
  const [rest, setRest] = useState(null)         // { seconds, nextSet } or null
  const [elapsed, setElapsed] = useState(0)
  const [phase, setPhase] = useState('active')   // 'active' | 'complete'
  const [summary, setSummary] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const restRef = useRef(null)
  const elapsedRef = useRef(null)

  // Elapsed timer
  useEffect(() => {
    elapsedRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(elapsedRef.current)
  }, [])

  // Rest countdown
  useEffect(() => {
    if (!rest) { clearInterval(restRef.current); return }
    restRef.current = setInterval(() => {
      setRest(r => {
        if (!r || r.seconds <= 1) { clearInterval(restRef.current); return null }
        return { ...r, seconds: r.seconds - 1 }
      })
    }, 1000)
    return () => clearInterval(restRef.current)
  }, [rest?.seconds === undefined ? null : !!rest])

  useEffect(() => {
    getTrainingStatus()
      .then(data => {
        setStatusData(data)
        const parsed = parseExercises(data.today_session?.exercises || [])
        setSets(buildFlatSets(parsed))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const allLogged = sets.length > 0 && sets.every(s => logged[s.key])

  function openLog(set) {
    setRest(null)
    setLogModal(set)
  }

  function handleLog({ kg, reps }) {
    if (!logModal) return
    const key = logModal.key
    setLogged(prev => ({ ...prev, [key]: { kg, reps } }))
    setLogModal(null)

    // Start rest timer
    const setIdx = sets.findIndex(s => s.key === key)
    const nextSet = sets[setIdx + 1] || null
    const duration = restDuration(statusData?.today_session?.session_type)
    setRest({ seconds: duration, nextSet })
  }

  async function finishSession() {
    if (submitting) return
    setSubmitting(true)
    const sessionType = statusData?.today_session?.session_type || 'general'
    const mappedType = SESSION_TYPE_MAP[sessionType] || 'Upper'

    // Build exercises payload grouped by exercise name
    const exerciseMap = {}
    for (const set of sets) {
      const entry = logged[set.key]
      if (!entry) continue
      if (!exerciseMap[set.exerciseName]) exerciseMap[set.exerciseName] = []
      exerciseMap[set.exerciseName].push({ reps: entry.reps, weight_kg: entry.kg })
    }
    const exercises = Object.entries(exerciseMap).map(([name, exSets]) => ({ name, sets: exSets }))

    // Top lift
    let topKg = 0, topName = ''
    for (const set of sets) {
      const entry = logged[set.key]
      if (entry && entry.kg > topKg) { topKg = entry.kg; topName = set.exerciseName }
    }

    try {
      await logSession({
        date: new Date().toISOString().slice(0, 10),
        session_type: mappedType,
        week_number: statusData?.dunk_goal?.current_mesocycle_week || null,
        exercises,
        notes: '',
      })
    } catch {}

    setPhase('complete')
    setSummary({
      duration: elapsed,
      setsLogged: Object.keys(logged).length,
      topLift: topKg > 0 ? `${topKg}kg ${topName}` : null,
    })
    setSubmitting(false)
  }

  if (phase === 'complete' && summary) {
    return <CompleteScreen {...summary} onBack={onBack} />
  }

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, color: DIM }}>
        Loading session…
      </div>
    )
  }

  const session = statusData?.today_session
  const displayName = session?.display_name || 'SESSION'

  // Group sets by exercise for rendering
  const exerciseGroups = []
  let currentGroup = null
  for (const set of sets) {
    if (!currentGroup || currentGroup.name !== set.exerciseName) {
      currentGroup = { name: set.exerciseName, sets: [] }
      exerciseGroups.push(currentGroup)
    }
    currentGroup.sets.push(set)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: BG, color: TEXT }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: DIM, fontSize: '20px', cursor: 'pointer', padding: 0, lineHeight: 1 }}>←</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: DISPLAY, fontSize: '13px', color: ORANGE, letterSpacing: '0.12em', fontWeight: 600 }}>
            {displayName}
          </div>
          <div style={{ fontFamily: MONO, fontSize: '11px', color: DIM, marginTop: '2px' }}>{fmt(elapsed)}</div>
        </div>
        <div style={{ width: '24px' }} />
      </div>

      {/* Exercise list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {exerciseGroups.map((group, gIdx) => (
          <div key={gIdx} style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontFamily: DISPLAY, letterSpacing: '0.1em', color: DIM, marginBottom: '8px' }}>
              {group.name}
            </div>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '8px', overflow: 'hidden' }}>
              {group.sets.map((set, sIdx) => {
                const isLogged = !!logged[set.key]
                const entry = logged[set.key]
                const isNext = !isLogged && sets.find(s => !logged[s.key])?.key === set.key
                return (
                  <div key={set.key} style={{
                    display: 'flex', alignItems: 'center', padding: '11px 14px',
                    borderBottom: sIdx < group.sets.length - 1 ? `1px solid ${BORDER}` : 'none',
                    borderLeft: isNext ? `3px solid ${ORANGE}` : isLogged ? `3px solid ${GREEN}` : `3px solid transparent`,
                  }}>
                    <div style={{ fontFamily: MONO, fontSize: '11px', color: DIM, width: '28px', flexShrink: 0 }}>
                      {set.setNum}
                    </div>
                    <div style={{ flex: 1 }}>
                      {isLogged ? (
                        <span style={{ fontFamily: MONO, fontSize: '13px', color: GREEN }}>
                          {entry.kg}kg × {entry.reps}
                        </span>
                      ) : (
                        <span style={{ fontFamily: MONO, fontSize: '13px', color: isNext ? TEXT : DIM }}>
                          {set.targetKg}kg × {set.targetReps}
                        </span>
                      )}
                    </div>
                    {isLogged ? (
                      <div style={{ fontSize: '14px', color: GREEN }}>✓</div>
                    ) : (
                      <button
                        onClick={() => openLog(set)}
                        disabled={!isNext}
                        style={{
                          padding: '6px 14px', background: isNext ? ORANGE : 'transparent',
                          border: `1px solid ${isNext ? ORANGE : BORDER}`, borderRadius: '6px',
                          color: isNext ? '#000' : DIM, fontSize: '11px', fontWeight: 700,
                          fontFamily: DISPLAY, letterSpacing: '0.08em',
                          cursor: isNext ? 'pointer' : 'default',
                        }}
                      >
                        LOG
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Finish button */}
        {allLogged && (
          <button
            onClick={finishSession}
            disabled={submitting}
            style={{
              width: '100%', padding: '14px', background: submitting ? '#1a2e1a' : GREEN,
              border: 'none', borderRadius: '8px', color: '#000',
              fontSize: '14px', fontWeight: 700, fontFamily: DISPLAY,
              letterSpacing: '0.1em', cursor: submitting ? 'default' : 'pointer',
              marginTop: '8px',
            }}
          >
            {submitting ? 'SAVING…' : '✓ FINISH SESSION'}
          </button>
        )}

        <div style={{ height: '32px' }} />
      </div>

      {/* Modals */}
      {logModal && (
        <LogModal
          set={logModal}
          onLog={handleLog}
          onCancel={() => setLogModal(null)}
        />
      )}
      {rest && (
        <RestTimer
          seconds={rest.seconds}
          nextSet={rest.nextSet}
          onSkip={() => setRest(null)}
        />
      )}
    </div>
  )
}
