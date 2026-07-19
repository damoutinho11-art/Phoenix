import { useEffect, useRef, useState } from 'react'
import { ACC, G, Y, R, W, BODY, INK, FM, FD, FB, a, mix, deep, pad2 } from '../holoTokens'
import { logSession, postTrainingReadinessScan } from '../../../api/client'
import SubShell, { SubLabel } from './SubShell'
import {
  buildCompletionPayload,
  buildReadinessPayload,
  canCompleteSession,
  normalizePlanExercises,
} from './trainingSessionModel.js'

const fieldStyle = {
  width: '100%', minHeight: 42, padding: '0 11px', boxSizing: 'border-box',
  fontFamily: FM, fontSize: 11, color: W, background: deep(65),
  border: `1px solid ${a(ACC, '44')}`, outline: 'none',
}

const actionStyle = disabled => ({
  minHeight: 48, width: '100%', fontFamily: FM, fontSize: 10,
  letterSpacing: '.2em', color: disabled ? a(W, '55') : INK,
  background: disabled ? deep(70) : `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})`,
  border: `1px solid ${disabled ? a(ACC, '22') : ACC}`,
  cursor: disabled ? 'not-allowed' : 'pointer',
  boxShadow: disabled ? 'none' : `0 0 24px ${a(ACC, '44')}`,
})

function ClosedState({ message }) {
  return (
    <div style={{ minHeight: 260, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div>
        <div style={{ fontFamily: FD, fontSize: 28, color: Y, letterSpacing: '.08em' }}>{message}</div>
        <div style={{ marginTop: 12, fontFamily: FM, fontSize: 9, color: a(ACC, '88'), letterSpacing: '.16em' }}>
          PHOENIX WILL NOT INFER A SESSION WITHOUT VERIFIED PLAN DATA
        </div>
      </div>
    </div>
  )
}

export function SessionSub({ onClose, training, refreshTraining, meta }) {
  const routed = training?.routed
  const exercises = normalizePlanExercises(routed)
  const [idx, setIdx] = useState(0)
  const [done, setDone] = useState(() => exercises.map(() => 0))
  const [elapsed, setElapsed] = useState(0)
  const [rest, setRest] = useState(0)
  const [rpe, setRpe] = useState('')
  const [painAnswered, setPainAnswered] = useState(false)
  const [painConfirmed, setPainConfirmed] = useState(false)
  const [painBodyAreas, setPainBodyAreas] = useState([])
  const [notes, setNotes] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const restIv = useRef(null)

  useEffect(() => {
    if (!exercises.length) return undefined
    const iv = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => { clearInterval(iv); clearInterval(restIv.current) }
  }, [exercises.length])

  if (training?.state !== 'ready') {
    return <SubShell subKey="session" onClose={onClose} meta={meta}><ClosedState message={training?.message || 'SESSION CLOSED'} /></SubShell>
  }
  if (!exercises.length) {
    return <SubShell subKey="session" onClose={onClose} meta={meta}><ClosedState message="PRESCRIPTION UNAVAILABLE" /></SubShell>
  }

  const startRest = () => {
    clearInterval(restIv.current)
    restIv.current = setInterval(() => {
      setRest(r => {
        const next = Math.max(0, r - 1)
        if (!next) clearInterval(restIv.current)
        return next
      })
    }, 1000)
  }

  const allDone = idx >= exercises.length
  const cur = exercises[Math.min(idx, exercises.length - 1)]

  const mainAction = () => {
    if (allDone) return
    if (rest) { clearInterval(restIv.current); setRest(0); return }
    const d = done.slice()
    d[idx] += 1
    let nextIdx = idx
    if (d[idx] >= exercises[idx].sets) nextIdx += 1
    const finished = nextIdx >= exercises.length
    setDone(d)
    setIdx(nextIdx)
    setRest(finished ? 0 : exercises[nextIdx].restSeconds)
    if (!finished) startRest()
  }

  const togglePainArea = area => setPainBodyAreas(items => (
    items.includes(area) ? items.filter(item => item !== area) : [...items, area]
  ))

  const submit = async () => {
    const valid = canCompleteSession({ allSetsDone: allDone, rpe: Number(rpe), painAnswered, painConfirmed, painBodyAreas })
    if (!valid || posting) return
    setPosting(true)
    setError('')
    try {
      await logSession(buildCompletionPayload({
        routed, exercises, elapsedSeconds: elapsed, rpe: Number(rpe),
        painConfirmed, painBodyAreas, notes,
      }))
      setSaved(true)
      await refreshTraining?.()
    } catch (requestError) {
      setError(requestError?.message || 'Session evidence was not accepted')
    } finally {
      setPosting(false)
    }
  }

  const ringColor = allDone ? G : rest ? Y : ACC
  const ringOffset = allDone ? '0' : rest ? (389.6 * (1 - rest / Math.max(rest, cur.restSeconds))).toFixed(1) : '0'
  const big = allDone ? '✓' : rest ? String(rest) : `${done[idx] + 1}/${cur.sets}`
  const sub = allDone ? 'SETS COMPLETE - EVIDENCE REQUIRED' : rest ? 'REST - SECONDS' : 'SET LIVE - ' + cur.name.toUpperCase()
  const subColor = allDone ? G : rest ? Y : a(ACC, 'cc')

  return (
    <SubShell subKey="session" onClose={onClose} meta={meta}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1.1, minWidth: 240 }}>
          <SubLabel>EXERCISE QUEUE</SubLabel>
          {exercises.map((ex, i) => {
            const live = i === idx && !allDone
            const exDone = i < idx
            const st = exDone ? '✓ DONE' : live ? (rest ? '● REST' : '● LIVE') : 'QUEUED'
            const stColor = exDone ? G : live ? (rest ? Y : G) : a(ACC, '66')
            return (
              <div key={i} style={{ padding: '10px 12px', marginBottom: 9, background: deep(55), border: `1px solid ${a(ACC, live ? '66' : '22')}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontFamily: FB, fontSize: 17, fontWeight: 400, color: live ? W : exDone ? G : a(ACC, '77'), lineHeight: 1.2 }}>
                    <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.1em', color: a(ACC, '99') }}>{'0' + (i + 1)} </span>
                    {ex.name}
                  </span>
                  <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.12em', color: stColor, whiteSpace: 'nowrap' }}>{st}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 }}>
                  <span style={{ display: 'inline-flex', gap: 4 }}>
                    {Array.from({ length: ex.sets }, (_, j) => (
                      <i key={j} style={{ width: 8, height: 8, border: `1px solid ${a(ACC, '44')}`, background: j < done[i] ? ACC : 'transparent', boxShadow: j < done[i] ? `0 0 7px ${a(ACC, '88')}` : 'none' }} />
                    ))}
                  </span>
                    <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.1em', color: a(ACC, '99') }}>
                      {ex.sets} x {ex.reps}{ex.loadKg != null ? ` @ ${ex.loadKg}KG` : ''}
                    </span>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ flex: 1.2, minWidth: 260, textAlign: 'center' }}>
          <svg viewBox="0 0 140 140" style={{ width: 168, height: 168, display: 'block', margin: '0 auto' }}>
            <circle cx="70" cy="70" r="62" fill="none" stroke={a(ACC, '1a')} strokeWidth="5" />
            <circle cx="70" cy="70" r="62" fill="none" stroke={ringColor} strokeWidth="5" strokeLinecap="round" strokeDasharray="389.6" strokeDashoffset={ringOffset} transform="rotate(-90 70 70)" style={{ filter: `drop-shadow(0 0 7px ${ringColor})`, transition: 'stroke-dashoffset .9s linear, stroke .4s ease' }} />
            <circle cx="70" cy="70" r="52" fill="none" stroke={a(ACC, '22')} strokeWidth="1" strokeDasharray="2 4" style={{ transformOrigin: '50% 50%', animation: 'holo-ringSpin 24s linear infinite' }} />
          </svg>
          <div style={{ marginTop: -118, marginBottom: 62 }}>
            <div style={{ fontFamily: FD, fontSize: 34, fontWeight: 700, color: W, textShadow: `0 0 16px ${a(ACC, '66')}`, lineHeight: 1 }}>{big}</div>
            <div style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.22em', color: subColor, marginTop: 5, maxWidth: 130, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>{sub}</div>
          </div>
          {!allDone && <button onClick={mainAction} style={actionStyle(false)}>{rest ? 'SKIP REST' : 'COMPLETE SET'}</button>}
          <div style={{ marginTop: 9 }}>
            <button onClick={onClose} style={{ minHeight: 36, padding: '0 18px', fontFamily: FM, fontSize: '8.5px', letterSpacing: '.2em', color: a(ACC, '99'), background: 'none', border: `1px solid ${a(ACC, '30')}`, cursor: 'pointer' }}>END SESSION</button>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 210 }}>
          <SubLabel style={{ marginBottom: 8 }}>SESSION CLOCK</SubLabel>
          <div style={{ fontFamily: FD, fontSize: 40, fontWeight: 300, color: W, textShadow: `0 0 14px ${a(ACC, '66')}`, marginBottom: 14 }}>
            {pad2(Math.floor(elapsed / 60)) + ':' + pad2(elapsed % 60)}
          </div>
          {[['PLAN ID', routed.plan_provenance?.plan_id || 'UNAVAILABLE', W], ['SESSION', routed.session?.display_name || routed.session?.session_type, W], ['ROUTE', String(routed.readiness_status || 'clear').toUpperCase(), G]].map(([k, v, c], i, arr) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < arr.length - 1 ? `1px solid ${a(ACC, '14')}` : 'none', fontFamily: FM, fontSize: 8, letterSpacing: '.12em' }}>
              <span style={{ color: a(ACC, '99') }}>{k}</span><span style={{ color: c }}>{v}</span>
            </div>
          ))}
          {allDone && !saved && (
            <div style={{ marginTop: 14, borderTop: `1px solid ${a(ACC, '33')}`, paddingTop: 12, textAlign: 'left' }}>
              <SubLabel>COMPLETION EVIDENCE</SubLabel>
              <label style={{ fontFamily: FM, fontSize: 8, color: a(ACC, 'aa'), letterSpacing: '.14em' }}>SESSION RPE - 1 TO 10</label>
              <input aria-label="Session RPE" type="number" min="1" max="10" value={rpe} onChange={event => setRpe(event.target.value)} style={{ ...fieldStyle, margin: '6px 0 12px' }} />
              <div style={{ fontFamily: FM, fontSize: 8, color: a(ACC, 'aa'), letterSpacing: '.14em', marginBottom: 7 }}>ANY PAIN DURING SESSION?</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {[[false, 'NO'], [true, 'YES']].map(([value, label]) => (
                  <button key={label} onClick={() => { setPainAnswered(true); setPainConfirmed(value); if (!value) setPainBodyAreas([]) }} style={{ ...actionStyle(false), minHeight: 38, color: painAnswered && painConfirmed === value ? INK : W, background: painAnswered && painConfirmed === value ? ACC : deep(65), boxShadow: 'none' }}>{label}</button>
                ))}
              </div>
              {painConfirmed && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 10 }}>
                {['knee', 'ankle', 'hip', 'hamstring', 'calf_achilles', 'lower_back_pelvic'].map(area => (
                  <label key={area} style={{ fontFamily: FM, fontSize: 8, color: W, letterSpacing: '.08em' }}><input type="checkbox" checked={painBodyAreas.includes(area)} onChange={() => togglePainArea(area)} /> {area.replaceAll('_', ' ').toUpperCase()}</label>
                ))}
              </div>}
              <textarea aria-label="Session notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="OPTIONAL SESSION NOTES" style={{ ...fieldStyle, minHeight: 68, paddingTop: 10, resize: 'vertical', marginBottom: 10 }} />
              <button onClick={submit} disabled={!canCompleteSession({ allSetsDone: allDone, rpe: Number(rpe), painAnswered, painConfirmed, painBodyAreas }) || posting} style={actionStyle(!canCompleteSession({ allSetsDone: allDone, rpe: Number(rpe), painAnswered, painConfirmed, painBodyAreas }) || posting)}>{posting ? 'VERIFYING...' : 'COMMIT SESSION'}</button>
              {error && <div role="alert" style={{ marginTop: 8, fontFamily: FM, fontSize: 8, color: R }}>{error}</div>}
            </div>
          )}
          {saved && <button onClick={onClose} style={{ ...actionStyle(false), marginTop: 16 }}>SESSION VERIFIED - CLOSE</button>}
        </div>
      </div>
    </SubShell>
  )
}

const READINESS_FIELDS = [
  ['knee', 'KNEE'], ['ankle', 'ANKLE'], ['hip', 'HIP'],
  ['hamstring', 'HAMSTRING'], ['calf_achilles', 'CALF / ACHILLES'],
  ['lower_back_pelvic', 'LOWER BACK / PELVIC'],
]

export function ReadinessSub({ onClose, training, refreshTraining }) {
  const [form, setForm] = useState({
    knee: 0, ankle: 0, hip: 0, hamstring: 0, calf_achilles: 0,
    lower_back_pelvic: 0, sharp_pain: false, limping: false,
    next_day_worsening: false, note: '',
  })
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const submit = async () => {
    if (posting) return
    setPosting(true)
    setError('')
    try {
      const response = await postTrainingReadinessScan(buildReadinessPayload(form))
      setResult(response)
      await refreshTraining?.()
    } catch (requestError) {
      setError(requestError?.message || 'Readiness scan was not accepted')
    } finally {
      setPosting(false)
    }
  }
  return (
    <SubShell subKey="readiness" onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 22 }}>
        <div>
          <SubLabel>DISCOMFORT - 0 NONE / 10 SEVERE</SubLabel>
          {READINESS_FIELDS.map(([key, label]) => (
            <label key={key} style={{ display: 'grid', gridTemplateColumns: '1fr minmax(120px, 1.4fr) 34px', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${a(ACC, '18')}`, fontFamily: FM, fontSize: 8, color: W, letterSpacing: '.12em' }}>
              {label}
              <input type="range" min="0" max="10" value={form[key]} onChange={event => update(key, Number(event.target.value))} style={{ accentColor: ACC }} />
              <span style={{ fontFamily: FD, fontSize: 20, color: Number(form[key]) >= 5 ? R : Number(form[key]) >= 3 ? Y : G }}>{form[key]}</span>
            </label>
          ))}
        </div>
        <div>
          <SubLabel>SAFETY SIGNALS</SubLabel>
          {[['sharp_pain', 'SHARP PAIN'], ['limping', 'LIMPING'], ['next_day_worsening', 'WORSE THAN YESTERDAY']].map(([key, label]) => (
            <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 40, fontFamily: FM, fontSize: 9, color: form[key] ? R : W, letterSpacing: '.14em' }}>
              <input type="checkbox" checked={form[key]} onChange={event => update(key, event.target.checked)} /> {label}
            </label>
          ))}
          <textarea aria-label="Readiness note" value={form.note} onChange={event => update('note', event.target.value)} placeholder="OPTIONAL CONTEXT FOR PHOENIX" style={{ ...fieldStyle, minHeight: 84, paddingTop: 10, resize: 'vertical', margin: '10px 0' }} />
          <button onClick={submit} disabled={posting} style={actionStyle(posting)}>{posting ? 'CLASSIFYING...' : 'SUBMIT READINESS'}</button>
          {result && <div style={{ marginTop: 12, padding: 13, border: `1px solid ${mix(G, 27)}`, background: mix(G, 5) }}>
            <div style={{ fontFamily: FM, fontSize: 10, color: G, letterSpacing: '.2em' }}>ROUTE RECORDED - {String(result.readiness_status).toUpperCase()}</div>
            <div style={{ marginTop: 7, fontFamily: FB, fontSize: 14, color: BODY }}>Phoenix has recalculated today from the submitted body check.</div>
          </div>}
          {error && <div role="alert" style={{ marginTop: 9, fontFamily: FM, fontSize: 8, color: R }}>{error}</div>}
          {!result && training?.routed?.readiness_scan && <div style={{ marginTop: 12, fontFamily: FM, fontSize: 8, color: a(ACC, '77'), letterSpacing: '.12em' }}>A SCAN EXISTS FOR TODAY. SUBMIT AGAIN ONLY TO REPLACE THE CURRENT ROUTE.</div>}
        </div>
      </div>
    </SubShell>
  )
}

// ── TRAINING // SLEEP LOG — dial + ±15min + stage bars ──
export function SleepSub({ onClose, min, logged, onAdjust, onLog }) {
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState(false)
  const submit = async () => {
    if (logged || posting) return
    setPosting(true)
    setError(false)
    try {
      await onLog()
    } catch {
      setError(true)
    }
    setPosting(false)
  }
  const wake = (23 * 60 + 40 + min) % 1440
  const stage = pct => {
    const sm = Math.round(min * pct)
    return Math.floor(sm / 60) + 'H ' + pad2(sm % 60) + 'M'
  }
  const stages = [
    { l: 'DEEP', v: stage(0.18), w: '18%', c: ACC },
    { l: 'REM', v: stage(0.22), w: '22%', c: W },
    { l: 'LIGHT', v: stage(0.60), w: '60%', c: a(ACC, '99') },
  ]
  const adjBtn = { minWidth: 46, minHeight: 44, fontFamily: FD, fontSize: 20, color: ACC, background: deep(60), border: `1px solid ${a(ACC, '44')}`, cursor: 'pointer' }
  return (
    <SubShell subKey="sleep" onClose={onClose}>
      <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 250, textAlign: 'center' }}>
          <svg viewBox="0 0 140 140" style={{ width: 176, height: 176, display: 'block', margin: '0 auto' }}>
            <circle cx="70" cy="70" r="58" fill="none" stroke={a(ACC, '1a')} strokeWidth="6" />
            <circle cx="70" cy="70" r="58" fill="none" stroke={G} strokeWidth="6" strokeLinecap="round" strokeDasharray="364.4" strokeDashoffset={(364.4 * (1 - min / 600)).toFixed(1)} transform="rotate(-90 70 70)" style={{ filter: `drop-shadow(0 0 7px ${G})`, transition: 'stroke-dashoffset .4s cubic-bezier(.3,.8,.3,1)' }} />
            <circle cx="70" cy="70" r="48" fill="none" stroke={a(ACC, '22')} strokeWidth="1" strokeDasharray="2 4" />
          </svg>
          <div style={{ marginTop: -122, marginBottom: 66 }}>
            <div style={{ fontFamily: FD, fontSize: 38, fontWeight: 700, color: W, textShadow: `0 0 16px ${mix(G, 33)}` }}>{Math.floor(min / 60) + ':' + pad2(min % 60)}</div>
            <div style={{ fontFamily: FM, fontSize: '6.5px', letterSpacing: '.26em', color: a(ACC, '99') }}>HOURS ASLEEP</div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
            <button onClick={() => onAdjust(-15)} style={adjBtn}>−</button>
            <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.16em', color: a(ACC, '99') }}>± 15 MIN</span>
            <button onClick={() => onAdjust(15)} style={adjBtn}>+</button>
          </div>
          <div style={{ fontFamily: FM, fontSize: '8.5px', letterSpacing: '.18em', color: a(ACC, '99'), marginTop: 12 }}>
            23:40 <span style={{ color: ACC }}>→</span> {pad2(Math.floor(wake / 60)) + ':' + pad2(wake % 60)}
          </div>
        </div>
        <div style={{ flex: 1.1, minWidth: 260 }}>
          <SubLabel>ESTIMATED ARCHITECTURE</SubLabel>
          {stages.map((sg, i) => (
            <div key={i} style={{ padding: '6px 0 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.16em', color: mix(BODY, 72) }}>{sg.l}</span>
                <span style={{ fontFamily: FD, fontSize: 17, fontWeight: 600, color: sg.c }}>{sg.v}</span>
              </div>
              <div style={{ height: 5, background: a(ACC, '14'), border: `1px solid ${a(ACC, '20')}`, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: sg.w, background: `linear-gradient(90deg, ${mix(sg.c, 53)}, ${sg.c})`, boxShadow: `0 0 8px ${mix(sg.c, 53)}` }} />
              </div>
            </div>
          ))}
          <button onClick={submit} disabled={posting} style={{ minHeight: 46, width: '100%', marginTop: 12, fontFamily: FM, fontSize: 10, letterSpacing: '.24em', color: INK, background: logged ? `linear-gradient(135deg, ${G}, ${mix(G, 73)})` : `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})`, border: `1px solid ${logged ? G : ACC}`, cursor: posting ? 'not-allowed' : 'pointer', boxShadow: `0 0 26px ${logged ? mix(G, 33) : a(ACC, '55')}` }}>
            {logged ? '✓ LOGGED' : posting ? 'TRANSMITTING…' : 'LOG SLEEP'}
          </button>
          <div style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.12em', color: error ? R : logged ? G : a(ACC, '77'), marginTop: 9, textAlign: 'center' }}>
            {error ? 'LOG FAILED — LINK DOWN · TAP TO RETRY' : logged ? '✓ SYNCED TO RECOVERY MODEL — READINESS RECALCULATED' : "FEEDS TOMORROW'S READINESS GATE"}
          </div>
        </div>
      </div>
    </SubShell>
  )
}
