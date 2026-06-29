import { useState, useEffect } from 'react'
import { getTrainingHistory, getTrainingStatus, getTrainingRecovery, getTrainingBrief, logSleep, logSoreness } from '../../api/client'

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

function RecoveryRing({ recovery, onLogSleep, onLogSoreness, logging, loggedKey }) {
  const sleep    = recovery?.sleep
  const soreness = recovery?.soreness
  const overall  = recovery?.overall ?? null

  const sleepScore    = sleep?.available    ? (sleep.score    ?? null) : null
  const sleepHours    = sleep?.available    ? (sleep.duration_hours ?? null) : null
  const sorenessLabel = soreness?.available ? (soreness.label ?? null) : null
  const sorenessPct   = soreness?.available ? (soreness.pct   ?? 0)   : 0

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
            { label: 'SLEEP',    color: sleepColor,    pct: sleepScore ?? 0, val: sleepVal },
            { label: 'SORENESS', color: sorenessColor, pct: sorenessPct,      val: sorenessLabel ?? '—' },
          ].map(({ label, color, pct, val }) => (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: CYAN_MUT }}>{label}</span>
                <span style={{ fontFamily: MONO, fontSize: 8, color, letterSpacing: '.04em' }}>{val}</span>
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

export default function TrainingMetrics({ onBack, onNav }) {
  const [statusData, setStatusData]   = useState(null)
  const [history, setHistory]         = useState(null)
  const [recovery, setRecovery]       = useState(null)
  const [brief, setBrief]             = useState(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [recoveryLogging, setRecoveryLogging] = useState(null)
  const [recoveryLoggedKey, setRecoveryLoggedKey] = useState(null)

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
      const [s, h, r] = await Promise.allSettled([
        getTrainingStatus(), getTrainingHistory(), getTrainingRecovery(),
      ])
      if (s.status === 'fulfilled') setStatusData(s.value)
      if (h.status === 'fulfilled') setHistory(h.value)
      if (r.status === 'fulfilled') setRecovery(r.value)
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

        {/* TODAY'S SESSION CARD */}
        <div style={{ padding: '12px 14px', borderBottom: ORANGE_BDR }}>
          <CornerCard>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: ORANGE, boxShadow: `0 0 12px rgba(255,143,46,.45)` }} />
            <div style={{ padding: '13px 14px 13px 18px', cursor: 'pointer' }} onClick={() => nav('active-session')}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.22em', color: ORANGE, marginBottom: 4 }}>{sessionType}</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '.04em', color: TEXT, lineHeight: 1 }}>{sessionLabel || 'SESSION'}</div>
                </div>
                <span style={{ fontSize: 15, color: 'rgba(255,143,46,.6)', paddingTop: 4 }}>→</span>
              </div>
              {exercises.length > 0 && (
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
              onClick={() => nav('active-session')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', background: 'rgba(255,143,46,.07)', borderTop: ORANGE_BDR, fontFamily: MONO, fontSize: 8, letterSpacing: '.24em', color: ORANGE, cursor: 'pointer', animation: 'phGlow 2.5s ease-in-out infinite' }}
            >
              ▶ START SESSION
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
