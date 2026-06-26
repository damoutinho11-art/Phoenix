import { useState, useEffect, useRef } from 'react'
import { getTrainingStatus, logSession } from '../../api/client'

const SESSION_TYPE_MAP = {
  high_intensity: 'Legs',
  general: 'Upper',
  jump: 'Legs',
  iso_only: 'Lower',
  peak: 'Lower',
  attempt: 'Legs',
  deload: 'Lower',
}

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

function Stepper({ label, value, display, onInc, onDec }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '.1em', marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <button onClick={onDec} className="action ghost" style={{ width: 48, height: 48, fontSize: 24, color: 'var(--accent-training)' }}>−</button>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 44, color: 'var(--text)', minWidth: 90, textAlign: 'center', lineHeight: 1 }}>
          {display}
        </div>
        <button onClick={onInc} className="action ghost" style={{ width: 48, height: 48, fontSize: 24, color: 'var(--accent-training)' }}>+</button>
      </div>
    </div>
  )
}

function LogModal({ set, onLog, onCancel }) {
  const [kg, setKg] = useState(set.targetKg || 0)
  const [reps, setReps] = useState(set.targetReps || 10)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onCancel()}
    >
      <div className="glass" style={{ padding: '24px 20px 36px', width: '100%', maxWidth: 480, borderRadius: 0 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent-training)', letterSpacing: '.12em', marginBottom: 4 }}>LOG SET</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 14, color: 'var(--text)', marginBottom: 28 }}>
          {set.exerciseName} · Set {set.setNum}/{set.totalSets}
        </div>

        <div style={{ display: 'flex', gap: 32, justifyContent: 'center', marginBottom: 32 }}>
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

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} className="action ghost" style={{ flex: 1 }}>CANCEL</button>
          <button onClick={() => onLog({ kg, reps })} className="action lg" style={{ flex: 2, justifyContent: 'center', borderColor: 'var(--accent-training)', color: 'var(--accent-training)', background: 'rgba(255,143,46,.1)' }}>
            LOG SET
          </button>
        </div>
      </div>
    </div>
  )
}

function RestTimer({ seconds, nextSet, onSkip }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(1,6,8,.94)', zIndex: 90,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', color: 'var(--muted)' }}>REST</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 72, color: 'var(--accent-training)', lineHeight: 1, textShadow: '0 0 30px var(--accent-training)' }}>{fmt(seconds)}</div>
      {nextSet && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '.1em', marginBottom: 6 }}>NEXT</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, color: 'var(--text)' }}>
            {nextSet.exerciseName} · Set {nextSet.setNum} · {nextSet.targetKg}kg × {nextSet.targetReps}
          </div>
        </div>
      )}
      <button onClick={onSkip} className="action ghost" style={{ marginTop: 8, padding: '10px 28px' }}>SKIP REST</button>
    </div>
  )
}

function CompleteScreen({ duration, setsLogged, topLift, onBack }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'transparent', padding: 32, gap: 16 }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 52, color: 'var(--green)', filter: 'drop-shadow(0 0 20px var(--green))' }}>✓</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 28, color: 'var(--green)', letterSpacing: '.1em' }}>SESSION COMPLETE</div>
      <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
        <div className="metric" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '16px 24px' }}>
          <div className="value" style={{ fontSize: 28 }}>{fmt(duration)}</div>
          <div className="label" style={{ marginTop: 4 }}>DURATION</div>
        </div>
        <div className="metric" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '16px 24px' }}>
          <div className="value" style={{ fontSize: 28 }}>{setsLogged}</div>
          <div className="label" style={{ marginTop: 4 }}>SETS</div>
        </div>
      </div>
      {topLift && (
        <div style={{ textAlign: 'center' }}>
          <div className="label" style={{ marginBottom: 4 }}>TOP LIFT</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 16, color: 'var(--accent-training)' }}>{topLift}</div>
        </div>
      )}
      <button onClick={onBack} className="action lg" style={{ marginTop: 16, borderColor: 'var(--accent-training)', color: 'var(--accent-training)', background: 'rgba(255,143,46,.1)' }}>
        BACK TO DASHBOARD
      </button>
    </div>
  )
}

export default function ActiveSession({ onBack }) {
  const [statusData, setStatusData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sets, setSets] = useState([])
  const [logged, setLogged] = useState({})
  const [logModal, setLogModal] = useState(null)
  const [rest, setRest] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [phase, setPhase] = useState('active')
  const [summary, setSummary] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const restRef = useRef(null)
  const elapsedRef = useRef(null)

  useEffect(() => {
    elapsedRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(elapsedRef.current)
  }, [])

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

    const exerciseMap = {}
    for (const set of sets) {
      const entry = logged[set.key]
      if (!entry) continue
      if (!exerciseMap[set.exerciseName]) exerciseMap[set.exerciseName] = []
      exerciseMap[set.exerciseName].push({ reps: entry.reps, weight_kg: entry.kg })
    }
    const exercises = Object.entries(exerciseMap).map(([name, exSets]) => ({ name, sets: exSets }))

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
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
        Loading session…
      </div>
    )
  }

  const session = statusData?.today_session
  const displayName = session?.display_name || 'SESSION'

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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent', color: 'var(--text)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: '1px solid var(--line)', flexShrink: 0,
      }}>
        <button onClick={onBack} className="action ghost" style={{ padding: '6px 10px', fontSize: 14 }}>←</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 13, color: 'var(--accent-training)', letterSpacing: '.12em' }}>
            {displayName}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{fmt(elapsed)}</div>
        </div>
        <div style={{ width: 24 }} />
      </div>

      {/* Exercise list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {exerciseGroups.map((group, gIdx) => (
          <div key={gIdx} style={{ marginBottom: 16 }}>
            <div className="panel-title" style={{ fontSize: 11 }}>{group.name}</div>
            <div className="glass">
              {group.sets.map((set, sIdx) => {
                const isLogged = !!logged[set.key]
                const entry = logged[set.key]
                const isNext = !isLogged && sets.find(s => !logged[s.key])?.key === set.key
                return (
                  <div key={set.key} style={{
                    display: 'flex', alignItems: 'center', padding: '11px 14px',
                    borderBottom: sIdx < group.sets.length - 1 ? '1px solid var(--line)' : 'none',
                    borderLeft: isNext ? '3px solid var(--accent-training)' : isLogged ? '3px solid var(--green)' : '3px solid transparent',
                  }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', width: 28, flexShrink: 0 }}>
                      {set.setNum}
                    </div>
                    <div style={{ flex: 1 }}>
                      {isLogged ? (
                        <span className="badge safe" style={{ fontSize: 11 }}>
                          {entry.kg}kg × {entry.reps}
                        </span>
                      ) : (
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: isNext ? 'var(--text)' : 'var(--dim)' }}>
                          {set.targetKg}kg × {set.targetReps}
                        </span>
                      )}
                    </div>
                    {isLogged ? (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--green)' }}>✓</div>
                    ) : (
                      <button
                        onClick={() => openLog(set)}
                        disabled={!isNext}
                        className={`action${isNext ? '' : ' ghost'}`}
                        style={isNext ? { borderColor: 'var(--accent-training)', color: 'var(--accent-training)', background: 'rgba(255,143,46,.1)' } : {}}
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

        {allLogged && (
          <button
            onClick={finishSession}
            disabled={submitting}
            className={`action safe lg${submitting ? ' ghost' : ''}`}
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          >
            {submitting ? 'SAVING…' : '✓ FINISH SESSION'}
          </button>
        )}

        <div style={{ height: 32 }} />
      </div>

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
