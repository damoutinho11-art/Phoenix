import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './holo.css'
import { ACC, G, Y, W, SCENE, RAISED, PANEL, BG, BODY, INK, FM, FB, HOME_ACCENT, scopeClass, a, mix, deep } from './holoTokens'
import { buildDomains } from './holoDomains'
import useHoloData from './useHoloData'
import { logMeal as apiLogMeal, logSleepDuration } from '../../api/client'
import { applyFinance, applyNutrition, applyTraining, applyCalendar, mapHoldings, mealBudget, mapDinners, mapSessionExercises, mapConnectorLanes, mapTodayRail } from './holoLive'
import HoloScene, { useHoloAtmosphere, HoloEdgeChrome, HoloBootLine, HoloDomainFlash, HoloBeams } from './HoloScene'
import HoloCore from './HoloCore'
import HoloWings from './HoloWings'
import HoloFocus from './HoloFocus'
import HoloDock, { DOCK_ORDER } from './HoloDock'
import { HoldingsSub, ApproveSub, BriefSub } from './subs/FinanceSubs'
import FinanceControlRoom from './subs/FinanceControlRoom'
import { LogMealSub, DinnerSub, PlanDaySub } from './subs/NutritionSubs'
import { SessionSub, ReadinessSub, SleepSub } from './subs/TrainingSubs'
import { TodaySub, WeekMapSub, FeedsSub } from './subs/CalendarSubs'

function useMedia(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

// mouse parallax: [data-plx] nodes translate by depth factor, lerped per frame.
// Fine pointers only; disabled under prefers-reduced-motion.
function useParallax(rootRef, deps) {
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let nodes = Array.from(rootRef.current?.querySelectorAll('[data-plx]') ?? [])
    const target = { x: 0, y: 0 }
    const cur = { x: 0, y: 0 }
    const onMouse = e => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2
      target.y = (e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('mousemove', onMouse)
    let raf
    const loop = () => {
      cur.x += (target.x - cur.x) * 0.055
      cur.y += (target.y - cur.y) * 0.055
      for (const n of nodes) {
        const d = parseFloat(n.getAttribute('data-plx')) || 0
        n.style.translate = cur.x * d * -420 + 'px ' + cur.y * d * -300 + 'px'
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('mousemove', onMouse)
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

const pad = x => String(x).padStart(2, '0')

export default function HoloCommand({ startTab = 'home' }) {
  const rootRef = useRef(null)
  const [tab, setTab] = useState(startTab)
  const [warp, setWarp] = useState(null)     // domain we're warping toward (home → domain)
  const [warped, setWarped] = useState(false) // last transition was a warp-in
  const [fx, setFx] = useState(0)            // remount key for entrance/flash replays
  const [clock, setClock] = useState('00:00:00')
  const [focus, setFocus] = useState(null)   // wing panel code
  const [sub, setSub] = useState(null)       // sub-screen key
  const [burst, setBurst] = useState(true)   // core "hot" window after a switch
  const [voice, setVoice] = useState('idle')
  const [voiceMsg, setVoiceMsg] = useState(null)
  const [chatLog, setChatLog] = useState([])
  // sub-screen state that must survive close / feed back into the main screen
  const [holdSel, setHoldSel] = useState(0)
  const [appChecks, setAppChecks] = useState([false, false, false, false])
  const [appStamped, setAppStamped] = useState(false)
  const [mealLog, setMealLog] = useState([])
  const [dinnerSel, setDinnerSel] = useState(0)
  const [dinnerLocked, setDinnerLocked] = useState(false)
  const [slpMin, setSlpMin] = useState(460)
  const [slpLogged, setSlpLogged] = useState(false)

  const isMobile = useMedia('(max-width: 780px)')
  const isShort = useMedia('(max-height: 720px)')
  const composerRef = useRef(null)
  const voiceT1 = useRef(null)
  const voiceT2 = useRef(null)
  const warpT = useRef(null)
  const burstT = useRef(null)

  // clock
  useEffect(() => {
    const tick = () => {
      const n = new Date()
      setClock(pad(n.getHours()) + ':' + pad(n.getMinutes()) + ':' + pad(n.getSeconds()))
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])

  const kickBurst = useCallback(() => {
    clearTimeout(burstT.current)
    setBurst(true)
    burstT.current = setTimeout(() => setBurst(false), 2600)
  }, [])
  useEffect(() => () => { clearTimeout(burstT.current); clearTimeout(warpT.current); clearTimeout(voiceT1.current); clearTimeout(voiceT2.current) }, [])

  const go = useCallback(t => {
    setWarp(w => {
      if (w) return w // mid-warp: ignore
      setTab(prevTab => {
        if (t === prevTab) return prevTab
        setSub(null)
        setFocus(null)
        if (prevTab === 'home' && t !== 'home') {
          // warp transition: scale/blur out, then warp-in on the target
          warpT.current = setTimeout(() => {
            setTab(t)
            setWarp(null)
            setWarped(true)
            setFx(x => x + 1)
            kickBurst()
          }, 500)
          setWarp(t)
          return prevTab
        }
        setWarped(false)
        setFx(x => x + 1)
        kickBurst()
        return t
      })
      return w
    })
  }, [kickBurst])

  // keys 1–5 + ESC walkback (sub → focus → home)
  useEffect(() => {
    const onKey = e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const i = parseInt(e.key, 10)
      if (i >= 1 && i <= 5) go(DOCK_ORDER[i - 1])
      if (e.key === 'Escape') {
        if (sub) setSub(null)
        else if (focus) setFocus(null)
        else go('home')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, sub, focus])

  useParallax(rootRef, [tab, sub, focus, isMobile])

  // ── voice link + directive composer (home) ──
  const clearVoiceTimers = () => { clearTimeout(voiceT1.current); clearTimeout(voiceT2.current) }
  const micDown = () => {
    clearVoiceTimers()
    setVoice('listening')
    setVoiceMsg('Listening — hold steady and speak your directive.')
  }
  const micUp = () => {
    setVoice(v => {
      if (v !== 'listening') return v
      setVoiceMsg('Analyzing signal…')
      voiceT1.current = setTimeout(() => {
        const msg = 'Directive received. Say "open finance" — or type below — to route into a module.'
        setVoice('speaking')
        setVoiceMsg(msg)
        setChatLog(s => s.concat([{ w: 'phx', t: msg }]))
        voiceT2.current = setTimeout(() => { setVoice('idle'); setVoiceMsg(null) }, 3400)
      }, 900)
      return 'processing'
    })
  }
  const sendDirective = () => {
    const el = composerRef.current
    const raw = ((el && el.value) || '').trim()
    if (!raw) return
    if (el) el.value = ''
    clearVoiceTimers()
    const t = raw.toLowerCase()
    const domain = ['finance', 'nutrition', 'training', 'calendar'].find(d => t.includes(d))
    let msg
    let hold = 4200
    let after = null
    if (domain) {
      msg = `Routing to ${domain.toUpperCase()} — projecting module…`
      hold = 750
      after = () => go(domain)
    } else if (/status|report|how|nominal/.test(t)) {
      const parts = ['All modules nominal.']
      if (live.finance) parts.push(`Invested €${Math.round(live.finance.total_invested).toLocaleString('en-US')}`)
      if (live.nutrition) parts.push(`${Math.max(0, Math.round(live.nutrition.remaining_calories))} kcal open`)
      if (live.training) parts.push(`${live.training.dunk_goal?.days_to_attempt} days to dunk attempt`)
      if (live.calendar) parts.push(`${(live.calendar.events || []).length} events in the calendar window`)
      msg = parts.length > 1 ? parts[0] + ' ' + parts.slice(1).join(' · ') + '.' : 'All modules nominal. Portfolio €1,893 · 860 kcal open · 53 days to dunk attempt · next event 10:00.'
      hold = 5200
    } else {
      msg = `Directive logged: "${raw}". Try "open training" or "status report".`
    }
    setVoice('speaking')
    setVoiceMsg(msg)
    setChatLog(s => s.concat([{ w: 'you', t: raw }, { w: 'phx', t: msg }]))
    voiceT1.current = setTimeout(() => { setVoice('idle'); setVoiceMsg(null); if (after) after() }, hold)
  }

  // ── live data + domain derivation + sub-screen feedback ──
  const live = useHoloData()
  const budget = useMemo(() => mealBudget(live.nutrition), [live.nutrition])
  const liveDinners = useMemo(() => mapDinners(live.nutrition), [live.nutrition])
  const hour = new Date().getHours()
  const dayPart = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const D = useMemo(() => {
    const all = buildDomains(dayPart)
    let d = all[tab] || all.finance
    // real sources override fixtures per-domain (fixtures remain the fallback)
    if (tab === 'finance') d = applyFinance(d, live.finance)
    if (tab === 'nutrition') d = applyNutrition(d, live.nutrition)
    if (tab === 'training') d = applyTraining(d, live.training)
    if (tab === 'calendar') d = applyCalendar(d, live.calendar, live.connectors)
    if (tab === 'finance' && appStamped) {
      d.heroChips = [d.heroChips[0], d.heroChips[1], { text: 'W28 APPROVED ✓', color: G }]
      d.panels[1].rows[1] = { title: 'Approval', sub: 'MARKED BY YOU · JUST NOW', value: 'APPROVED', valueColor: G }
    }
    if (tab === 'nutrition' && mealLog.length) {
      const ek = mealLog.reduce((acc, m) => acc + m.k, 0)
      const ep = mealLog.reduce((acc, m) => acc + m.p, 0)
      d.heroValue = String(Math.max(0, budget.kcalOpen - ek))
      d.heroLabel = 'CONSUMED ' + (budget.consumedBase + ek).toLocaleString('en-US') + ' · TARGET ' + budget.target.toLocaleString('en-US')
      const baseCount = live.nutrition ? (live.nutrition.logged?.items?.length || 0) : 3
      d.panels[1].meta = baseCount + mealLog.length + ' LOGGED'
      if (d.panels[1].rows.length === 1 && d.panels[1].rows[0].value === '—') d.panels[1].rows = []
      mealLog.forEach(m => d.panels[1].rows.push({ title: 'Composed meal', sub: m.p + 'P · LOGGED NOW', value: String(m.k), valueColor: G }))
      d.heroChips[2] = { text: 'PROTEIN +' + ep + 'G LOGGED', color: Y }
    }
    if (tab === 'nutrition' && dinnerLocked) {
      const dn = (liveDinners || [])[dinnerSel] || null
      d.panels[3].meta = 'LOCKED 19:30'
      d.panels[3].rows[0] = dn
        ? { title: dn.n, sub: 'LOCKED FOR 19:30', value: '✓ ' + dn.k, valueColor: G }
        : { title: 'Salmon + potatoes', sub: 'LOCKED FOR 19:30', value: '✓ 620', valueColor: G }
    }
    if (tab === 'training' && slpLogged) {
      d.feed = [{ t: 'NOW', msg: 'SLEEP UPDATED ' + Math.floor(slpMin / 60) + 'H ' + pad(slpMin % 60) + 'M', tone: G }].concat(d.feed)
    }
    return d
  }, [tab, dayPart, appStamped, mealLog, dinnerLocked, dinnerSel, slpLogged, slpMin, live, budget, liveDinners])

  const atmosphere = useHoloAtmosphere(tab, isMobile)
  const blips = useMemo(() => {
    const src = D.feed.length ? D.feed.slice(0, 3) : [{ tone: 'body' }, { tone: G }]
    return src.map((fd, i) => ({
      x: 26 + ((i * 31 + tab.length * 7) % 46) + '%',
      y: 32 + ((i * 27 + tab.length * 5) % 40) + '%',
      c: fd.tone === 'body' || fd.tone === 'soft' ? SCENE : fd.tone,
      delay: (i * 1.2).toFixed(1) + 's',
    }))
  }, [D, tab])

  const isHome = tab === 'home'
  const voiceHot = isHome && voice !== 'idle'
  const hot = voiceHot || burst
  const focusPanel = focus ? D.panels.find(p => p.code === focus) : null
  const showTele = !isMobile && !isShort
  const showChips = !isShort && !(isMobile && !isHome)
  const voiceColor = { idle: a(ACC, '99'), listening: G, processing: Y, speaking: W }[voice]
  const voiceLabel = { idle: 'STANDBY', listening: 'LISTENING', processing: 'PROCESSING', speaking: 'RESPONDING' }[voice]
  const log = chatLog.slice(-3)

  const sceneAnim = warp
    ? 'holo-warpOut .5s cubic-bezier(.7,0,.9,.5) both'
    : warped
      ? 'holo-warpIn .65s cubic-bezier(.2,.8,.3,1) both, holo-flicker 13s linear infinite'
      : 'holo-flicker 13s linear infinite'

  const subProps = { onClose: () => setSub(null) }

  return (
    <div
      ref={rootRef}
      className={`holo-root ${scopeClass[tab]}`}
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: BG, ...(isHome ? { '--phx-accent': HOME_ACCENT } : {}) }}
    >
      <div key={fx} className="holo-layer" style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: `radial-gradient(ellipse 80% 64% at 50% 40%, ${RAISED} 0%, ${PANEL} 52%, ${BG} 100%)`, animation: sceneAnim }}>
        <HoloScene tab={tab} isMobile={isMobile} blips={blips} atmosphere={atmosphere} />
        {fx > 0 && !warped && <HoloDomainFlash />}
        <HoloEdgeChrome clock={clock} />
        <HoloBootLine bootLine={D.bootLine} />
        <HoloCore domain={D} hot={hot} dimmed={!!focusPanel} isShort={isShort} sparks={atmosphere.sparks} showChips={showChips} isHome={isHome} />
        {!isHome && !isMobile && <HoloBeams />}
        {!isHome && <HoloWings domain={D} isMobile={isMobile} showTele={showTele} onFocus={setFocus} />}

        {/* ── brief + actions / home composer ── */}
        <div style={{ position: 'absolute', left: '50%', bottom: isMobile && !isHome ? 'calc(126px + env(safe-area-inset-bottom))' : 'calc(70px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', width: isMobile ? 'calc(100vw - 24px)' : isShort ? 'min(400px, 40vw)' : 'min(560px, 46vw)', zIndex: 45, textAlign: 'center', animation: 'holo-inX .6s cubic-bezier(.2,.8,.4,1) .55s both' }}>
          {(isHome || (!isShort && !isMobile)) && (
            <p style={{ margin: '0 0 11px', fontFamily: FB, fontSize: '15.5px', fontWeight: 300, lineHeight: 1.5, color: mix(BODY, 90), textShadow: '0 1px 10px rgba(0,0,0,.8)' }}>
              {isHome && voiceMsg ? voiceMsg : D.heroBrief}
            </p>
          )}
          {!isHome && !isMobile && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {D.heroActions.map(act => {
                const approved = act.approved
                const primary = act.primary && !approved
                return (
                  <button key={act.label} onClick={() => setSub(act.sub)} style={{ minHeight: 42, padding: '0 20px', fontFamily: FM, fontSize: '9.5px', letterSpacing: '.2em', color: approved ? G : primary ? INK : a(ACC, 'cc'), background: primary ? `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})` : deep(50), border: `1px solid ${approved ? mix(G, 40) : primary ? ACC : a(ACC, '44')}`, cursor: 'pointer', textTransform: 'uppercase', boxShadow: primary ? `0 0 24px ${a(ACC, '55')}` : 'none' }}>
                    {act.label}
                  </button>
                )
              })}
            </div>
          )}
          {!isHome && isMobile && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 7, width: 'min(330px, 100%)', margin: '0 auto' }}>
              {D.heroActions.map(act => {
                const approved = act.approved
                const primary = act.primary && !approved
                return (
                  <button key={act.label} onClick={() => setSub(act.sub)} style={{ minHeight: primary ? 42 : 34, padding: '0 12px', fontFamily: FM, fontSize: primary ? 9 : 8, letterSpacing: primary ? '.18em' : '.15em', color: approved ? G : primary ? INK : a(ACC, 'cc'), background: primary ? `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})` : deep(58), border: `1px solid ${approved ? mix(G, 40) : primary ? ACC : a(ACC, '40')}`, cursor: 'pointer', textTransform: 'uppercase', boxShadow: primary ? `0 0 20px ${a(ACC, '44')}` : 'none', overflowWrap: 'anywhere' }}>
                    {act.label}
                  </button>
                )
              })}
            </div>
          )}
          {isHome && (
            <>
              {log.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, animation: 'holo-fadeIn .4s ease both' }}>
                  {log.map((m, i) => (
                    <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'baseline', justifyContent: 'center' }}>
                      <span style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.16em', color: m.w === 'you' ? a(SCENE, '99') : G, flexShrink: 0 }}>{m.w === 'you' ? 'YOU ▸' : 'PHX ▸'}</span>
                      <span style={{ fontFamily: FB, fontSize: '13.5px', fontWeight: 300, color: mix(BODY, 78), lineHeight: 1.35, textShadow: '0 1px 8px rgba(0,0,0,.8)' }}>{m.t}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 9, whiteSpace: 'nowrap' }}>
                <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: 99, background: voiceColor, boxShadow: `0 0 8px ${voiceColor}` }} />
                <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.22em', color: voiceColor }}>VOICE.LINK · {voiceLabel}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <input ref={composerRef} className="holo-composer" onKeyDown={e => { if (e.key === 'Enter') sendDirective() }} placeholder="TYPE A DIRECTIVE — 'OPEN FINANCE', 'STATUS REPORT'…" style={{ flex: 1, minWidth: 0, minHeight: 44, padding: '0 14px', fontFamily: FM, fontSize: 10, letterSpacing: '.1em', color: W, background: deep(66), border: `1px solid ${a(ACC, '30')}`, outline: 'none', backdropFilter: 'blur(8px)' }} />
                <button onClick={sendDirective} style={{ minHeight: 44, padding: '0 18px', fontFamily: FM, fontSize: '9.5px', letterSpacing: '.2em', color: INK, background: `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})`, border: `1px solid ${ACC}`, cursor: 'pointer', boxShadow: `0 0 22px ${a(ACC, '1f')}` }}>SEND</button>
                <button onPointerDown={micDown} onPointerUp={micUp} onPointerLeave={micUp} title="Hold to talk" style={{ minHeight: 44, minWidth: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: FM, fontSize: '9.5px', letterSpacing: '.14em', color: voiceColor, background: deep(60), border: `1px solid ${voiceColor}`, cursor: 'pointer', boxShadow: `0 0 16px ${a(ACC, '1f')}`, userSelect: 'none', touchAction: 'none' }}>◉ HOLD</button>
              </div>
            </>
          )}
        </div>

        {/* ── focus overlay ── */}
        {focusPanel && <HoloFocus panel={focusPanel} onClose={() => setFocus(null)} />}
      </div>

      {/* ── sub-screen projections ── */}
      {sub === 'finance-room' && (
        <FinanceControlRoom
          {...subProps}
          checks={appChecks}
          stamped={appStamped}
          onToggle={i => { if (!appStamped) setAppChecks(c => c.map((v, j) => (j === i ? !v : v))) }}
          onConfirm={() => { if (appChecks.every(Boolean) && !appStamped) setAppStamped(true) }}
          holdings={mapHoldings(live.holdings, live.finance)}
          finance={live.finance}
        />
      )}
      {sub === 'holdings' && <HoldingsSub {...subProps} sel={holdSel} onSel={setHoldSel} live={mapHoldings(live.holdings, live.finance)} />}
      {sub === 'approve' && (
        <ApproveSub
          {...subProps}
          checks={appChecks}
          stamped={appStamped}
          onToggle={i => { if (!appStamped) setAppChecks(c => c.map((v, j) => (j === i ? !v : v))) }}
          onConfirm={() => { if (appChecks.every(Boolean) && !appStamped) setAppStamped(true) }}
        />
      )}
      {sub === 'brief' && <BriefSub {...subProps} />}
      {sub === 'logmeal' && (
        <LogMealSub
          {...subProps}
          budget={budget}
          onLog={async m => {
            // real write first — the sub keeps its error state if this throws
            await apiLogMeal({
              item_id: 'holo_composed',
              item_type: 'holo_composed',
              name: 'Holo meal: ' + m.parts.join(', '),
              servings: 1,
              calories: m.k,
              protein_g: m.p,
              fat_g: m.f,
              carbs_g: m.c,
              source: 'holo_meal_composer',
            })
            setMealLog(s => s.concat([m]))
          }}
        />
      )}
      {sub === 'dinner' && (
        <DinnerSub {...subProps} sel={dinnerSel} locked={dinnerLocked} onPick={i => { setDinnerSel(i); setDinnerLocked(false) }} onLock={() => setDinnerLocked(true)} dinners={liveDinners} budget={budget} />
      )}
      {sub === 'planday' && <PlanDaySub {...subProps} />}
      {sub === 'session' && <SessionSub {...subProps} exercises={mapSessionExercises(live.training)} meta={live.training ? (live.training.today_session?.display_name || '').toUpperCase() : undefined} />}
      {sub === 'readiness' && <ReadinessSub {...subProps} />}
      {sub === 'sleep' && (
        <SleepSub
          {...subProps}
          min={slpMin}
          logged={slpLogged}
          onAdjust={d => { setSlpMin(m => Math.min(600, Math.max(240, m + d))); setSlpLogged(false) }}
          onLog={async () => {
            await logSleepDuration(slpMin)
            setSlpLogged(true)
          }}
        />
      )}
      {sub === 'today' && <TodaySub {...subProps} clock={clock} rail={mapTodayRail(live.calendar)} />}
      {sub === 'weekmap' && <WeekMapSub {...subProps} />}
      {sub === 'feeds' && <FeedsSub {...subProps} lanes={mapConnectorLanes(live.connectors)} />}

      <HoloDock tab={tab} onGo={go} accent={isHome ? HOME_ACCENT : ACC} />
    </div>
  )
}
