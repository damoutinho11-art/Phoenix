import { useEffect, useRef, useState } from 'react'
import { ACC, G, Y, R, W, BODY, INK, FM, FD, FB, a, mix, deep, pad2 } from '../holoTokens'
import { SESSION_EXERCISES, READINESS_GAUGES } from '../holoDomains'
import SubShell, { SubLabel } from './SubShell'

// ── TRAINING // LIVE SESSION — queue, set/rest ring, session clock ──
// `exercises` (from holoLive.mapSessionExercises) replaces the fixture queue.
export function SessionSub({ onClose, exercises, meta }) {
  const EXERCISES = exercises || SESSION_EXERCISES
  const [idx, setIdx] = useState(0)
  const [done, setDone] = useState(EXERCISES.map(() => 0))
  const [elapsed, setElapsed] = useState(0)
  const [rest, setRest] = useState(0)
  const restIv = useRef(null)

  useEffect(() => {
    const iv = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => { clearInterval(iv); clearInterval(restIv.current) }
  }, [])

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

  const allDone = idx >= EXERCISES.length
  const cur = EXERCISES[Math.min(idx, EXERCISES.length - 1)]

  const mainAction = () => {
    if (allDone) { onClose(); return }
    if (rest) { clearInterval(restIv.current); setRest(0); return }
    const d = done.slice()
    d[idx] += 1
    let nextIdx = idx
    if (d[idx] >= EXERCISES[idx].sets) nextIdx += 1
    const finished = nextIdx >= EXERCISES.length
    setDone(d)
    setIdx(nextIdx)
    setRest(finished ? 0 : 90)
    if (!finished) startRest()
  }

  const ringColor = allDone ? G : rest ? Y : ACC
  const ringOffset = allDone ? '0' : rest ? (389.6 * (1 - rest / 90)).toFixed(1) : '0'
  const big = allDone ? '✓' : rest ? String(rest) : `${done[idx] + 1}/${cur.sets}`
  const sub = allDone ? 'SESSION COMPLETE · RECOVERY WINDOW OPEN' : rest ? 'REST · SECONDS' : 'SET LIVE — ' + cur.name.toUpperCase()
  const subColor = allDone ? G : rest ? Y : a(ACC, 'cc')
  const cue = allDone ? 'LOG RPE + NOTES IN JOURNAL. PROTEIN WINDOW OPENS NOW — 860 KCAL STANDING BY.' : cur.cue

  return (
    <SubShell subKey="session" onClose={onClose} meta={meta}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1.1, minWidth: 240 }}>
          <SubLabel>EXERCISE QUEUE</SubLabel>
          {EXERCISES.map((ex, i) => {
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
                  <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.1em', color: a(ACC, '99') }}>{ex.scheme}</span>
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
          <button onClick={mainAction} style={{ minHeight: 48, width: 'min(280px, 100%)', fontFamily: FM, fontSize: 10, letterSpacing: '.24em', color: INK, background: `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})`, border: `1px solid ${ACC}`, cursor: 'pointer', boxShadow: `0 0 26px ${a(ACC, '66')}` }}>
            {allDone ? 'CLOSE SESSION' : rest ? 'SKIP REST' : 'COMPLETE SET'}
          </button>
          <div style={{ marginTop: 9 }}>
            <button onClick={onClose} style={{ minHeight: 36, padding: '0 18px', fontFamily: FM, fontSize: '8.5px', letterSpacing: '.2em', color: a(ACC, '99'), background: 'none', border: `1px solid ${a(ACC, '30')}`, cursor: 'pointer' }}>END SESSION</button>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 210 }}>
          <SubLabel style={{ marginBottom: 8 }}>SESSION CLOCK</SubLabel>
          <div style={{ fontFamily: FD, fontSize: 40, fontWeight: 300, color: W, textShadow: `0 0 14px ${a(ACC, '66')}`, marginBottom: 14 }}>
            {pad2(Math.floor(elapsed / 60)) + ':' + pad2(elapsed % 60)}
          </div>
          <div style={{ border: `1px solid ${a(ACC, '26')}`, background: deep(50), padding: '11px 13px', marginBottom: 10 }}>
            <div style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.26em', color: a(ACC, 'cc'), marginBottom: 6 }}>COACH CUE</div>
            <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.08em', lineHeight: 1.8, color: mix(BODY, 96) }}>{cue}</div>
          </div>
          {[['REST PROTOCOL', '90S / SET', W], ['TARGET RPE', '9 · MAX INTENT', W], ['READINESS GATE', '82% · CLEAR', G]].map(([k, v, c], i, arr) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < arr.length - 1 ? `1px solid ${a(ACC, '14')}` : 'none', fontFamily: FM, fontSize: 8, letterSpacing: '.12em' }}>
              <span style={{ color: a(ACC, '99') }}>{k}</span><span style={{ color: c }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </SubShell>
  )
}

// ── TRAINING // READINESS SCAN — constellation body + gauges ──
export function ReadinessSub({ onClose }) {
  return (
    <SubShell subKey="readiness" onClose={onClose}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 250, display: 'flex', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: 'min(52vmin, 236px)' }}>
            <svg viewBox="0 0 200 320" style={{ width: '100%', display: 'block' }}>
              <ellipse cx="100" cy="298" rx="58" ry="10" fill="none" stroke={a(ACC, '33')} strokeWidth="1" />
              <ellipse cx="100" cy="298" rx="38" ry="6" fill="none" stroke={a(ACC, '22')} strokeWidth="1" strokeDasharray="3 4" />
              <g stroke={a(ACC, '55')} strokeWidth="1.1" fill="none">
                <circle cx="100" cy="30" r="11" />
                <path d="M 100 41 L 100 44" />
                <path d="M 70 64 L 130 64" />
                <path d="M 100 44 L 70 64 M 100 44 L 130 64" />
                <path d="M 70 64 L 56 106 L 50 148" />
                <path d="M 130 64 L 144 106 L 150 148" />
                <path d="M 100 44 L 100 78 L 100 140" />
                <path d="M 84 146 L 116 146" />
                <path d="M 100 140 L 84 146 M 100 140 L 116 146" />
                <path d="M 84 146 L 80 210 L 78 270 L 68 278" />
                <path d="M 116 146 L 120 210 L 122 270 L 132 278" />
              </g>
              <g fill={ACC} style={{ filter: `drop-shadow(0 0 3px ${ACC})` }}>
                {[[100, 44], [70, 64], [130, 64], [56, 106], [144, 106], [50, 148], [150, 148], [100, 78], [100, 140], [84, 146], [116, 146], [80, 210], [120, 210], [78, 270], [122, 270]].map(([cx, cy]) => (
                  <circle key={cx + '-' + cy} cx={cx} cy={cy} r="2.6" />
                ))}
              </g>
              <circle cx="82" cy="178" r="9" fill="none" stroke={Y} strokeWidth="1" strokeDasharray="3 3" style={{ transformOrigin: '82px 178px', animation: 'holo-ringSpin 8s linear infinite' }} />
              <circle cx="82" cy="178" r="4.5" fill={Y} style={{ animation: 'holo-twinkle 1.6s ease-in-out infinite', filter: `drop-shadow(0 0 5px ${Y})` }} />
              <path d="M 73 178 L 30 178" stroke={mix(Y, 33)} strokeWidth="1" />
              <text x="4" y="172" fontFamily="Share Tech Mono, monospace" fontSize="7" letterSpacing="1" fill={Y}>QUADS</text>
              <text x="4" y="182" fontFamily="Share Tech Mono, monospace" fontSize="5.5" letterSpacing="0.8" fill={mix(Y, 60)}>MODERATE LOAD</text>
            </svg>
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', left: '6%', right: '6%', height: '16%', background: `linear-gradient(180deg, transparent, ${a(ACC, '26')} 42%, ${mix(W, 13)} 50%, ${a(ACC, '26')} 58%, transparent)`, animation: 'holo-scanBand 4.8s linear infinite' }} />
            </div>
          </div>
        </div>
        <div style={{ flex: 1.2, minWidth: 270 }}>
          {READINESS_GAUGES.map((rg, i) => (
            <div key={i} style={{ padding: '7px 0 9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                <span style={{ fontFamily: FM, fontSize: '8.5px', letterSpacing: '.16em', color: mix(BODY, 72) }}>{rg.l}</span>
                <span style={{ fontFamily: FD, fontSize: 21, fontWeight: 600, color: rg.c }}>{rg.v}</span>
              </div>
              <div style={{ height: 5, background: a(ACC, '14'), border: `1px solid ${a(ACC, '20')}`, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: rg.w, background: `linear-gradient(90deg, ${mix(rg.c, 53)}, ${rg.c})`, boxShadow: `0 0 8px ${mix(rg.c, 53)}` }} />
              </div>
            </div>
          ))}
          <div style={{ marginTop: 12, border: `1px solid ${mix(G, 27)}`, background: mix(G, 5), padding: '13px 15px' }}>
            <div style={{ fontFamily: FM, fontSize: '9.5px', letterSpacing: '.26em', color: G, textShadow: `0 0 10px ${mix(G, 40)}`, marginBottom: 6 }}>▸ CLEAR FOR HIGH NEURAL</div>
            <div style={{ fontFamily: FB, fontSize: 15, fontWeight: 300, lineHeight: 1.5, color: mix(BODY, 84) }}>
              Readiness 82% — full session approved. Quads carry moderate soreness from Monday: cap depth drops at 3×5 and stop on any sharp signal.
            </div>
          </div>
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
