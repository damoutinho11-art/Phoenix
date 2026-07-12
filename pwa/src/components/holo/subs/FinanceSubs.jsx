import { useEffect, useRef, useState } from 'react'
import { ACC, G, Y, R, W, BODY, INK, FM, FD, FB, a, mix, deep } from '../holoTokens'
import { HOLDINGS, HOLDING_ANGLES, HOLDING_RADII, APPROVE_CHECKS, BRIEF_TEXT } from '../holoDomains'
import SubShell, { SubLabel } from './SubShell'

const dirColor = h => (h.dir === 'TRIM' ? R : h.dir === 'FEED' ? Y : ACC)

// ── FINANCE // HOLDINGS MAP — 3D orbital plane of sleeve spheres ──
// `live` (from holoLive.mapHoldings) replaces the fixture sleeve list.
export function HoldingsSub({ onClose, sel, onSel, live }) {
  const list = live?.list || HOLDINGS
  const coreLabel = live?.coreLabel || 'CORE · €1,893'
  // fixture weights top out ~42% (0–50 axis); live weights can reach 100%
  const scaleMax = live ? 100 : 50
  const mul = 100 / scaleMax
  const h = list[Math.min(sel, list.length - 1)] || list[0]
  const c = dirColor(h)
  const drift = h.w > h.hi
    ? `+${(h.w - h.hi).toFixed(1)}% OVER BAND`
    : h.w < h.lo
      ? `−${(h.lo - h.w).toFixed(1)}% UNDER BAND`
      : 'WITHIN BAND'
  return (
    <SubShell subKey="holdings" onClose={onClose} meta={live?.meta}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1.3, minWidth: 280, width: '100%', maxWidth: 'min(470px, max(320px, calc(100vh - 250px)))', aspectRatio: '1', margin: '0 auto' }}>
          {/* tilted orbit plane */}
          <div style={{ position: 'absolute', left: '50%', top: '55%', width: '88%', aspectRatio: '1', transform: 'translate(-50%,-50%) scaleY(.42)' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px dashed ${a(ACC, '30')}` }} />
            <div style={{ position: 'absolute', inset: 0, animation: 'holo-ringSpin 22s linear infinite' }}>
              <i style={{ position: 'absolute', left: '50%', top: 0, width: 5, height: 5, margin: -2.5, borderRadius: '50%', background: W, transform: 'scaleY(2.38)', boxShadow: `0 0 10px ${ACC}, 0 0 20px ${ACC}` }} />
            </div>
          </div>
          <div style={{ position: 'absolute', left: '50%', top: '55%', width: '58%', aspectRatio: '1', transform: 'translate(-50%,-50%) scaleY(.42)' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px solid ${a(ACC, '2a')}`, boxShadow: `inset 0 0 34px ${a(ACC, '12')}` }} />
            <div style={{ position: 'absolute', inset: 0, animation: 'holo-ringSpinRev 30s linear infinite' }}>
              <i style={{ position: 'absolute', left: '50%', top: 0, width: 4, height: 4, margin: -2, borderRadius: '50%', background: G, transform: 'scaleY(2.38)', boxShadow: `0 0 9px ${G}` }} />
            </div>
          </div>
          <div style={{ position: 'absolute', left: '50%', top: '55%', width: '26%', aspectRatio: '1', transform: 'translate(-50%,-50%) scaleY(.42)', borderRadius: '50%', border: `1px dashed ${a(ACC, '1c')}` }} />
          {/* floor glow */}
          <div style={{ position: 'absolute', left: '50%', top: '57%', transform: 'translate(-50%,-50%)', width: '76%', height: '32%', background: `radial-gradient(ellipse, ${a(ACC, '1c')} 0%, transparent 66%)`, filter: 'blur(12px)', pointerEvents: 'none' }} />
          {/* emitter beam: plane → sun */}
          <div style={{ position: 'absolute', left: '50%', top: '32%', transform: 'translateX(-50%)', width: 2, height: '23%', background: `linear-gradient(180deg, ${a(ACC, '88')}, transparent)`, filter: 'blur(.5px)', animation: 'holo-beamPulse 4.5s ease-in-out infinite', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: '50%', top: '55%', transform: 'translate(-50%,-50%)', width: '12%', height: '5%', borderRadius: '50%', border: `1px solid ${a(ACC, '55')}`, boxShadow: `0 0 16px ${a(ACC, '1f')}`, animation: 'holo-padRipple 3.4s ease-out infinite', pointerEvents: 'none' }} />
          {/* portfolio-core sun */}
          <div style={{ position: 'absolute', left: '50%', top: '29%', transform: 'translate(-50%,-50%)', textAlign: 'center', zIndex: 11, pointerEvents: 'none' }}>
            <div style={{ animation: 'holo-floatA 7s ease-in-out infinite' }}>
              <span style={{ position: 'relative', display: 'block', width: 54, height: 54, margin: '0 auto 8px' }}>
                <i style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, white 0%, ${mix('white', 85)} 20%, ${ACC} 54%, color-mix(in srgb, ${ACC} 32%, var(--phx-bg)) 86%)`, boxShadow: `0 0 34px ${a(ACC, '66')}, 0 0 90px ${a(ACC, '1f')}, inset -8px -9px 14px ${deep(62)}, inset 3px 4px 8px ${mix('white', 30)}`, animation: 'holo-corePulse 4.2s ease-in-out infinite' }} />
                <i style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `repeating-linear-gradient(172deg, transparent 0 4px, ${mix('white', 6)} 4px 5px)`, mixBlendMode: 'screen' }} />
                <i style={{ position: 'absolute', inset: '-30% -22%', borderRadius: '50%', border: `1px dashed ${a(ACC, '4d')}`, transform: 'rotate(-16deg) scaleY(.4)', animation: 'holo-ringSpin 18s linear infinite' }} />
              </span>
              <div style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.26em', color: a(ACC, '99') }}>{coreLabel}</div>
            </div>
          </div>
          {/* sleeve spheres */}
          {list.map((hd, i) => {
            const ang = (HOLDING_ANGLES[i] * Math.PI) / 180
            const r = HOLDING_RADII[i]
            const col = dirColor(hd)
            const isSel = i === sel
            const depth = (Math.sin(ang) + 1) / 2
            const size = Math.round(13 + hd.w * 0.62)
            return (
              <button key={hd.name} onClick={() => onSel(i)} style={{ position: 'absolute', left: (50 + Math.cos(ang) * r).toFixed(1) + '%', top: (55 + Math.sin(ang) * r * 0.42).toFixed(1) + '%', transform: `translate(-50%,-50%) scale(${(0.72 + 0.55 * depth).toFixed(2)})`, opacity: (0.55 + 0.45 * depth).toFixed(2), background: 'none', border: 'none', cursor: 'pointer', textAlign: 'center', padding: 6, zIndex: 10 + Math.round(depth * 10) }}>
                <span style={{ display: 'block', animation: `${i % 2 ? 'holo-floatB' : 'holo-floatA'} 8s ease-in-out infinite` }}>
                  <span style={{ position: 'relative', display: 'block', margin: '0 auto', width: size, height: size }}>
                    <i style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle at 32% 28%, white 0%, ${W} 9%, ${col} 38%, color-mix(in srgb, ${col} 46%, var(--phx-bg)) 74%, ${mix('black', 96)} 100%)`, border: isSel ? `1px solid ${W}` : '1px solid transparent', boxShadow: `${isSel ? `0 0 0 4px ${mix(col, 20)}, 0 0 24px ${col}` : `0 0 14px ${mix(col, 40)}`}, inset -5px -6px 10px ${deep(70)}, inset 2px 3px 6px ${mix('white', 25)}` }} />
                    <i style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `repeating-linear-gradient(168deg, transparent 0 3px, ${mix('white', 8)} 3px 4px)`, mixBlendMode: 'screen' }} />
                    <i style={{ position: 'absolute', inset: '8% 12% auto auto', width: '26%', height: '16%', borderRadius: '50%', background: mix('white', 55), filter: 'blur(1.5px)', transform: 'rotate(24deg)' }} />
                    {isSel && <i style={{ position: 'absolute', inset: '-28% -20%', borderRadius: '50%', border: `1px solid ${mix(col, 40)}`, transform: 'rotate(-18deg) scaleY(.42)' }} />}
                  </span>
                  <i style={{ display: 'block', margin: '4px auto 5px', width: 22, height: 6, borderRadius: '50%', border: `1px solid ${mix(col, 27)}`, background: `radial-gradient(ellipse, ${mix(col, 15)} 0%, transparent 70%)` }} />
                  <span style={{ display: 'block', fontFamily: FM, fontSize: '7.5px', letterSpacing: '.14em', color: isSel ? W : a(ACC, '99'), whiteSpace: 'nowrap' }}>{hd.name}</span>
                  <span style={{ display: 'block', fontFamily: FD, fontSize: 15, fontWeight: 600, color: W }}>{hd.w.toFixed(1)}%</span>
                </span>
              </button>
            )
          })}
        </div>
        {/* detail card */}
        <div style={{ flex: 1, minWidth: 264 }}>
          <div style={{ fontFamily: FB, fontSize: 27, fontWeight: 400, color: W, lineHeight: 1.1 }}>
            {h.name.charAt(0) + h.name.slice(1).toLowerCase() + ' sleeve'}
          </div>
          <div style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.18em', color: a(ACC, '99'), margin: '3px 0 12px' }}>{h.tk}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontFamily: FD, fontSize: 38, fontWeight: 700, color: W, textShadow: `0 0 16px ${a(ACC, '66')}` }}>{h.v}</span>
            <span style={{ fontFamily: FM, fontSize: 10, letterSpacing: '.1em', color: c }}>{drift}</span>
          </div>
          <div style={{ position: 'relative', height: 12, background: a(ACC, '12'), border: `1px solid ${a(ACC, '22')}`, margin: '14px 0 4px', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: Math.min(100, h.lo * mul) + '%', width: Math.max(1, (h.hi - h.lo) * mul) + '%', background: mix(G, 8), borderLeft: `1px dashed ${mix(G, 33)}`, borderRight: `1px dashed ${mix(G, 33)}` }} />
            <div style={{ position: 'absolute', top: -2, bottom: -2, left: `calc(${Math.min(100, h.w * mul)}% - 1px)`, width: 3, background: c, boxShadow: `0 0 10px ${c}` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FM, fontSize: 7, letterSpacing: '.12em', color: a(ACC, '99'), marginBottom: 12 }}>
            <span>0%</span><span>{live ? `TARGET ${h.target.toFixed(1)}%` : `TARGET BAND ${h.lo}–${h.hi}%`}</span><span>{scaleMax}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${a(ACC, '14')}` }}>
            <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.18em', color: a(ACC, '99') }}>CURRENT WEIGHT</span>
            <span style={{ fontFamily: FD, fontSize: 18, fontWeight: 600, color: W }}>{h.w.toFixed(1)}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${a(ACC, '14')}`, borderBottom: `1px solid ${a(ACC, '14')}` }}>
            <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.18em', color: a(ACC, '99') }}>DIRECTIVE</span>
            <span style={{ fontFamily: FM, fontSize: 10, letterSpacing: '.2em', color: c, border: `1px solid ${mix(c, 33)}`, padding: '4px 12px', textShadow: `0 0 8px ${c}` }}>{h.dir}</span>
          </div>
          <p style={{ margin: '12px 0 0', fontFamily: FB, fontSize: '15.5px', fontWeight: 300, lineHeight: 1.5, color: mix(BODY, 84) }}>{h.note}</p>
        </div>
      </div>
    </SubShell>
  )
}

// ── FINANCE // W28 APPROVAL — tap-to-verify checklist + arm sequence ──
export function ApproveSub({ onClose, checks, onToggle, stamped, onConfirm }) {
  const n = stamped ? 4 : checks.filter(Boolean).length
  const armed = n === 4
  return (
    <SubShell subKey="approve" onClose={onClose}>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <div style={{ flex: 1.25, minWidth: 300 }}>
          <SubLabel>PRE-FLIGHT CHECKS — TAP TO VERIFY</SubLabel>
          {APPROVE_CHECKS.map((ck, i) => {
            const on = stamped || checks[i]
            return (
              <button key={i} onClick={() => onToggle(i)} style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', padding: '11px 13px', marginBottom: 9, background: deep(55), border: `1px solid ${on ? mix(G, 27) : a(ACC, '2a')}`, cursor: 'pointer', textAlign: 'left' }}>
                <i style={{ flexShrink: 0, width: 17, height: 17, border: `1px solid ${a(ACC, '66')}`, background: on ? G : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: FM, fontSize: 11, color: INK, fontStyle: 'normal' }}>{on ? '✓' : ''}</i>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: FB, fontSize: 17, fontWeight: 400, color: 'var(--phx-text)', lineHeight: 1.2 }}>{ck.t}</span>
                  <span style={{ display: 'block', fontFamily: FM, fontSize: '7.5px', letterSpacing: '.1em', color: a(ACC, '99'), marginTop: 2 }}>{ck.s}</span>
                </span>
                <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.16em', color: on ? G : Y }}>{on ? 'VERIFIED' : 'PENDING'}</span>
              </button>
            )
          })}
        </div>
        <div style={{ flex: 1, minWidth: 260, position: 'relative', textAlign: 'center', paddingTop: 4 }}>
          <svg viewBox="0 0 120 120" style={{ width: 126, height: 126, display: 'block', margin: '0 auto' }}>
            <circle cx="60" cy="60" r="52" fill="none" stroke={a(ACC, '1e')} strokeWidth="5" />
            <circle cx="60" cy="60" r="52" fill="none" stroke={ACC} strokeWidth="5" strokeLinecap="round" strokeDasharray="326.7" strokeDashoffset={(326.7 * (1 - n / 4)).toFixed(1)} transform="rotate(-90 60 60)" style={{ filter: `drop-shadow(0 0 6px ${ACC})`, transition: 'stroke-dashoffset .5s cubic-bezier(.3,.8,.3,1)' }} />
            <circle cx="60" cy="60" r="43" fill="none" stroke={a(ACC, '22')} strokeWidth="1" strokeDasharray="2 4" />
          </svg>
          <div style={{ marginTop: -82, marginBottom: 44 }}>
            <div style={{ fontFamily: FD, fontSize: 26, fontWeight: 700, color: W }}>{n} / 4</div>
            <div style={{ fontFamily: FM, fontSize: '6.5px', letterSpacing: '.26em', color: a(ACC, '99') }}>VERIFIED</div>
          </div>
          <SubLabel style={{ marginBottom: 9 }}>ARM SEQUENCE</SubLabel>
          <button onClick={onConfirm} disabled={!armed || stamped} style={{ minHeight: 48, width: '100%', fontFamily: FM, fontSize: 10, letterSpacing: '.24em', color: stamped || armed ? INK : a(ACC, '77'), background: stamped ? `linear-gradient(135deg, ${G}, ${mix(G, 73)})` : armed ? `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})` : deep(50), border: `1px solid ${stamped ? G : armed ? ACC : a(ACC, '30')}`, cursor: armed && !stamped ? 'pointer' : 'not-allowed', boxShadow: stamped ? `0 0 26px ${mix(G, 33)}` : armed ? `0 0 26px ${a(ACC, '55')}` : 'none', clipPath: 'polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%)' }}>
            {stamped ? '✓ W28 APPROVED' : armed ? 'MARK WEEK APPROVED' : `AWAITING CHECKS · ${n}/4`}
          </button>
          <p style={{ margin: '12px 0 0', fontFamily: FM, fontSize: '7.5px', letterSpacing: '.1em', lineHeight: 1.7, color: a(ACC, '99') }}>
            PHOENIX NEVER EXECUTES ORDERS.<br />YOU PLACE THE €85.00 VWCE BUY MANUALLY ON LIGHTYEAR.
          </p>
          {stamped && (
            <div style={{ position: 'absolute', left: '50%', top: '34%', transform: 'translate(-50%,-50%) rotate(-8deg)', border: `2px solid ${G}`, color: G, padding: '8px 18px', fontFamily: FM, fontSize: 17, letterSpacing: '.3em', textShadow: `0 0 14px ${mix(G, 53)}`, boxShadow: `0 0 30px ${mix(G, 20)}, inset 0 0 20px ${mix(G, 8)}`, background: deep(72), animation: 'holo-stampIn .5s cubic-bezier(.2,.8,.3,1) both', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              W28 · APPROVED
            </div>
          )}
        </div>
      </div>
    </SubShell>
  )
}

// ── FINANCE // WEEKLY BRIEF — typewriter terminal ──
export function BriefSub({ onClose }) {
  const [n, setN] = useState(0)
  const ivRef = useRef(null)
  const start = () => {
    clearInterval(ivRef.current)
    setN(0)
    ivRef.current = setInterval(() => {
      setN(prev => {
        const next = Math.min(BRIEF_TEXT.length, prev + 3)
        if (next >= BRIEF_TEXT.length) clearInterval(ivRef.current)
        return next
      })
    }, 22)
  }
  useEffect(() => {
    start()
    return () => clearInterval(ivRef.current)
  }, [])
  const done = n >= BRIEF_TEXT.length
  return (
    <SubShell subKey="brief" onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.2em', color: a(ACC, '99') }}>TRANSMISSION {Math.round((n / BRIEF_TEXT.length) * 100)}%</span>
        <button onClick={start} style={{ minHeight: 30, padding: '0 14px', fontFamily: FM, fontSize: 8, letterSpacing: '.2em', color: a(ACC, 'cc'), background: deep(50), border: `1px solid ${a(ACC, '44')}`, cursor: 'pointer' }}>↺ REPLAY</button>
      </div>
      <div style={{ background: deep(82), border: `1px solid ${a(ACC, '22')}`, padding: '18px 20px', minHeight: 320, fontFamily: FM, fontSize: '12.5px', lineHeight: 1.85, letterSpacing: '.04em', color: mix(BODY, 96), whiteSpace: 'pre-wrap', boxShadow: `inset 0 0 40px ${a(ACC, '08')}` }}>
        {BRIEF_TEXT.slice(0, n)}
        <span style={{ display: 'inline-block', width: 7, height: 14, background: ACC, boxShadow: `0 0 8px ${ACC}`, verticalAlign: -2, animation: 'holo-cursorBlink 1.1s ease-in-out infinite' }} />
      </div>
      {done && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginTop: 12, animation: 'holo-fadeIn .5s ease both' }}>
          <span style={{ width: 40, height: 1, background: `linear-gradient(90deg, transparent, ${a(ACC, '88')})` }} />
          <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.3em', color: a(ACC, 'cc') }}>END OF BRIEF · W28</span>
          <span style={{ width: 40, height: 1, background: `linear-gradient(90deg, ${a(ACC, '88')}, transparent)` }} />
        </div>
      )}
    </SubShell>
  )
}
