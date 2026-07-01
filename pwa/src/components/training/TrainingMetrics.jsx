import { useState, useEffect } from 'react'
import {
  getTrainingBrief,
  getTrainingHistory,
  getTrainingRecovery,
  getTrainingRoutedSession,
  getTrainingStatus,
  logSleep,
  logSoreness,
  postTrainingCapacityBlock,
  postTrainingReadinessScan,
} from '../../api/client'
import { canStartHighNeural, readinessLabel, readinessTone, routeFallback } from './trainingViewModel'

const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap'
const KEYFRAMES = `
  @keyframes phScan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
  @keyframes phGlow { 0%,100%{box-shadow:0 0 14px rgba(255,143,46,.3)} 50%{box-shadow:0 0 28px rgba(255,143,46,.6)} }
  @keyframes phPulse { 0%,100%{opacity:1} 50%{opacity:.25} }
`

const BG      = '#060c12'
const CARD    = '#070e15'
const ORANGE  = '#ff8f2e'
const ORANGE_MUT = 'rgba(255,143,46,.42)'
const ORANGE_DIM = 'rgba(255,143,46,.16)'
const ORANGE_BDR = '1px solid rgba(255,143,46,.18)'
const ORANGE_BDR_STR = '1px solid rgba(255,143,46,.28)'
const CYAN    = '#20d8ec'
const CYAN_BR = '#7df0ff'
const CYAN_MUT = 'rgba(32,216,236,.42)'
const CYAN_BDR = '1px solid rgba(32,216,236,.18)'
const GREEN   = '#4dffb4'
const YELLOW  = '#ffd56b'
const RED     = '#ff5c7a'
const TEXT    = 'rgba(199,236,244,.92)'
const TEXT_DIM = 'rgba(132,212,226,.5)'
const MONO    = "'Share Tech Mono', monospace"
const DISPLAY = "'Rajdhani', sans-serif"
const BODY    = "'Space Grotesk', sans-serif"

function scoreColor(score) {
  if (score == null) return CYAN_MUT
  return score >= 75 ? GREEN : score >= 50 ? YELLOW : RED
}

function CornerCard({ children, style = {} }) {
  return (
    <div style={{ position: 'relative', background: 'rgba(6,12,18,.9)', border: ORANGE_BDR, overflow: 'hidden', ...style }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${ORANGE},transparent)`, opacity: .4 }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: 9, height: 9, borderTop: `1px solid rgba(255,143,46,.5)`, borderLeft: `1px solid rgba(255,143,46,.5)` }} />
      <div style={{ position: 'absolute', top: 0, right: 0, width: 9, height: 9, borderTop: `1px solid rgba(255,143,46,.5)`, borderRight: `1px solid rgba(255,143,46,.5)` }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: 9, height: 9, borderBottom: `1px solid rgba(255,143,46,.5)`, borderLeft: `1px solid rgba(255,143,46,.5)` }} />
      <div style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderBottom: `1px solid rgba(255,143,46,.5)`, borderRight: `1px solid rgba(255,143,46,.5)` }} />
      {children}
    </div>
  )
}

function Label({ children, cyan = false }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.22em', color: cyan ? CYAN_MUT : ORANGE_MUT, marginBottom: 8 }}>
      {children}
    </div>
  )
}

function timeAgo(iso) {
  if (!iso) return null
  const diffMin = Math.round((Date.now() - new Date(iso)) / 60000)
  if (diffMin < 1)  return 'JUST NOW'
  if (diffMin < 60) return `${diffMin}m AGO`
  return `${Math.round(diffMin / 60)}h AGO`
}

function RecoveryRing({ recovery, onLogSleep, onLogSoreness, logging, loggedKey }) {
  const sleep    = recovery?.sleep
  const soreness = recovery?.soreness
  const overall  = recovery?.overall ?? null

  const sleepScore    = sleep?.available    ? (sleep.score    ?? null) : null
  const sleepHours    = sleep?.available    ? (sleep.duration_hours ?? null) : null
  const sorenessLabel = soreness?.available ? (soreness.label ?? null) : null
  const sorenessPct   = soreness?.available ? (soreness.pct   ?? 0)   : 0

  const sleepAgo    = sleep?.available    ? timeAgo(sleep.wakeup)    : null
  const sorenessAgo = soreness?.available ? timeAgo(soreness.logged_at) : null

  const ringPct   = overall ?? 0
  const circ      = 213.6
  const offset    = circ * (1 - ringPct / 100)
  const ringColor = scoreColor(overall)
  const sleepColor = scoreColor(sleepScore)
  const sorenessColor = soreness?.available ? scoreColor(sorenessPct) : CYAN_MUT

  const sleepVal = sleepHours != null
    ? `${Math.floor(sleepHours)}h ${Math.round((sleepHours % 1) * 60)}m`
    : '—'

  const btnStyle = (key) => {
    const isLoading = logging === key
    const isDone    = loggedKey === key
    return {
      flex: 1, fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', textAlign: 'center',
      color:      isDone ? BG : isLoading ? BG : CYAN_BR,
      background: isDone ? GREEN : isLoading ? CYAN : 'rgba(32,216,236,.06)',
      border:     `1px solid ${isDone ? 'rgba(77,255,180,.45)' : 'rgba(32,216,236,.28)'}`,
      padding: '7px 0', cursor: !!logging ? 'default' : 'pointer',
      transition: 'background .22s, color .22s, border .22s',
      boxShadow: isDone ? '0 0 10px rgba(77,255,180,.28)' : 'none',
      userSelect: 'none',
    }
  }

  return (
    <div style={{ padding: '14px 18px', borderBottom: ORANGE_BDR, background: 'rgba(32,216,236,.018)' }}>
      <Label cyan>RECOVERY STATUS</Label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg width="72" height="72" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(32,216,236,.08)" strokeWidth="5" />
            <circle cx="40" cy="40" r="34" fill="none" stroke={ringColor} strokeWidth="5"
              strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
              transform="rotate(-90 40 40)"
              style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)', filter: `drop-shadow(0 0 5px ${ringColor}66)` }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: ringColor, lineHeight: 1 }}>
              {overall != null ? `${overall}%` : '—'}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 6, letterSpacing: '.1em', color: CYAN_MUT, marginTop: 2 }}>READY</div>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'SLEEP',    color: sleepColor,    pct: sleepScore ?? 0, val: sleepVal,          ago: sleepAgo },
            { label: 'SORENESS', color: sorenessColor, pct: sorenessPct,      val: sorenessLabel ?? '—', ago: sorenessAgo },
          ].map(({ label, color, pct, val, ago }) => (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: CYAN_MUT }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  {ago && <span style={{ fontFamily: MONO, fontSize: 6, letterSpacing: '.06em', color: 'rgba(32,216,236,.25)' }}>{ago}</span>}
                  <span style={{ fontFamily: MONO, fontSize: 8, color, letterSpacing: '.04em' }}>{val}</span>
                </div>
              </div>
              <div style={{ height: 3, background: 'rgba(32,216,236,.1)', borderRadius: 2 }}>
                <div style={{ height: '100%', borderRadius: 2, background: color, width: `${pct}%`, transition: 'width 1.1s ease', boxShadow: `0 0 5px ${color}66` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* log controls */}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: CYAN_MUT, marginBottom: 6 }}>LOG SLEEP</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {[{ ev: 'bedtime', label: 'BED' }, { ev: 'wakeup', label: 'WAKE' }].map(({ ev, label }) => (
              <div key={ev} onClick={!logging ? () => onLogSleep(ev) : undefined}
                style={btnStyle(ev)}>
                {logging === ev ? '…' : loggedKey === ev ? '✓' : label}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: CYAN_MUT, marginBottom: 6 }}>LOG SORENESS</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {[{ label: 'LOW', score: 1 }, { label: 'MED', score: 3 }, { label: 'HIGH', score: 5 }].map(({ label, score }) => (
              <div key={label} onClick={!logging ? () => onLogSoreness(score) : undefined}
                style={btnStyle(`sor-${score}`)}>
                {logging === `sor-${score}` ? '…' : loggedKey === `sor-${score}` ? '✓' : label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function DomainButton({ label, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{ position: 'relative', overflow: 'hidden', border: ORANGE_BDR_STR, padding: '11px 0', textAlign: 'center', background: 'rgba(255,143,46,.03)', cursor: 'pointer', flex: 1 }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,rgba(255,143,46,.38),transparent)` }} />
      <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.18em', color: 'rgba(255,143,46,.72)' }}>{label}</div>
    </div>
  )
}

const READINESS_AREAS = [
  ['knee', 'Knee'],
  ['ankle', 'Ankle'],
  ['hip', 'Hip'],
  ['hamstring', 'Hamstring'],
  ['calf_achilles', 'Calf / Achilles'],
  ['lower_back_pelvic', 'Lower back / pelvic'],
]

function ReadinessCockpit({ route, scores, setScores, flags, setFlags, note, setNote, saving, onSubmit, onCompleteBlock, onRequestReset }) {
  const current = routeFallback(route)
  const tone = readinessTone(current.readiness_status)
  const toneColor = tone === 'ready' ? GREEN : tone === 'caution' ? YELLOW : RED

  return (
    <div style={{ padding: '14px', borderBottom: ORANGE_BDR, background: 'linear-gradient(145deg,rgba(255,143,46,.04),rgba(32,216,236,.018))' }}>
      <CornerCard style={{ marginBottom: 12 }}>
        <div style={{ padding: '15px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <Label>READINESS SCAN</Label>
              <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, color: TEXT }}>Readiness Scan</div>
              <div style={{ fontFamily: BODY, fontSize: 12, lineHeight: 1.55, color: 'rgba(199,236,244,.68)', marginTop: 4 }}>
                Quick readiness scan — this helps Phoenix tune today’s warm-up and substitutions.
              </div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', color: toneColor, border: `1px solid ${toneColor}55`, padding: '5px 8px', whiteSpace: 'nowrap' }}>
              {readinessLabel(current.readiness_status)}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: '10px 14px' }}>
            {READINESS_AREAS.map(([key, label]) => (
              <label key={key} style={{ display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 8, color: TEXT_DIM, marginBottom: 5 }}>
                  <span>{label}</span><span style={{ color: scores[key] >= 5 ? RED : scores[key] >= 3 ? YELLOW : GREEN }}>{scores[key]}</span>
                </div>
                <input type="range" min="0" max="10" value={scores[key]}
                  aria-label={`${label} discomfort`}
                  onChange={e => setScores({ ...scores, [key]: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: ORANGE }} />
              </label>
            ))}
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="What feels off? (optional)" maxLength={500}
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 12, padding: '10px 11px', background: 'rgba(0,0,0,.25)', border: ORANGE_BDR, color: TEXT, fontFamily: BODY, fontSize: 12 }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
            {[
              ['sharp_pain', 'Sharp pain'], ['limping', 'Limping'], ['next_day_worsening', 'Next-day worsening'],
            ].map(([key, label]) => (
              <label key={key} style={{ fontFamily: MONO, fontSize: 8, color: TEXT_DIM, display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={flags[key]} onChange={e => setFlags({ ...flags, [key]: e.target.checked })} /> {label}
              </label>
            ))}
          </div>
          <button onClick={onSubmit} disabled={saving}
            style={{ width: '100%', marginTop: 13, padding: '12px', border: ORANGE_BDR_STR, background: 'rgba(255,143,46,.1)', color: ORANGE, fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'ROUTING…' : 'TUNE TODAY’S SESSION'}
          </button>
          <button onClick={onRequestReset} disabled={saving}
            style={{ width: '100%', marginTop: 7, padding: 9, border: CYAN_BDR, background: 'rgba(32,216,236,.035)', color: CYAN_BR, fontFamily: MONO, fontSize: 8, letterSpacing: '.14em', cursor: saving ? 'wait' : 'pointer' }}>
            SELECT RECOVERY RESET
          </button>
        </div>
      </CornerCard>

      <CornerCard>
        <div style={{ padding: '15px 16px' }}>
          <Label cyan>TODAY’S ROUTE</Label>
          <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, color: CYAN_BR }}>Today’s Route</div>
          <div style={{ fontFamily: BODY, fontSize: 12, lineHeight: 1.6, color: TEXT, marginTop: 5 }}>
            {current.readiness_status === 'unchecked'
              ? 'Complete the scan before jumps, sprints, or heavy lower-body work. A conservative warm-up is available now.'
              : current.readiness_status === 'clear'
                ? 'Planned session is available with progressive preparation.'
                : 'Phoenix adjusted today’s session based on your readiness scan.'}
          </div>
          {current.substitutions.map((item, index) => (
            <div key={`${item.area}-${index}`} style={{ marginTop: 9, padding: '9px 10px', border: `1px solid ${toneColor}35`, background: `${toneColor}09` }}>
              <div style={{ fontFamily: MONO, fontSize: 8, color: toneColor, textTransform: 'uppercase' }}>{item.reason}</div>
              <div style={{ fontFamily: BODY, fontSize: 11, color: TEXT, marginTop: 4, lineHeight: 1.5 }}>{item.action}</div>
            </div>
          ))}
          <div style={{ fontFamily: MONO, fontSize: 8, lineHeight: 1.55, color: TEXT_DIM, marginTop: 10 }}>{current.safety_note}</div>
        </div>
      </CornerCard>

      <div style={{ marginTop: 12 }}>
        <Label>JOINT CAPACITY BLOCK</Label>
        <div style={{ fontFamily: DISPLAY, fontSize: 22, color: TEXT, fontWeight: 700, marginBottom: 9 }}>Joint Capacity Block</div>
        {current.capacity_blocks.length === 0 && <div style={{ fontFamily: BODY, fontSize: 12, color: TEXT_DIM }}>Submit the readiness scan to load today’s real capacity route.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
          {current.capacity_blocks.map(block => (
            <CornerCard key={block.key}>
              <div style={{ padding: '13px 14px' }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 700, color: block.key === 'recovery_reset' ? CYAN_BR : ORANGE }}>{block.label}</div>
                <div style={{ fontFamily: BODY, fontSize: 11, lineHeight: 1.5, color: TEXT_DIM, margin: '4px 0 8px' }}>{block.purpose}</div>
                {block.exercises.slice(0, 6).map((exercise, i) => (
                  <div key={i} style={{ fontFamily: BODY, fontSize: 11, color: 'rgba(199,236,244,.78)', padding: '5px 0', borderTop: i ? '1px solid rgba(255,143,46,.08)' : 'none' }}>
                    {exercise.name || exercise.zone?.replaceAll('_', ' ')}
                    {exercise.dose && <span style={{ color: ORANGE_MUT }}> · {exercise.dose}</span>}
                  </div>
                ))}
                <button onClick={() => onCompleteBlock(block.key)} style={{ width: '100%', marginTop: 9, padding: 8, background: 'rgba(255,143,46,.06)', border: ORANGE_BDR, color: ORANGE, fontFamily: MONO, fontSize: 7, letterSpacing: '.14em' }}>LOG COMPLETE</button>
              </div>
            </CornerCard>
          ))}
        </div>
        {/* Labels remain explicit for conditional routes: Sled Balance · Squat Balance · Pelvic Control · Recovery Reset · Jump Balance */}
      </div>
    </div>
  )
}

export default function TrainingMetrics({ onBack, onNav }) {
  const [statusData, setStatusData]   = useState(null)
  const [history, setHistory]         = useState(null)
  const [recovery, setRecovery]       = useState(null)
  const [brief, setBrief]             = useState(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [recoveryLogging, setRecoveryLogging] = useState(null)
  const [recoveryLoggedKey, setRecoveryLoggedKey] = useState(null)
  const [route, setRoute] = useState(null)
  const [routeSaving, setRouteSaving] = useState(false)
  const [scores, setScores] = useState({ knee: 0, ankle: 0, hip: 0, hamstring: 0, calf_achilles: 0, lower_back_pelvic: 0 })
  const [readinessFlags, setReadinessFlags] = useState({ sharp_pain: false, limping: false, next_day_worsening: false })
  const [readinessNote, setReadinessNote] = useState('')

  useEffect(() => {
    if (!document.getElementById('ph-fonts')) {
      const link = document.createElement('link')
      link.id = 'ph-fonts'; link.rel = 'stylesheet'; link.href = FONTS_URL
      document.head.appendChild(link)
    }
    if (!document.getElementById('ph-keyframes')) {
      const style = document.createElement('style')
      style.id = 'ph-keyframes'; style.textContent = KEYFRAMES
      document.head.appendChild(style)
    }
  }, [])

  useEffect(() => {
    async function load() {
      const [s, h, r, routed] = await Promise.allSettled([
        getTrainingStatus(), getTrainingHistory(), getTrainingRecovery(), getTrainingRoutedSession(),
      ])
      if (s.status === 'fulfilled') setStatusData(s.value)
      if (h.status === 'fulfilled') setHistory(h.value)
      if (r.status === 'fulfilled') setRecovery(r.value)
      if (routed.status === 'fulfilled') setRoute(routed.value)
    }
    load()
  }, [])

  async function loadBrief() {
    if (briefLoading) return
    setBriefLoading(true)
    try {
      const b = await getTrainingBrief()
      setBrief(b.brief)
    } catch { setBrief('Unable to load brief.') }
    setBriefLoading(false)
  }

  async function handleLogSleep(eventType) {
    setRecoveryLogging(eventType)
    try {
      await logSleep(eventType)
      const r = await getTrainingRecovery()
      setRecovery(r)
      setRecoveryLoggedKey(eventType)
      setTimeout(() => setRecoveryLoggedKey(null), 1500)
    } catch { /* ignore */ }
    setRecoveryLogging(null)
  }

  async function handleLogSoreness(score) {
    const key = `sor-${score}`
    setRecoveryLogging(key)
    try {
      await logSoreness(score)
      const r = await getTrainingRecovery()
      setRecovery(r)
      setRecoveryLoggedKey(key)
      setTimeout(() => setRecoveryLoggedKey(null), 1500)
    } catch { /* ignore */ }
    setRecoveryLogging(null)
  }

  async function handleReadinessSubmit() {
    setRouteSaving(true)
    try {
      await postTrainingReadinessScan({ ...scores, ...readinessFlags, note: readinessNote || null })
      setRoute(await getTrainingRoutedSession())
    } finally {
      setRouteSaving(false)
    }
  }

  async function handleCompleteBlock(blockKey) {
    await postTrainingCapacityBlock({ block_key: blockKey, completed: true })
  }

  async function handleRequestReset() {
    setRouteSaving(true)
    try { setRoute(await getTrainingRoutedSession({ explicitReset: true })) }
    finally { setRouteSaving(false) }
  }

  function nav(screen) { if (onNav) onNav(screen) }

  // ── Derived values ──────────────────────────────────────────────────────────
  const targetDateStr  = statusData?.dunk_goal?.attempt_window_start ?? '2026-08-31'
  const daysToAttempt  = statusData?.dunk_goal?.days_to_attempt
    ?? Math.max(0, Math.ceil((new Date(targetDateStr) - new Date()) / 86400000))
  const phase          = statusData?.dunk_goal?.current_phase ?? 'ACCUMULATION'
  const mesoWeek       = statusData?.dunk_goal?.current_mesocycle_week ?? '—'
  const onTrack        = statusData?.dunk_goal?.on_track
  const todaySession   = statusData?.today_session
  const sessionType    = todaySession?.session_type?.toUpperCase() ?? '—'
  const sessionLabel   = todaySession?.label ?? ''
  const exercises      = todaySession?.exercises ?? []
  const hasConflict    = statusData?.has_hard_conflicts
  const conflictDetail = statusData?.conflicts?.[0]?.detail ?? ''
  const sessionStartAllowed = canStartHighNeural(route)

  const jumpProgression = history?.jump_progression ?? []
  const jumpDataInches  = jumpProgression
    .filter(p => p.approach != null)
    .map(p => parseFloat((p.approach / 2.54).toFixed(2)))
  const lastJumpIn  = jumpDataInches.length > 0 ? jumpDataInches[jumpDataInches.length - 1] : null
  const firstJumpIn = jumpDataInches.length > 0 ? jumpDataInches[0] : null
  const jumpGained  = (lastJumpIn != null && firstJumpIn != null)
    ? `+${(lastJumpIn - firstJumpIn).toFixed(1)}" gained`
    : 'no data yet'

  const sessionCount         = history?.sessions?.length ?? 0
  const currentBodyweightKg  = statusData?.cut_status?.current_bodyweight_kg ?? null
  const weeklyWeightDelta    = statusData?.cut_status?.weekly_delta_kg ?? null

  const phaseFull = phase.replace(/_/g, ' ')

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: BG, color: TEXT, fontFamily: BODY }}>

      {/* TOP BAR */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 18px 11px', borderBottom: ORANGE_BDR,
        position: 'sticky', top: 0, background: `${CARD}f8`,
        backdropFilter: 'blur(14px)', zIndex: 5, flexShrink: 0, overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${ORANGE},transparent)`, animation: 'phScan 3.5s linear infinite' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span onClick={onBack} style={{ color: ORANGE, fontSize: 16, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '.3em', color: ORANGE, textShadow: `0 0 18px rgba(255,143,46,.4)` }}>TRAINING</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.12em', color: 'rgba(255,143,46,.55)', border: ORANGE_BDR, padding: '3px 9px', background: 'rgba(255,143,46,.04)' }}>
            {phaseFull}
          </div>
          <div
            onClick={brief ? () => setBrief(null) : loadBrief}
            style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: 'rgba(255,143,46,.72)', border: ORANGE_BDR_STR, padding: '3px 9px', background: 'rgba(255,143,46,.04)', cursor: 'pointer' }}
          >
            {briefLoading ? '…' : brief ? 'CLOSE' : 'BRIEF'}
          </div>
        </div>
      </div>

      {/* BRIEF PANEL */}
      {brief && (
        <div style={{ padding: '14px 18px', background: 'rgba(32,216,236,.025)', borderBottom: CYAN_BDR, flexShrink: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.2em', color: CYAN_MUT, marginBottom: 8 }}>PHOENIX BRIEF</div>
          <div style={{ fontFamily: BODY, fontSize: 13, color: TEXT, lineHeight: 1.7 }}>{brief}</div>
        </div>
      )}

      {/* CONFLICT BANNER */}
      {hasConflict && (
        <div style={{ padding: '10px 18px', background: 'rgba(255,92,122,.05)', borderBottom: `1px solid rgba(255,92,122,.22)`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ color: RED, fontSize: 13 }}>!</span>
          <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.1em', color: RED, lineHeight: 1.6 }}>{conflictDetail}</span>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 88 }}>

        {/* DUNK HERO */}
        <div style={{ padding: '20px 18px 16px', borderBottom: ORANGE_BDR, background: 'linear-gradient(155deg,rgba(255,143,46,.05),transparent 65%)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,rgba(255,143,46,.5),transparent)` }} />
          <div style={{ position: 'absolute', top: 10, right: 14, fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: 'rgba(255,143,46,.2)' }}>MISSION CLOCK</div>
          <Label>DAYS TO DUNK ATTEMPT</Label>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 10 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 78, fontWeight: 700, lineHeight: .88, color: ORANGE, filter: 'drop-shadow(0 0 20px rgba(255,143,46,.4))' }}>
              {daysToAttempt}
            </div>
            <div style={{ paddingBottom: 10 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 400, letterSpacing: '.26em', color: ORANGE_MUT }}>DAYS</div>
              <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.12em', color: ORANGE, border: ORANGE_BDR, padding: '3px 8px', marginTop: 5, background: 'rgba(255,143,46,.04)' }}>
                {targetDateStr.slice(0, 7).replace('-', '/').toUpperCase()}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: onTrack ? GREEN : YELLOW, animation: 'phPulse 2s ease-in-out infinite' }} />
              <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: onTrack ? GREEN : YELLOW }}>
                {onTrack ? 'ON TRACK' : 'REVIEW NEEDED'}
              </span>
            </div>
            <span style={{ fontFamily: MONO, fontSize: 7, color: TEXT_DIM }}>·</span>
            <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.12em', color: TEXT_DIM }}>WEEK {mesoWeek} OF 10</span>
          </div>
          {/* Mesocycle progress bar */}
          <div style={{ marginTop: 14 }}>
            <div style={{ height: 2, background: 'rgba(255,143,46,.1)', borderRadius: 1, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(parseInt(mesoWeek) || 0) / 10 * 100}%`, background: `linear-gradient(90deg,rgba(255,143,46,.35),${ORANGE})`, borderRadius: 1, transition: 'width 1.2s cubic-bezier(.4,0,.2,1)', boxShadow: `0 0 6px rgba(255,143,46,.4)` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
              <span style={{ fontFamily: MONO, fontSize: 6, letterSpacing: '.1em', color: 'rgba(255,143,46,.22)' }}>WK 1</span>
              <span style={{ fontFamily: MONO, fontSize: 6, letterSpacing: '.1em', color: 'rgba(255,143,46,.22)' }}>WK 10</span>
            </div>
          </div>
        </div>

        {/* WEEK + TODAY STRIP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: ORANGE_BDR }}>
          <div style={{ padding: '13px 18px', borderRight: ORANGE_BDR }}>
            <Label cyan>CURRENT WEEK</Label>
            <div style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 700, letterSpacing: '.04em', color: CYAN_BR }}>{`WK ${mesoWeek}`}</div>
            <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', color: TEXT_DIM, marginTop: 2 }}>{phaseFull.toLowerCase()}</div>
          </div>
          <div style={{ padding: '13px 18px' }}>
            <Label>TODAY</Label>
            <div style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 700, letterSpacing: '.02em', color: ORANGE }}>{sessionType}</div>
            <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', color: TEXT_DIM, marginTop: 2 }}>{sessionLabel}</div>
          </div>
        </div>

        <ReadinessCockpit
          route={route} scores={scores} setScores={setScores}
          flags={readinessFlags} setFlags={setReadinessFlags}
          note={readinessNote} setNote={setReadinessNote}
          saving={routeSaving} onSubmit={handleReadinessSubmit}
          onCompleteBlock={handleCompleteBlock}
          onRequestReset={handleRequestReset}
        />

        {/* TODAY'S SESSION CARD */}
        <div style={{ padding: '12px 14px', borderBottom: ORANGE_BDR }}>
          <CornerCard>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: ORANGE, boxShadow: `0 0 12px rgba(255,143,46,.45)` }} />
            <div style={{ padding: '13px 14px 13px 18px', cursor: sessionStartAllowed ? 'pointer' : 'default' }} onClick={() => sessionStartAllowed && nav('active-session')}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.22em', color: ORANGE, marginBottom: 4 }}>{sessionType}</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '.04em', color: TEXT, lineHeight: 1 }}>{sessionLabel || 'SESSION'}</div>
                </div>
                <span style={{ fontSize: 15, color: 'rgba(255,143,46,.6)', paddingTop: 4 }}>→</span>
              </div>
              {sessionStartAllowed && exercises.length > 0 && (
                <div>
                  {exercises.slice(0, 3).map((ex, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < Math.min(exercises.length, 3) - 1 ? `1px solid rgba(255,143,46,.08)` : 'none' }}>
                      <span style={{ fontFamily: BODY, fontSize: 13, color: 'rgba(199,236,244,.8)', fontWeight: 300 }}>{ex.name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.06em', color: ORANGE_MUT }}>{ex.sets_reps || ex.label || ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div
              onClick={() => sessionStartAllowed && nav('active-session')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', background: sessionStartAllowed ? 'rgba(255,143,46,.07)' : 'rgba(255,213,107,.04)', borderTop: ORANGE_BDR, fontFamily: MONO, fontSize: 8, letterSpacing: '.2em', color: sessionStartAllowed ? ORANGE : YELLOW, cursor: sessionStartAllowed ? 'pointer' : 'default', animation: sessionStartAllowed ? 'phGlow 2.5s ease-in-out infinite' : 'none' }}
            >
              {sessionStartAllowed ? '▶ START SESSION' : 'COMPLETE READINESS SCAN'}
            </div>
          </CornerCard>
        </div>

        {/* STATS ROW */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: `1px solid rgba(32,216,236,.14)` }}>
          {[
            { label: 'SESSIONS', val: sessionCount > 0 ? String(sessionCount) : '—', color: CYAN_BR, sub: 'this block' },
            {
              label: 'VERT JUMP',
              val: lastJumpIn != null ? `${lastJumpIn.toFixed(1)}"` : '—',
              color: GREEN,
              sub: jumpGained,
            },
            {
              label: 'BODYWEIGHT',
              val: currentBodyweightKg != null ? `${currentBodyweightKg.toFixed(1)}` : '—',
              color: ORANGE,
              sub: weeklyWeightDelta != null
                ? `${weeklyWeightDelta > 0 ? '+' : ''}${weeklyWeightDelta.toFixed(1)} this wk`
                : 'kg',
            },
          ].map(({ label, val, color, sub }, i) => (
            <div key={i} style={{ padding: '13px 10px', borderRight: i < 2 ? ORANGE_BDR : 'none', textAlign: 'center' }}>
              <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: ORANGE_MUT, marginBottom: 5 }}>{label}</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 700, color }}>{val}</div>
              <div style={{ fontFamily: MONO, fontSize: 7, color: TEXT_DIM, marginTop: 3, letterSpacing: '.06em' }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* RECOVERY */}
        <RecoveryRing
          recovery={recovery}
          onLogSleep={handleLogSleep}
          onLogSoreness={handleLogSoreness}
          logging={recoveryLogging}
          loggedKey={recoveryLoggedKey}
        />

        {/* DOMAIN BUTTONS */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 14px 20px' }}>
          <DomainButton label="JUMP LOG" onClick={() => nav('jump-log')} />
          <DomainButton label="HISTORY"  onClick={() => nav('training-history')} />
          <DomainButton label="BODY"     onClick={() => nav('body')} />
        </div>

      </div>
    </div>
  )
}
