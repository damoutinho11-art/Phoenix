import { useState, useEffect, useRef } from 'react'
import { getTrainingStatus, logSession } from '../../api/client'

// ─── Session Data (prototype spec) ───────────────────────────────────────────

const PROTO_SESSION = {
  name: 'ME LOWER',
  exercises: [
    {
      name: 'Hex Bar Deadlift Jump',
      focus: 'Work to 3RM — explosive intent, reset between reps',
      pct: null,
      restSec: 240,
      bodyweight: false,
      sets: [
        { type: 'warmup', targetWeight: 60,  targetReps: 5  },
        { type: 'warmup', targetWeight: 90,  targetReps: 3  },
        { type: 'work',   targetWeight: 110, targetReps: 3  },
        { type: 'work',   targetWeight: 125, targetReps: 3  },
        { type: 'work',   targetWeight: 135, targetReps: 3  },
      ],
    },
    {
      name: 'Romanian Deadlift',
      focus: '65% of training max — 3 sec eccentric, controlled',
      pct: '65% TM',
      restSec: 120,
      bodyweight: false,
      sets: [
        { type: 'work', targetWeight: 85, targetReps: 6 },
        { type: 'work', targetWeight: 85, targetReps: 6 },
        { type: 'work', targetWeight: 85, targetReps: 6 },
        { type: 'work', targetWeight: 85, targetReps: 6 },
      ],
    },
    {
      name: 'Glute Ham Raise',
      focus: 'Bodyweight — full ROM, 2 sec pause at bottom',
      pct: 'BW',
      restSec: 90,
      bodyweight: true,
      sets: [
        { type: 'work', targetWeight: null, targetReps: 8 },
        { type: 'work', targetWeight: null, targetReps: 8 },
        { type: 'work', targetWeight: null, targetReps: 8 },
      ],
    },
    {
      name: 'Single-Leg Calf Raise',
      focus: '15 reps each leg — slow, full ROM',
      pct: 'BW',
      restSec: 60,
      bodyweight: true,
      sets: [
        { type: 'work', targetWeight: null, targetReps: 15 },
        { type: 'work', targetWeight: null, targetReps: 15 },
        { type: 'work', targetWeight: null, targetReps: 15 },
      ],
    },
  ],
}

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

// ─── Log Modal ────────────────────────────────────────────────────────────────

function LogModal({ ex, setIdx, logged, onLog, onClose }) {
  const set = ex.sets[setIdx]
  const prevLogged = ex.sets.slice(0, setIdx).reverse().find(s => s.logged)

  const initW = logged
    ? logged.w
    : ex.bodyweight
      ? null
      : prevLogged ? prevLogged.logged.w : set.targetWeight
  const initR = logged ? logged.r : set.targetReps

  const [inputW, setInputW] = useState(initW)
  const [inputR, setInputR] = useState(initR)

  const prevNote = prevLogged
    ? ex.bodyweight ? `PREV: ${prevLogged.logged.r} reps` : `PREV SET: ${prevLogged.logged.w}kg × ${prevLogged.logged.r}`
    : ex.bodyweight ? `TARGET: ${set.targetReps} reps` : `TARGET: ${set.targetWeight}kg × ${set.targetReps}`

  const ORANGE = '#ff8f2e'
  const CYAN = '#20d8ec'
  const BORDER = 'rgba(32,216,236,.18)'
  const MUTED = 'rgba(32,216,236,.38)'

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 30, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: '100%', maxWidth: 430, background: '#000', borderTop: `1px solid ${BORDER}`, padding: '20px 20px 36px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 16 }}>
          <span>{ex.name.toUpperCase()} · SET {setIdx + 1}</span>
          <span style={{ cursor: 'pointer', fontSize: 16 }} onClick={onClose}>✕</span>
        </div>

        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', color: 'rgba(125,188,200,.55)', textAlign: 'center', marginBottom: 16, padding: '6px', border: `1px solid rgba(32,216,236,.1)` }}>
          {prevNote}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: ex.bodyweight ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 16 }}>
          {!ex.bodyweight && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.2em', color: MUTED }}>WEIGHT (KG)</div>
              <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${BORDER}`, background: 'rgba(32,216,236,.04)' }}>
                <button onClick={() => setInputW(v => Math.max(0, Math.round((v - 2.5) * 2) / 2))}
                  style={{ width: 50, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--display)', fontSize: 20, color: CYAN, background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>−</button>
                <div style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: '.02em' }}>{inputW}</div>
                <button onClick={() => setInputW(v => Math.round((v + 2.5) * 2) / 2)}
                  style={{ width: 50, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--display)', fontSize: 20, color: CYAN, background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>+</button>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: MUTED, letterSpacing: '.1em', textAlign: 'center' }}>KG</div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.2em', color: MUTED }}>REPS</div>
            <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${BORDER}`, background: 'rgba(32,216,236,.04)' }}>
              <button onClick={() => setInputR(v => Math.max(1, v - 1))}
                style={{ width: 50, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--display)', fontSize: 20, color: CYAN, background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>−</button>
              <div style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: '.02em' }}>{inputR}</div>
              <button onClick={() => setInputR(v => v + 1)}
                style={{ width: 50, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--display)', fontSize: 20, color: CYAN, background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>+</button>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: MUTED, letterSpacing: '.1em', textAlign: 'center' }}>REPS</div>
          </div>
        </div>

        <button
          onClick={() => onLog({ w: inputW, r: inputR })}
          style={{ width: '100%', padding: '18px 0', textAlign: 'center', fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, letterSpacing: '.24em', color: '#000', background: CYAN, border: 'none', cursor: 'pointer', boxShadow: `0 0 20px rgba(32,216,236,.45)` }}
        >
          LOG SET
        </button>
      </div>
    </div>
  )
}

// ─── Rest Timer Overlay ───────────────────────────────────────────────────────

function RestOverlay({ seconds, total, nextNote, onSkip }) {
  const arcRef = useRef(null)

  useEffect(() => {
    if (!arcRef.current) return
    const pct = seconds / total
    const offset = (1 - pct) * 439.8
    arcRef.current.style.transition = 'stroke-dashoffset .95s linear'
    arcRef.current.setAttribute('stroke-dashoffset', offset)
    // colour shift
    const color = pct < 0.25 ? '#ff5c7a' : pct < 0.5 ? '#ffd56b' : '#20d8ec'
    arcRef.current.setAttribute('stroke', color)
  }, [seconds, total])

  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  const timeStr = `${m}:${String(s).padStart(2, '0')}`

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 40,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.3em', color: 'rgba(32,216,236,.38)', marginBottom: 16 }}>REST PERIOD</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 88, fontWeight: 700, lineHeight: 1, letterSpacing: '-.02em', color: '#7df0ff', filter: 'drop-shadow(0 0 26px rgba(32,216,236,.45))' }}>
        {timeStr}
      </div>
      <svg width="160" height="160" viewBox="0 0 160 160" style={{ margin: '20px 0' }}>
        <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(32,216,236,.1)" strokeWidth="6" />
        <circle ref={arcRef} cx="80" cy="80" r="70" fill="none" stroke="#20d8ec"
          strokeWidth="6" strokeLinecap="round"
          strokeDasharray="439.8" strokeDashoffset="0"
          transform="rotate(-90 80 80)" />
      </svg>
      {nextNote && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.16em', color: 'rgba(125,188,200,.55)', marginBottom: 32, textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>
          {nextNote}
        </div>
      )}
      <button
        onClick={onSkip}
        style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.24em', padding: '14px 36px', border: '1px solid rgba(32,216,236,.18)', color: 'rgba(32,216,236,.38)', background: 'transparent', cursor: 'pointer' }}
      >
        SKIP REST →
      </button>
    </div>
  )
}

// ─── Complete View ────────────────────────────────────────────────────────────

function CompleteView({ sessionName, elapsed, exercises, onBack }) {
  const totalSets = exercises.reduce((a, ex) => a + ex.sets.filter(s => s.logged).length, 0)
  const mins = Math.floor(elapsed / 60)

  // find top hex bar lift
  const hex = exercises[0]
  const maxLogged = hex.sets.filter(s => s.logged && s.logged.w).sort((a, b) => b.logged.w - a.logged.w)
  const topLift = maxLogged.length ? `${maxLogged[0].logged.w}kg` : '—'

  const BORDER = 'rgba(32,216,236,.18)'
  const MUTED = 'rgba(32,216,236,.38)'
  const POS = '#4dffb4'

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#000', color: 'rgba(199,236,244,.92)' }}>
      <div style={{ padding: '40px 24px 28px', borderBottom: `1px solid ${BORDER}`, textAlign: 'center', background: 'linear-gradient(180deg,rgba(32,216,236,.035),transparent)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔥</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700, letterSpacing: '.12em', color: POS, filter: 'drop-shadow(0 0 16px rgba(77,255,180,.5))', marginBottom: 6 }}>
          SESSION DONE
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.18em', color: MUTED }}>
          {sessionName} · {mins} MIN · {totalSets} SETS LOGGED
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: `1px solid ${BORDER}` }}>
        {[
          { label: 'DURATION', val: `${mins}m` },
          { label: 'SETS DONE', val: totalSets },
          { label: 'TOP LIFT', val: topLift },
        ].map(({ label, val }, i) => (
          <div key={i} style={{ padding: '16px 12px', borderRight: i < 2 ? `1px solid ${BORDER}` : 'none', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED, marginBottom: 5 }}>{label}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, color: POS }}>{val}</div>
          </div>
        ))}
      </div>

      <div>
        {exercises.map((ex, i) => {
          const done = ex.sets.filter(s => s.logged).length
          const total = ex.sets.length
          const maxS = ex.sets.filter(s => s.logged && s.logged.w).sort((a, b) => b.logged.w - a.logged.w)
          const detail = !ex.bodyweight && maxS.length
            ? `${maxS[0].logged.w}kg max · ${done}/${total} sets`
            : `${done}/${total} sets`
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: 'rgba(32,216,236,.07) solid 1px' }}>
              <span style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 14, fontWeight: 400, color: 'rgba(199,236,244,.82)' }}>{ex.name}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: POS, letterSpacing: '.08em' }}>{detail}</span>
            </div>
          )
        })}
      </div>

      <div
        onClick={onBack}
        style={{ margin: '20px 18px 0', padding: '16px 0', textAlign: 'center', fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, letterSpacing: '.22em', color: '#000', background: POS, cursor: 'pointer', boxShadow: '0 0 20px rgba(77,255,180,.35)' }}
      >
        ← BACK TO DASHBOARD
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ActiveSession({ onBack }) {
  const [exercises, setExercises] = useState(() =>
    PROTO_SESSION.exercises.map(ex => ({
      ...ex,
      sets: ex.sets.map(s => ({ ...s, logged: null })),
    }))
  )
  const [curEx, setCurEx] = useState(0)
  const [logModal, setLogModal] = useState(null) // { exIdx, setIdx }
  const [rest, setRest] = useState(null)         // { seconds, total, nextNote }
  const [elapsed, setElapsed] = useState(0)
  const [phase, setPhase] = useState('active')   // 'active' | 'complete'
  const [submitting, setSubmitting] = useState(false)

  // API load — merge into exercises if available
  useEffect(() => {
    getTrainingStatus().catch(() => {})
  }, [])

  // Elapsed timer
  useEffect(() => {
    const id = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Rest countdown
  useEffect(() => {
    if (!rest) return
    if (rest.seconds <= 0) { setRest(null); return }
    const id = setInterval(() => {
      setRest(r => {
        if (!r || r.seconds <= 1) { clearInterval(id); return null }
        return { ...r, seconds: r.seconds - 1 }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [rest?.seconds === undefined ? null : !!rest]) // eslint-disable-line react-hooks/exhaustive-deps

  function openModal(exIdx, setIdx) {
    setRest(null)
    setLogModal({ exIdx, setIdx })
  }

  function handleLog({ w, r }) {
    const { exIdx, setIdx } = logModal
    setExercises(prev => prev.map((ex, ei) =>
      ei !== exIdx ? ex : {
        ...ex,
        sets: ex.sets.map((s, si) => si !== setIdx ? s : { ...s, logged: { w, r } }),
      }
    ))
    setLogModal(null)

    const ex = exercises[exIdx]
    const set = ex.sets[setIdx]
    // Start rest unless last set logged
    const nextSetIdx = setIdx + 1
    const nextSet = ex.sets[nextSetIdx]
    const sec = set.type === 'warmup' ? 60 : ex.restSec

    let nextNote = ''
    if (nextSet) {
      nextNote = ex.bodyweight
        ? `Next: Set ${nextSetIdx + 1} · ${nextSet.targetReps} reps`
        : `Next: Set ${nextSetIdx + 1} · ${nextSet.targetWeight}kg × ${nextSet.targetReps}`
    } else {
      nextNote = 'Last set done — move to next exercise'
    }
    setRest({ seconds: sec, total: sec, nextNote })
  }

  async function finishSession() {
    if (submitting) return
    setSubmitting(true)

    // Build API payload
    const exercisePayload = exercises.map(ex => ({
      name: ex.name,
      sets: ex.sets.filter(s => s.logged).map(s => ({ reps: s.logged.r, weight_kg: s.logged.w || 0 })),
    }))

    try {
      await logSession({
        date: new Date().toISOString().slice(0, 10),
        session_type: 'Legs',
        week_number: 3,
        exercises: exercisePayload,
        notes: '',
      })
    } catch {}

    setSubmitting(false)
    setPhase('complete')
  }

  if (phase === 'complete') {
    return (
      <CompleteView
        sessionName={PROTO_SESSION.name}
        elapsed={elapsed}
        exercises={exercises}
        onBack={onBack}
      />
    )
  }

  const ex = exercises[curEx]
  const allExDone = ex.sets.every(s => s.logged)
  const isLastEx = curEx === exercises.length - 1
  const allSessionDone = isLastEx && allExDone

  const mins = Math.floor(ex.restSec / 60), secs = ex.restSec % 60
  const restLabel = `REST ${mins}:${String(secs).padStart(2, '0')}`

  const BORDER = 'rgba(32,216,236,.18)'
  const MUTED = 'rgba(32,216,236,.38)'
  const CYAN = '#20d8ec'
  const CYAN_BR = '#7df0ff'
  const ORANGE = '#ff8f2e'
  const POS = '#4dffb4'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: 'rgba(199,236,244,.92)', fontFamily: "'Saira Condensed',sans-serif" }}>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.97)', backdropFilter: 'blur(12px)', zIndex: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: CYAN, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: CYAN_BR }}>
            {PROTO_SESSION.name}
          </span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 14, letterSpacing: '.1em', color: CYAN }}>{fmt(elapsed)}</span>
      </div>

      {/* EXERCISE HEADER */}
      <div style={{ padding: '16px 18px 14px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(32,216,236,.035),transparent)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.2em', color: MUTED }}>
            EXERCISE {curEx + 1} OF {exercises.length}
          </span>
          <div style={{ display: 'flex', gap: 5 }}>
            {exercises.map((e, i) => {
              const allDone = e.sets.every(s => s.logged)
              const isCur = i === curEx
              return (
                <div key={i} style={{ width: 20, height: 3, borderRadius: 1, background: allDone ? POS : isCur ? CYAN : 'rgba(32,216,236,.18)', transition: 'background .3s' }} />
              )
            })}
          </div>
        </div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700, letterSpacing: '.05em', color: '#fff', lineHeight: 1.1, marginBottom: 5 }}>{ex.name}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', color: 'rgba(125,188,200,.55)', lineHeight: 1.5 }}>{ex.focus}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          {ex.pct && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', padding: '3px 8px', border: `1px solid rgba(255,143,46,.35)`, color: ORANGE, background: 'rgba(255,143,46,.07)' }}>{ex.pct}</span>
          )}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', padding: '3px 8px', border: `1px solid ${BORDER}`, color: MUTED }}>{restLabel}</span>
        </div>
      </div>

      {/* SET LIST */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ex.sets.map((set, i) => {
          const logged = set.logged
          const prevSetsDone = ex.sets.slice(0, i).every(s => s.logged)
          const state = logged ? 'completed' : prevSetsDone ? 'active-set' : 'upcoming'
          const isWarmup = set.type === 'warmup'

          const rowBorder = state === 'completed'
            ? 'rgba(77,255,180,.2)'
            : state === 'active-set'
              ? CYAN
              : isWarmup ? 'rgba(255,213,107,.15)' : 'rgba(32,216,236,.1)'

          const rowBg = state === 'completed'
            ? 'rgba(77,255,180,.04)'
            : state === 'active-set'
              ? 'rgba(32,216,236,.06)'
              : isWarmup ? 'rgba(255,213,107,.02)' : 'transparent'

          const indBg = state === 'completed'
            ? 'rgba(77,255,180,.15)'
            : state === 'active-set'
              ? 'rgba(32,216,236,.15)'
              : isWarmup ? 'rgba(255,213,107,.1)' : 'transparent'
          const indBorder = state === 'completed'
            ? 'rgba(77,255,180,.3)'
            : state === 'active-set'
              ? CYAN
              : isWarmup ? 'rgba(255,213,107,.2)' : 'rgba(32,216,236,.18)'
          const indColor = state === 'completed'
            ? POS
            : state === 'active-set'
              ? CYAN_BR
              : isWarmup ? '#ffd56b' : MUTED
          const indContent = state === 'completed' ? '✓' : state === 'active-set' ? '●' : (i + 1)
          const indDisplay = isWarmup ? 'W' : indContent

          const prescribed = ex.bodyweight
            ? `${set.targetReps} reps`
            : `${set.targetWeight}kg × ${set.targetReps}`

          return (
            <div
              key={i}
              onClick={() => state !== 'upcoming' && openModal(curEx, i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 14px',
                border: `1px solid ${rowBorder}`,
                background: rowBg,
                cursor: state !== 'upcoming' ? 'pointer' : 'default',
                boxShadow: state === 'active-set' ? '0 0 12px rgba(32,216,236,.15)' : 'none',
                opacity: state === 'upcoming' && !isWarmup ? .55 : 1,
              }}
            >
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'var(--mono)', fontSize: isWarmup ? 8 : 10, fontWeight: 700, background: indBg, color: indColor, border: `1px solid ${indBorder}`, boxShadow: state === 'active-set' ? '0 0 8px rgba(32,216,236,.3)' : 'none' }}>
                {indDisplay}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED, marginBottom: 2 }}>
                  {isWarmup ? 'WARM-UP' : 'WORK SET'} {i + 1}
                </div>
                {logged ? (
                  <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, letterSpacing: '.04em', color: POS, lineHeight: 1 }}>
                    {ex.bodyweight ? `${logged.r} reps` : `${logged.w}kg × ${logged.r}`}
                  </div>
                ) : (
                  <div style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 15, fontWeight: 400, color: 'rgba(199,236,244,.75)' }}>
                    {prescribed}
                  </div>
                )}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: logged ? 'rgba(77,255,180,.5)' : CYAN }}>
                {logged ? 'EDIT' : 'LOG →'}
              </div>
            </div>
          )
        })}
      </div>

      {/* NAV FOOTER */}
      <div style={{ padding: '14px 18px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 10, position: 'sticky', bottom: 0, background: 'rgba(0,0,0,.97)', backdropFilter: 'blur(12px)', flexShrink: 0 }}>
        <div
          onClick={() => curEx > 0 && setCurEx(c => c - 1)}
          style={{ flex: 1, padding: '14px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', color: MUTED, border: `1px solid ${BORDER}`, cursor: curEx > 0 ? 'pointer' : 'default', opacity: curEx === 0 ? .35 : 1 }}
        >
          ← PREV
        </div>
        {allSessionDone ? (
          <div
            onClick={!submitting ? finishSession : undefined}
            style={{ flex: 2, padding: '14px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', color: '#000', fontWeight: 700, background: POS, border: `1px solid ${POS}`, cursor: 'pointer', boxShadow: '0 0 16px rgba(77,255,180,.35)' }}
          >
            {submitting ? 'SAVING…' : 'FINISH SESSION ✓'}
          </div>
        ) : isLastEx ? (
          <div
            onClick={finishSession}
            style={{ flex: 2, padding: '14px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', color: '#000', fontWeight: 700, background: POS, border: `1px solid ${POS}`, cursor: 'pointer' }}
          >
            FINISH SESSION ✓
          </div>
        ) : (
          <div
            onClick={() => setCurEx(c => Math.min(exercises.length - 1, c + 1))}
            style={{ flex: 2, padding: '14px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', color: '#000', fontWeight: 700, background: CYAN, border: `1px solid ${CYAN}`, cursor: 'pointer', boxShadow: '0 0 16px rgba(32,216,236,.34)' }}
          >
            NEXT EXERCISE →
          </div>
        )}
      </div>

      {/* LOG MODAL */}
      {logModal && (
        <LogModal
          ex={exercises[logModal.exIdx]}
          setIdx={logModal.setIdx}
          logged={exercises[logModal.exIdx].sets[logModal.setIdx].logged}
          onLog={handleLog}
          onClose={() => setLogModal(null)}
        />
      )}

      {/* REST TIMER */}
      {rest && (
        <RestOverlay
          seconds={rest.seconds}
          total={rest.total}
          nextNote={rest.nextNote}
          onSkip={() => setRest(null)}
        />
      )}
    </div>
  )
}
