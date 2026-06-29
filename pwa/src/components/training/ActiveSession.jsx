import { useState, useEffect, useRef } from 'react'
import { getTrainingStatus, logSession } from '../../api/client'

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:          '#010608',
  surface:     'rgba(255,143,46,.032)',
  surfaceCyan: 'rgba(32,216,236,.035)',
  orange:      '#ff8f2e',
  orangeDim:   'rgba(255,143,46,.18)',
  orangeMuted: 'rgba(255,143,46,.42)',
  orangeBorder:'rgba(255,143,46,.16)',
  cyan:        '#20d8ec',
  cyanBr:      '#7df0ff',
  cyanDim:     'rgba(32,216,236,.18)',
  cyanMuted:   'rgba(32,216,236,.4)',
  green:       '#4dffb4',
  yellow:      '#ffd56b',
  red:         '#ff5c7a',
  text:        'rgba(199,236,244,.92)',
  textDim:     'rgba(132,212,226,.58)',
  border:      '1px solid rgba(255,143,46,.14)',
  borderCyan:  '1px solid rgba(32,216,236,.18)',
  mono:        'var(--mono)',
  display:     'var(--display)',
  body:        'var(--body)',
}

// ─── Session builders ────────────────────────────────────────────────────────

const SESSION_NAMES = {
  high_intensity: 'HIGH INTENSITY',
  general: 'GENERAL UPPER',
  jump: 'JUMP SESSION',
  iso_only: 'ISO ONLY',
  peak: 'PEAK SESSION',
  attempt: 'DUNK ATTEMPT',
}

const SESSION_TYPE_LOG = {
  high_intensity: 'Lower',
  general: 'Upper',
  jump: 'Lower',
  iso_only: 'Lower',
  peak: 'Lower',
  attempt: 'Lower',
}

function fmtName(s) {
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function buildWorkSets(kg, nSets, reps) {
  const w1 = Math.round((kg * 0.5) / 2.5) * 2.5
  const w2 = Math.round((kg * 0.75) / 2.5) * 2.5
  return [
    { type: 'warmup', targetWeight: w1,  targetReps: reps + 2 },
    { type: 'warmup', targetWeight: w2,  targetReps: reps },
    ...Array.from({ length: nSets }, () => ({ type: 'work', targetWeight: kg, targetReps: reps })),
  ]
}

function isoSets(n = 3) {
  return Array.from({ length: n }, () => ({ type: 'work', targetWeight: null, targetReps: 1 }))
}

function buildExercises(todaySession) {
  const stype = todaySession.session_type
  const ww = todaySession.working_weights

  if (stype === 'high_intensity' && ww) {
    return [
      {
        name: fmtName(ww.explosive_exercise),
        focus: `${ww.sets}×${ww.reps} @ ${ww.intensity_pct}% — explosive intent, reset between reps`,
        pct: `${ww.explosive_kg}kg`,
        restSec: 240,
        bodyweight: false,
        sets: buildWorkSets(ww.explosive_kg, ww.sets, ww.reps),
      },
      {
        name: fmtName(ww.knee_extension_exercise),
        focus: `${ww.sets}×${ww.reps} @ ${ww.intensity_pct}% — controlled descent`,
        pct: `${ww.knee_extension_kg}kg`,
        restSec: 180,
        bodyweight: false,
        sets: buildWorkSets(ww.knee_extension_kg, ww.sets, ww.reps),
      },
      {
        name: fmtName(ww.posterior_chain_exercise),
        focus: `${ww.sets}×${ww.reps} @ ${ww.intensity_pct}% — full ROM, 2s pause at top`,
        pct: `${ww.posterior_chain_kg}kg`,
        restSec: 150,
        bodyweight: false,
        sets: buildWorkSets(ww.posterior_chain_kg, ww.sets, ww.reps),
      },
      {
        name: fmtName(ww.lower_leg_exercise),
        focus: `${ww.sets}×${ww.reps} — slow, full ROM`,
        pct: `${ww.lower_leg_kg}kg`,
        restSec: 90,
        bodyweight: false,
        sets: buildWorkSets(ww.lower_leg_kg, ww.sets, ww.reps),
      },
    ]
  }

  if (stype === 'general') {
    const isMonth2 = todaySession.phase === 'month_2'
    const pullName = isMonth2 ? 'Weighted Pull Up' : 'Lat Pulldown'

    return [
      {
        name: 'Shoulder Rehab',
        focus: 'Pre-hab — bands or light plate, full ROM. Non-negotiable.',
        pct: null, restSec: 60, bodyweight: true,
        sets: [
          { type: 'work', targetWeight: null, targetReps: 10 },
          { type: 'work', targetWeight: null, targetReps: 10 },
          { type: 'work', targetWeight: null, targetReps: 10 },
        ],
      },
      {
        name: 'Bench Press',
        focus: 'Hypertrophy — 3×10 @ RPE 7, 2s down, pause at chest',
        pct: null, restSec: 120, bodyweight: false,
        sets: [
          { type: 'warmup', targetWeight: 40, targetReps: 10 },
          { type: 'work', targetWeight: 60, targetReps: 10 },
          { type: 'work', targetWeight: 60, targetReps: 10 },
          { type: 'work', targetWeight: 60, targetReps: 10 },
        ],
      },
      {
        name: 'Barbell Row',
        focus: 'Hypertrophy — 3×10 @ RPE 7, chest to bar, squeeze at top',
        pct: null, restSec: 120, bodyweight: false,
        sets: [
          { type: 'warmup', targetWeight: 40, targetReps: 10 },
          { type: 'work', targetWeight: 60, targetReps: 10 },
          { type: 'work', targetWeight: 60, targetReps: 10 },
          { type: 'work', targetWeight: 60, targetReps: 10 },
        ],
      },
      {
        name: pullName,
        focus: 'Hypertrophy — 3×10 @ RPE 7, full stretch at bottom',
        pct: null, restSec: 120, bodyweight: false,
        sets: [
          { type: 'work', targetWeight: 50, targetReps: 10 },
          { type: 'work', targetWeight: 50, targetReps: 10 },
          { type: 'work', targetWeight: 50, targetReps: 10 },
        ],
      },
      {
        name: 'Bicep Curl',
        focus: 'Hypertrophy — 3×12, slow curl, no swinging',
        pct: null, restSec: 60, bodyweight: false,
        sets: [
          { type: 'work', targetWeight: 12, targetReps: 12 },
          { type: 'work', targetWeight: 12, targetReps: 12 },
          { type: 'work', targetWeight: 12, targetReps: 12 },
        ],
      },
      {
        name: 'Tricep Pushdown',
        focus: 'Hypertrophy — 3×12, full extension, elbows fixed',
        pct: null, restSec: 60, bodyweight: false,
        sets: [
          { type: 'work', targetWeight: 20, targetReps: 12 },
          { type: 'work', targetWeight: 20, targetReps: 12 },
          { type: 'work', targetWeight: 20, targetReps: 12 },
        ],
      },
      {
        name: 'Lateral Raise',
        focus: 'Hypertrophy — 3×15 light, elbows soft, top of range',
        pct: null, restSec: 60, bodyweight: false,
        sets: [
          { type: 'work', targetWeight: 8, targetReps: 15 },
          { type: 'work', targetWeight: 8, targetReps: 15 },
          { type: 'work', targetWeight: 8, targetReps: 15 },
        ],
      },
      {
        name: 'Face Pull',
        focus: 'Shoulder health — 3×15, cable or band, elbows at 90°',
        pct: null, restSec: 60, bodyweight: false,
        sets: [
          { type: 'work', targetWeight: 10, targetReps: 15 },
          { type: 'work', targetWeight: 10, targetReps: 15 },
          { type: 'work', targetWeight: 10, targetReps: 15 },
        ],
      },
    ]
  }

  if (stype === 'jump') {
    return [
      {
        name: 'Knee Extension ISO',
        focus: 'Activation — 3×30s @ 70%, max effort isometric',
        pct: null, restSec: 60, bodyweight: true,
        sets: isoSets(3),
      },
      {
        name: 'Dynamic Flexibility',
        focus: 'Warmup — hip circles, leg swings, lunge rotations',
        pct: null, restSec: 60, bodyweight: true,
        sets: isoSets(1),
      },
      {
        name: 'Sprint Development',
        focus: 'CNS Primer — 3×20m @ 85%, full recovery between',
        pct: null, restSec: 120, bodyweight: true,
        sets: isoSets(3),
      },
      {
        name: 'Jump Ramp 10→100%',
        focus: 'Build to max — 5 jumps progressively harder',
        pct: null, restSec: 90, bodyweight: true,
        sets: isoSets(5),
      },
      {
        name: 'Max Approach Jumps',
        focus: 'Max effort — record height each attempt',
        pct: 'MAX', restSec: 180, bodyweight: true,
        sets: isoSets(5),
      },
    ]
  }

  if (stype === 'iso_only') {
    return [
      {
        name: 'Knee Extension ISO',
        focus: '3–5 × 30–45s @ 70% — max effort, no movement',
        pct: null, restSec: 90, bodyweight: true,
        sets: isoSets(3),
      },
      {
        name: 'Hip Flexor ISO',
        focus: '3–5 × 30–45s @ 70% — standing or supine',
        pct: null, restSec: 90, bodyweight: true,
        sets: isoSets(3),
      },
      {
        name: 'Calf ISO',
        focus: '3–5 × 30–45s @ 70% — single leg, top of range',
        pct: null, restSec: 90, bodyweight: true,
        sets: isoSets(3),
      },
    ]
  }

  if (stype === 'peak' || stype === 'attempt') {
    return [
      {
        name: 'Knee Extension ISO',
        focus: '3×30s @ 70% — activation only, stay fresh',
        pct: null, restSec: 90, bodyweight: true,
        sets: isoSets(3),
      },
      {
        name: 'Max Approach Jumps',
        focus: 'Max effort attempts — full recovery between',
        pct: 'MAX', restSec: 240, bodyweight: true,
        sets: isoSets(5),
      },
    ]
  }

  return []
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
    ? ex.bodyweight ? `PREV: ${prevLogged.logged.r}` : `PREV SET: ${prevLogged.logged.w}kg × ${prevLogged.logged.r}`
    : ex.bodyweight ? `TARGET: ${set.targetReps} reps` : `TARGET: ${set.targetWeight}kg × ${set.targetReps}`

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(1,6,8,.9)', zIndex: 30, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: '100%', maxWidth: 430, background: T.bg, borderTop: T.borderCyan, padding: '20px 20px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.22em', color: T.cyanMuted }}>
            {ex.name.toUpperCase()} · SET {setIdx + 1}
          </div>
          <span style={{ cursor: 'pointer', fontSize: 16, color: T.cyanMuted }} onClick={onClose}>✕</span>
        </div>

        <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.1em', color: T.textDim, textAlign: 'center', marginBottom: 18, padding: '8px', border: T.borderCyan, background: T.surfaceCyan }}>
          {prevNote}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: ex.bodyweight ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 18 }}>
          {!ex.bodyweight && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.2em', color: T.cyanMuted }}>WEIGHT (KG)</div>
              <div style={{ display: 'flex', alignItems: 'center', border: T.borderCyan, background: T.surfaceCyan }}>
                <button onClick={() => setInputW(v => Math.max(0, Math.round((v - 2.5) * 2) / 2))}
                  style={{ width: 52, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.display, fontSize: 22, color: T.orange, background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>−</button>
                <div style={{ flex: 1, textAlign: 'center', fontFamily: T.display, fontSize: 32, fontWeight: 700, color: T.text }}>{inputW}</div>
                <button onClick={() => setInputW(v => Math.round((v + 2.5) * 2) / 2)}
                  style={{ width: 52, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.display, fontSize: 22, color: T.orange, background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>+</button>
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 7, color: T.cyanMuted, letterSpacing: '.1em', textAlign: 'center' }}>KG</div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.2em', color: T.cyanMuted }}>{ex.bodyweight ? 'SETS DONE' : 'REPS'}</div>
            <div style={{ display: 'flex', alignItems: 'center', border: T.borderCyan, background: T.surfaceCyan }}>
              <button onClick={() => setInputR(v => Math.max(1, v - 1))}
                style={{ width: 52, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.display, fontSize: 22, color: T.orange, background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>−</button>
              <div style={{ flex: 1, textAlign: 'center', fontFamily: T.display, fontSize: 32, fontWeight: 700, color: T.text }}>{inputR}</div>
              <button onClick={() => setInputR(v => v + 1)}
                style={{ width: 52, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.display, fontSize: 22, color: T.orange, background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>+</button>
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 7, color: T.cyanMuted, letterSpacing: '.1em', textAlign: 'center' }}>
              {ex.bodyweight ? 'COUNT' : 'REPS'}
            </div>
          </div>
        </div>

        <button
          onClick={() => onLog({ w: inputW, r: inputR })}
          style={{ width: '100%', padding: '18px 0', textAlign: 'center', fontFamily: T.display, fontSize: 18, fontWeight: 700, letterSpacing: '.24em', color: T.bg, background: T.cyan, border: 'none', cursor: 'pointer', boxShadow: `0 0 22px rgba(32,216,236,.4)` }}
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
    const color = pct < 0.25 ? '#ff5c7a' : pct < 0.5 ? '#ffd56b' : '#20d8ec'
    arcRef.current.setAttribute('stroke', color)
  }, [seconds, total])

  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  const timeStr = `${m}:${String(s).padStart(2, '0')}`

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(1,6,8,.96)', zIndex: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.32em', color: T.cyanMuted, marginBottom: 18 }}>REST PERIOD</div>
      <div style={{ fontFamily: T.display, fontSize: 96, fontWeight: 700, lineHeight: 1, letterSpacing: '-.02em', color: T.cyanBr, filter: `drop-shadow(0 0 28px rgba(32,216,236,.5))` }}>
        {timeStr}
      </div>
      <svg width="160" height="160" viewBox="0 0 160 160" style={{ margin: '24px 0' }}>
        <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(32,216,236,.08)" strokeWidth="5" />
        <circle ref={arcRef} cx="80" cy="80" r="70" fill="none" stroke={T.cyan}
          strokeWidth="5" strokeLinecap="round"
          strokeDasharray="439.8" strokeDashoffset="0"
          transform="rotate(-90 80 80)" />
      </svg>
      {nextNote && (
        <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.14em', color: T.textDim, marginBottom: 36, textAlign: 'center', maxWidth: 280, lineHeight: 1.7, padding: '0 24px' }}>
          {nextNote}
        </div>
      )}
      <button
        onClick={onSkip}
        style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.24em', padding: '14px 40px', border: T.borderCyan, color: T.cyanMuted, background: 'transparent', cursor: 'pointer' }}
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

  const weightedEx = exercises.find(ex => !ex.bodyweight)
  const topLift = weightedEx
    ? (() => {
        const maxS = weightedEx.sets.filter(s => s.logged && s.logged.w).sort((a, b) => b.logged.w - a.logged.w)
        return maxS.length ? `${maxS[0].logged.w}kg` : '—'
      })()
    : '—'

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: T.bg, color: T.text }}>

      {/* Hero */}
      <div style={{ padding: '44px 24px 28px', borderBottom: T.borderCyan, textAlign: 'center', background: 'linear-gradient(180deg,rgba(77,255,180,.04),transparent)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${T.green},transparent)` }} />
        <div style={{ fontFamily: T.display, fontSize: 36, fontWeight: 700, letterSpacing: '.1em', color: T.green, filter: `drop-shadow(0 0 18px rgba(77,255,180,.5))`, marginBottom: 8 }}>
          SESSION DONE
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.18em', color: T.cyanMuted }}>
          {sessionName} · {mins} MIN · {totalSets} SETS
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: T.borderCyan }}>
        {[
          { label: 'DURATION', val: `${mins}m`,   color: T.cyanBr },
          { label: 'SETS',     val: totalSets,     color: T.green },
          { label: 'TOP LIFT', val: topLift,       color: T.orange },
        ].map(({ label, val, color }, i) => (
          <div key={i} style={{ padding: '16px 10px', borderRight: i < 2 ? T.borderCyan : 'none', textAlign: 'center' }}>
            <div style={{ fontFamily: T.mono, fontSize: 7, letterSpacing: '.16em', color: T.cyanMuted, marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: T.display, fontSize: 24, fontWeight: 700, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Exercise breakdown */}
      <div>
        {exercises.map((ex, i) => {
          const done  = ex.sets.filter(s => s.logged).length
          const total = ex.sets.length
          const maxS  = ex.sets.filter(s => s.logged && s.logged.w).sort((a, b) => b.logged.w - a.logged.w)
          const detail = !ex.bodyweight && maxS.length
            ? `${maxS[0].logged.w}kg · ${done}/${total}`
            : `${done}/${total} sets`
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', borderBottom: `1px solid rgba(32,216,236,.07)` }}>
              <span style={{ fontFamily: T.body, fontSize: 14, color: T.text }}>{ex.name}</span>
              <span style={{ fontFamily: T.mono, fontSize: 9, color: T.green, letterSpacing: '.08em' }}>{detail}</span>
            </div>
          )
        })}
      </div>

      <div style={{ padding: '20px 18px 40px' }}>
        <div
          onClick={onBack}
          style={{ padding: '16px 0', textAlign: 'center', fontFamily: T.display, fontSize: 16, fontWeight: 700, letterSpacing: '.22em', color: T.bg, background: T.green, cursor: 'pointer', boxShadow: `0 0 22px rgba(77,255,180,.3)` }}
        >
          ← BACK TO DASHBOARD
        </div>
      </div>
    </div>
  )
}

// ─── Loading / Error views ────────────────────────────────────────────────────

function LoadingView() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T.bg, gap: 12 }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.28em', color: T.cyanMuted }}>LOADING SESSION…</div>
    </div>
  )
}

function RestDayView({ onBack }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T.bg, gap: 16, padding: '0 36px', textAlign: 'center' }}>
      <div style={{ fontFamily: T.display, fontSize: 28, fontWeight: 700, letterSpacing: '.14em', color: T.text }}>REST DAY</div>
      <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.14em', color: T.cyanMuted, lineHeight: 1.9, maxWidth: 260 }}>Recovery is training. Sleep, eat, stay off your feet.</div>
      <div
        onClick={onBack}
        style={{ marginTop: 24, padding: '14px 36px', fontFamily: T.mono, fontSize: 9, letterSpacing: '.22em', color: T.bg, background: T.cyan, cursor: 'pointer', boxShadow: `0 0 16px rgba(32,216,236,.3)` }}
      >
        ← BACK
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ActiveSession({ onBack }) {
  const [status, setStatus] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [exercises, setExercises] = useState([])
  const [sessionName, setSessionName] = useState('SESSION')
  const [sessionTypeLock, setSessionTypeLock] = useState('Lower')
  const [weekLock, setWeekLock] = useState(null)

  const [curEx, setCurEx] = useState(0)
  const [logModal, setLogModal] = useState(null)
  const [rest, setRest] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [phase, setPhase] = useState('loading')
  const [submitting, setSubmitting] = useState(false)

  // Fetch status and build session
  useEffect(() => {
    getTrainingStatus()
      .then(s => {
        const today = s.today_session
        if (today.session_type === 'rest') {
          setPhase('rest')
          return
        }
        const built = buildExercises(today)
        if (!built.length) {
          setLoadError(true)
          setPhase('active')
          return
        }
        setExercises(built.map(ex => ({
          ...ex,
          sets: ex.sets.map(set => ({ ...set, logged: null })),
        })))
        setSessionName(SESSION_NAMES[today.session_type] || today.session_type.toUpperCase())
        setSessionTypeLock(SESSION_TYPE_LOG[today.session_type] || 'Lower')
        setWeekLock(today.week_of_mesocycle ?? null)
        setStatus(s)
        setPhase('active')
      })
      .catch(() => {
        setLoadError(true)
        setPhase('active')
      })
  }, [])

  // Elapsed timer (only runs during active phase)
  useEffect(() => {
    if (phase !== 'active') return
    const id = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [phase])

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
    const nextSetIdx = setIdx + 1
    const nextSet = ex.sets[nextSetIdx]
    const sec = set.type === 'warmup' ? 60 : ex.restSec

    let nextNote = ''
    if (nextSet) {
      nextNote = ex.bodyweight
        ? `Next: Set ${nextSetIdx + 1}`
        : `Next: Set ${nextSetIdx + 1} · ${nextSet.targetWeight}kg × ${nextSet.targetReps}`
    } else {
      nextNote = 'Last set done — move to next exercise'
    }
    setRest({ seconds: sec, total: sec, nextNote })
  }

  async function finishSession() {
    if (submitting || !exercises.length) return
    setSubmitting(true)

    const exercisePayload = exercises.map(ex => ({
      name: ex.name,
      body_region: ex.bodyweight ? 'upper' : 'lower',
      sets: ex.sets.filter(s => s.logged).map(s => ({
        reps: s.logged.r,
        weight_kg: s.logged.w || 0,
        target_reps: s.targetReps,
      })),
    })).filter(ex => ex.sets.length > 0)

    try {
      await logSession({
        date: new Date().toISOString().slice(0, 10),
        session_type: sessionTypeLock,
        week_number: weekLock,
        exercises: exercisePayload,
        notes: '',
      })
    } catch {}

    setSubmitting(false)
    setPhase('complete')
  }

  if (phase === 'loading') return <LoadingView />
  if (phase === 'rest') return <RestDayView onBack={onBack} />
  if (phase === 'complete') {
    return (
      <CompleteView
        sessionName={sessionName}
        elapsed={elapsed}
        exercises={exercises}
        onBack={onBack}
      />
    )
  }

  if (loadError || !exercises.length) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T.bg, gap: 12, padding: '0 36px', textAlign: 'center' }}>
        <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.22em', color: T.cyanMuted }}>COULD NOT LOAD SESSION</div>
        <div style={{ fontFamily: T.mono, fontSize: 8, color: T.textDim, letterSpacing: '.1em', lineHeight: 1.8 }}>Backend offline or no session scheduled.</div>
        <div onClick={onBack} style={{ marginTop: 16, padding: '14px 36px', fontFamily: T.mono, fontSize: 9, letterSpacing: '.22em', color: T.bg, background: T.cyan, cursor: 'pointer' }}>← BACK</div>
      </div>
    )
  }

  const ex = exercises[curEx]
  const allExDone = ex.sets.every(s => s.logged)
  const isLastEx = curEx === exercises.length - 1
  const allSessionDone = isLastEx && allExDone

  const mins = Math.floor(ex.restSec / 60), secs = ex.restSec % 60
  const restLabel = `REST ${mins}:${String(secs).padStart(2, '0')}`

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, color: T.text, fontFamily: T.body }}>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: T.border, position: 'sticky', top: 0, background: 'rgba(1,6,8,.97)', backdropFilter: 'blur(14px)', zIndex: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: T.orange, fontSize: 16, marginRight: 12, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: T.display, fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: T.orange }}>{sessionName}</span>
        </div>
        <span style={{ fontFamily: T.mono, fontSize: 15, letterSpacing: '.08em', color: T.cyan }}>{fmt(elapsed)}</span>
      </div>

      {/* EXERCISE HEADER */}
      <div style={{ padding: '16px 18px 14px', borderBottom: T.border, background: 'linear-gradient(180deg,rgba(255,143,46,.04),transparent)', flexShrink: 0, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: T.orange, opacity: .8 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.2em', color: T.orangeMuted }}>
            EXERCISE {curEx + 1} OF {exercises.length}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {exercises.map((e, i) => {
              const allDone = e.sets.every(s => s.logged)
              const isCur = i === curEx
              return (
                <div key={i} style={{ width: 22, height: 3, borderRadius: 2, background: allDone ? T.green : isCur ? T.orange : T.orangeDim, transition: 'background .3s', boxShadow: isCur ? `0 0 6px ${T.orange}` : 'none' }} />
              )
            })}
          </div>
        </div>
        <div style={{ fontFamily: T.display, fontSize: 26, fontWeight: 700, letterSpacing: '.04em', color: T.text, lineHeight: 1.1, marginBottom: 6 }}>{ex.name}</div>
        <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.1em', color: T.textDim, lineHeight: 1.6 }}>{ex.focus}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {ex.pct && (
            <span style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.14em', padding: '3px 10px', border: T.border, color: T.orange, background: T.surface }}>{ex.pct}</span>
          )}
          <span style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.12em', padding: '3px 10px', border: T.borderCyan, color: T.cyanMuted }}>{restLabel}</span>
          {status?.today_session?.working_weights?.top_set_note && curEx === 0 && (
            <span style={{ fontFamily: T.mono, fontSize: 7, letterSpacing: '.1em', padding: '3px 8px', border: T.border, color: T.orangeMuted }}>
              {status.today_session.working_weights.top_set_note}
            </span>
          )}
        </div>
      </div>

      {/* SET LIST */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {ex.sets.map((set, i) => {
          const logged       = set.logged
          const prevSetsDone = ex.sets.slice(0, i).every(s => s.logged)
          const state        = logged ? 'completed' : prevSetsDone ? 'active-set' : 'upcoming'
          const isWarmup     = set.type === 'warmup'

          const rowBorder = state === 'completed' ? `1px solid rgba(77,255,180,.22)` : state === 'active-set' ? T.borderCyan : isWarmup ? `1px solid rgba(255,213,107,.14)` : `1px solid rgba(32,216,236,.08)`
          const rowBg     = state === 'completed' ? 'rgba(77,255,180,.04)' : state === 'active-set' ? T.surfaceCyan : isWarmup ? 'rgba(255,213,107,.02)' : 'transparent'
          const indBg     = state === 'completed' ? 'rgba(77,255,180,.14)' : state === 'active-set' ? 'rgba(32,216,236,.14)' : isWarmup ? 'rgba(255,213,107,.1)' : 'rgba(32,216,236,.05)'
          const indColor  = state === 'completed' ? T.green : state === 'active-set' ? T.cyanBr : isWarmup ? T.yellow : T.cyanMuted
          const indBorder = state === 'completed' ? `rgba(77,255,180,.3)` : state === 'active-set' ? T.cyan : isWarmup ? `rgba(255,213,107,.25)` : T.cyanDim
          const indContent= state === 'completed' ? '✓' : isWarmup ? 'W' : (i + 1)

          const prescribed = ex.bodyweight
            ? (set.targetReps === 1 ? 'MARK DONE' : `${set.targetReps} reps`)
            : `${set.targetWeight}kg × ${set.targetReps}`

          return (
            <div
              key={i}
              onClick={() => state !== 'upcoming' && openModal(curEx, i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '15px 14px',
                border: rowBorder, background: rowBg,
                cursor: state !== 'upcoming' ? 'pointer' : 'default',
                boxShadow: state === 'active-set' ? `0 0 14px rgba(32,216,236,.12)` : 'none',
                opacity: state === 'upcoming' ? .5 : 1,
              }}
            >
              <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: T.mono, fontSize: isWarmup ? 8 : 10, fontWeight: 700, background: indBg, color: indColor, border: `1px solid ${indBorder}`, boxShadow: state === 'active-set' ? `0 0 10px rgba(32,216,236,.3)` : 'none' }}>
                {indContent}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: T.mono, fontSize: 7, letterSpacing: '.16em', color: T.cyanMuted, marginBottom: 3 }}>
                  {isWarmup ? 'WARM-UP' : 'WORK SET'} {i + 1}
                </div>
                {logged ? (
                  <div style={{ fontFamily: T.display, fontSize: 20, fontWeight: 700, letterSpacing: '.04em', color: T.green, lineHeight: 1 }}>
                    {ex.bodyweight ? `Done ×${logged.r}` : `${logged.w}kg × ${logged.r}`}
                  </div>
                ) : (
                  <div style={{ fontFamily: T.body, fontSize: 16, color: T.text }}>
                    {prescribed}
                  </div>
                )}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.12em', color: logged ? `rgba(77,255,180,.5)` : T.cyan }}>
                {logged ? 'EDIT' : 'LOG →'}
              </div>
            </div>
          )
        })}
      </div>

      {/* NAV FOOTER */}
      <div style={{ padding: '12px 14px', borderTop: T.border, display: 'flex', gap: 10, position: 'sticky', bottom: 0, background: 'rgba(1,6,8,.97)', backdropFilter: 'blur(14px)', flexShrink: 0 }}>
        <div
          onClick={() => curEx > 0 && setCurEx(c => c - 1)}
          style={{ flex: 1, padding: '15px 0', textAlign: 'center', fontFamily: T.mono, fontSize: 9, letterSpacing: '.2em', color: T.cyanMuted, border: T.borderCyan, cursor: curEx > 0 ? 'pointer' : 'default', opacity: curEx === 0 ? .3 : 1 }}
        >
          ← PREV
        </div>
        {allSessionDone || isLastEx ? (
          <div
            onClick={!submitting ? finishSession : undefined}
            style={{ flex: 2, padding: '15px 0', textAlign: 'center', fontFamily: T.mono, fontSize: 9, letterSpacing: '.2em', color: T.bg, fontWeight: 700, background: T.green, border: 'none', cursor: 'pointer', boxShadow: `0 0 20px rgba(77,255,180,.35)` }}
          >
            {submitting ? 'SAVING…' : 'FINISH ✓'}
          </div>
        ) : (
          <div
            onClick={() => setCurEx(c => Math.min(exercises.length - 1, c + 1))}
            style={{ flex: 2, padding: '15px 0', textAlign: 'center', fontFamily: T.mono, fontSize: 9, letterSpacing: '.2em', color: T.bg, fontWeight: 700, background: T.cyan, border: 'none', cursor: 'pointer', boxShadow: `0 0 16px rgba(32,216,236,.3)` }}
          >
            NEXT →
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
