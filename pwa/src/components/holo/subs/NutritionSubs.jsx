import { useState } from 'react'
import { ACC, G, Y, R, W, BODY, INK, FM, FD, FB, a, mix, deep, pad2 } from '../holoTokens'
import { FOODS, DINNERS, FUEL_NODES, FUEL_CURVE } from '../holoDomains'
import SubShell, { SubLabel } from './SubShell'

// ── NUTRITION // MEAL COMPOSER — tap-to-add grid, live ring, ledger feedback ──
// `budget` comes from the real nutrition status (holoLive.mealBudget).
export function LogMealSub({ onClose, onLog, budget }) {
  const kcalOpen = Math.max(1, budget?.kcalOpen ?? 860)
  const proteinGap = Math.max(1, budget?.proteinGap ?? 53)
  const [adds, setAdds] = useState([])
  const cnt = {}
  adds.forEach(id => { cnt[id] = (cnt[id] || 0) + 1 })
  const mk = adds.reduce((acc, id) => acc + FOODS.find(f => f.id === id).k, 0)
  const mp = adds.reduce((acc, id) => acc + FOODS.find(f => f.id === id).p, 0)
  const empty = adds.length === 0
  const bars = [
    { l: 'KCAL VS OPEN', v: `${mk} / ${kcalOpen}`, w: Math.min(100, (mk / kcalOpen) * 100).toFixed(0) + '%', c: mk > kcalOpen ? R : G },
    { l: 'PROTEIN VS GAP', v: `${mp} / ${proteinGap}G`, w: Math.min(100, (mp / proteinGap) * 100).toFixed(0) + '%', c: W },
  ]
  return (
    <SubShell subKey="logmeal" onClose={onClose} meta={`${kcalOpen} KCAL OPEN`}>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <div style={{ flex: 1.4, minWidth: 300 }}>
          <SubLabel>COMPONENT LIBRARY — TAP TO ADD</SubLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 9 }}>
            {FOODS.map(f => (
              <button key={f.id} onClick={() => setAdds(s => s.concat(f.id))} style={{ position: 'relative', padding: '11px 12px', background: deep(55), border: `1px solid ${a(ACC, cnt[f.id] ? '77' : '2a')}`, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ display: 'block', fontFamily: FB, fontSize: 16, fontWeight: 400, color: 'var(--phx-text)', lineHeight: 1.15 }}>{f.n}</span>
                <span style={{ display: 'block', fontFamily: FM, fontSize: '7.5px', letterSpacing: '.1em', color: a(ACC, '99'), marginTop: 4 }}>{f.k} KCAL · {f.p}P</span>
                {!!cnt[f.id] && (
                  <span style={{ position: 'absolute', top: 5, right: 5, fontFamily: FM, fontSize: 8, color: INK, background: ACC, padding: '1px 6px', boxShadow: `0 0 8px ${a(ACC, '66')}` }}>×{cnt[f.id]}</span>
                )}
              </button>
            ))}
          </div>
          {!empty && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              {Object.keys(cnt).map(id => {
                const f = FOODS.find(x => x.id === id)
                return (
                  <button key={id} onClick={() => setAdds(s => { const next = s.slice(); next.splice(next.indexOf(id), 1); return next })} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: FM, fontSize: 8, letterSpacing: '.1em', color: ACC, background: a(ACC, '14'), border: `1px solid ${a(ACC, '44')}`, padding: '5px 9px', cursor: 'pointer' }}>
                    {f.n + (cnt[id] > 1 ? ' ×' + cnt[id] : '')}
                    <span style={{ color: R }}>✕</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 258, textAlign: 'center' }}>
          <svg viewBox="0 0 130 130" style={{ width: 140, height: 140, display: 'block', margin: '0 auto' }}>
            <circle cx="65" cy="65" r="56" fill="none" stroke={a(ACC, '1e')} strokeWidth="6" />
            <circle cx="65" cy="65" r="56" fill="none" stroke={ACC} strokeWidth="6" strokeLinecap="round" strokeDasharray="351.9" strokeDashoffset={(351.9 * (1 - Math.min(1, mk / kcalOpen))).toFixed(1)} transform="rotate(-90 65 65)" style={{ filter: `drop-shadow(0 0 7px ${ACC})`, transition: 'stroke-dashoffset .5s cubic-bezier(.3,.8,.3,1)' }} />
            <circle cx="65" cy="65" r="46" fill="none" stroke={a(ACC, '22')} strokeWidth="1" strokeDasharray="2 4" />
          </svg>
          <div style={{ marginTop: -92, marginBottom: 52 }}>
            <div style={{ fontFamily: FD, fontSize: 28, fontWeight: 700, color: W, textShadow: `0 0 14px ${a(ACC, '66')}` }}>{mk}</div>
            <div style={{ fontFamily: FM, fontSize: '6.5px', letterSpacing: '.26em', color: a(ACC, '99') }}>KCAL COMPOSED</div>
          </div>
          {bars.map((mb, i) => (
            <div key={i} style={{ padding: '5px 0 7px', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.14em', color: mix(BODY, 72) }}>{mb.l}</span>
                <span style={{ fontFamily: FD, fontSize: 16, fontWeight: 600, color: mb.c }}>{mb.v}</span>
              </div>
              <div style={{ height: 5, background: a(ACC, '14'), border: `1px solid ${a(ACC, '20')}`, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: mb.w, background: `linear-gradient(90deg, ${mix(mb.c, 53)}, ${mb.c})`, boxShadow: `0 0 8px ${mix(mb.c, 53)}`, transition: 'width .4s ease' }} />
              </div>
            </div>
          ))}
          <div style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.14em', color: mk > kcalOpen ? R : G, margin: '10px 0 12px' }}>
            {mk > kcalOpen ? `OVER TARGET BY ${mk - kcalOpen} KCAL` : `AFTER LOG → ${kcalOpen - mk} KCAL OPEN`}
          </div>
          <button onClick={() => { if (!empty) { onLog({ k: mk, p: mp }); onClose() } }} disabled={empty} style={{ minHeight: 46, width: '100%', fontFamily: FM, fontSize: 10, letterSpacing: '.24em', color: empty ? a(ACC, '77') : INK, background: empty ? deep(50) : `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})`, border: `1px solid ${empty ? a(ACC, '30') : ACC}`, cursor: empty ? 'not-allowed' : 'pointer', boxShadow: empty ? 'none' : `0 0 26px ${a(ACC, '55')}` }}>
            {empty ? 'ADD COMPONENTS TO LOG' : `CONFIRM LOG · ${mk} KCAL`}
          </button>
        </div>
      </div>
    </SubShell>
  )
}

// ── NUTRITION // DINNER CANDIDATES — 3 selectable cards + lock-in ──
// `dinners` (from holoLive.mapDinners) replaces the fixture candidates.
export function DinnerSub({ onClose, sel, locked, onPick, onLock, dinners, budget }) {
  const list = dinners || DINNERS
  const kcalOpen = Math.max(1, budget?.kcalOpen ?? 860)
  const proteinGap = Math.max(1, budget?.proteinGap ?? 53)
  const d = list[Math.min(sel, list.length - 1)]
  return (
    <SubShell subKey="dinner" onClose={onClose} meta={`PROTEIN GAP ${proteinGap}G`}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {list.map((dn, i) => {
          const isSel = i === sel
          return (
            <button key={i} onClick={() => onPick(i)} style={{ flex: 1, minWidth: 216, padding: '14px 15px', background: isSel ? `linear-gradient(180deg, ${a(ACC, '1c')}, ${deep(72)})` : `linear-gradient(180deg, ${a(ACC, '0a')}, ${deep(55)})`, border: `1px solid ${isSel ? ACC : a(ACC, '26')}`, cursor: 'pointer', textAlign: 'left', transform: isSel ? 'translateY(-4px)' : 'none', transition: 'transform .3s ease, border-color .3s ease', boxShadow: isSel ? `0 0 34px ${a(ACC, '33')}` : 'none' }}>
              <span style={{ display: 'block', fontFamily: FM, fontSize: '7.5px', letterSpacing: '.26em', color: dn.tc, marginBottom: 7 }}>▸ {dn.tag}</span>
              <span style={{ display: 'block', fontFamily: FB, fontSize: 21, fontWeight: 400, color: W, lineHeight: 1.15 }}>{dn.n}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '8px 0 10px' }}>
                <span style={{ fontFamily: FD, fontSize: 32, fontWeight: 700, color: W, textShadow: `0 0 12px ${a(ACC, '66')}` }}>{dn.k}</span>
                <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.14em', color: a(ACC, '99') }}>KCAL · {dn.p}G PROTEIN</span>
              </span>
              <span style={{ display: 'block', height: 5, background: a(ACC, '14'), border: `1px solid ${a(ACC, '20')}`, overflow: 'hidden', marginBottom: 4 }}>
                <span style={{ display: 'block', height: '100%', width: Math.min(100, (dn.p / proteinGap) * 100).toFixed(0) + '%', background: `linear-gradient(90deg, ${a(ACC, '88')}, ${ACC})`, boxShadow: `0 0 8px ${a(ACC, '66')}` }} />
              </span>
              <span style={{ display: 'block', fontFamily: FM, fontSize: 7, letterSpacing: '.12em', color: a(ACC, '99'), marginBottom: 9 }}>CLOSES {Math.min(100, Math.round((dn.p / proteinGap) * 100))}% OF PROTEIN GAP</span>
              <span style={{ display: 'block', fontFamily: FB, fontSize: '14.5px', fontWeight: 300, lineHeight: 1.45, color: mix(BODY, 78) }}>{dn.note}</span>
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 16, borderTop: `1px solid ${a(ACC, '1a')}`, paddingTop: 13 }}>
        <span style={{ fontFamily: FM, fontSize: '8.5px', letterSpacing: '.16em', color: a(ACC, '99') }}>
          AFTER DINNER → <span style={{ color: W }}>{Math.max(0, kcalOpen - d.k)} KCAL OPEN</span> · PROTEIN GAP <span style={{ color: W }}>{Math.max(0, proteinGap - d.p)}G</span>
        </span>
        <button onClick={onLock} style={{ minHeight: 44, padding: '0 26px', fontFamily: FM, fontSize: '9.5px', letterSpacing: '.22em', color: INK, background: locked ? `linear-gradient(135deg, ${G}, ${mix(G, 73)})` : `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})`, border: `1px solid ${locked ? G : ACC}`, cursor: 'pointer', boxShadow: `0 0 26px ${locked ? mix(G, 33) : a(ACC, '55')}` }}>
          {locked ? '✓ DINNER LOCKED · 19:30' : 'LOCK IN SELECTION'}
        </button>
      </div>
    </SubShell>
  )
}

// ── NUTRITION // FUEL TIMELINE — 06→24h rail + cumulative curve ──
export function PlanDaySub({ onClose }) {
  const ticks = [6, 9, 12, 15, 18, 21, 24].map(t => ({ left: (((t - 6) / 18) * 100).toFixed(1) + '%', label: pad2(t % 24) + ':00' }))
  const now = new Date()
  const nh = Math.min(24, Math.max(6, now.getHours() + now.getMinutes() / 60))
  const nowLeft = (((nh - 6) / 18) * 100).toFixed(1) + '%'
  const pts = FUEL_CURVE.map(p => (((p[0] - 6) / 18) * 640).toFixed(1) + ',' + (58 - (p[1] / 2100) * 50).toFixed(1)).join(' ')
  const legend = [
    { label: 'LOGGED', dot: { background: ACC } },
    { label: 'PROJECTED', dot: { border: `1px dashed ${ACC}` } },
    { label: 'OPTIONAL', dot: { border: `1px solid ${a(ACC, '44')}`, opacity: 0.5 } },
  ]
  return (
    <SubShell subKey="planday" onClose={onClose}>
      <div style={{ position: 'relative', height: 168, margin: '26px 6px 0' }}>
        {ticks.map((tk, i) => (
          <div key={i}>
            <div style={{ position: 'absolute', left: tk.left, top: 0, bottom: 0, width: 1, background: a(ACC, '12') }} />
            <div style={{ position: 'absolute', left: tk.left, bottom: -18, transform: 'translateX(-50%)', fontFamily: FM, fontSize: 7, letterSpacing: '.1em', color: a(ACC, '99') }}>{tk.label}</div>
          </div>
        ))}
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: `linear-gradient(90deg, ${a(ACC, '66')}, ${a(ACC, '22')})` }} />
        <div style={{ position: 'absolute', left: nowLeft, top: '6%', bottom: '6%', width: 1, background: G, boxShadow: `0 0 10px ${G}`, animation: 'holo-beamPulse 2.4s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', left: nowLeft, top: -4, transform: 'translateX(-50%)', fontFamily: FM, fontSize: '6.5px', letterSpacing: '.2em', color: G }}>NOW</div>
        {FUEL_NODES.map((nd, i) => {
          const left = (((nd.h - 6) / 18) * 100).toFixed(1) + '%'
          const op = nd.st === 'opt' ? 0.5 : 1
          return (
            <div key={i}>
              <div style={{ position: 'absolute', left, top: '50%', transform: 'translate(-50%,-50%)', zIndex: 2 }}>
                <i style={{ display: 'block', width: 13, height: 13, borderRadius: '50%', background: nd.st === 'log' ? ACC : 'transparent', border: nd.st === 'log' ? `1px solid ${ACC}` : nd.st === 'proj' ? `1px dashed ${ACC}` : `1px solid ${a(ACC, '55')}`, boxShadow: nd.st === 'log' ? `0 0 12px ${ACC}` : nd.st === 'proj' ? `0 0 8px ${a(ACC, '44')}` : 'none', opacity: op }} />
              </div>
              <div style={{ position: 'absolute', left, top: '50%', transform: 'translateX(-50%)', marginTop: nd.up ? -56 : 16, textAlign: 'center', whiteSpace: 'nowrap', opacity: op }}>
                <div style={{ fontFamily: FB, fontSize: '14.5px', fontWeight: 400, color: 'var(--phx-text)', lineHeight: 1.15 }}>{nd.n}</div>
                <div style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.1em', color: a(ACC, '99') }}>{nd.t} · {nd.k} KCAL</div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ margin: '30px 6px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
          <span style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.26em', color: a(ACC, '99') }}>CUMULATIVE FUEL CURVE</span>
          <span style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.14em', color: a(ACC, 'cc') }}>TARGET 2,100</span>
        </div>
        <svg viewBox="0 0 640 64" preserveAspectRatio="none" style={{ width: '100%', height: 76, display: 'block' }}>
          <line x1="0" y1="8" x2="640" y2="8" stroke={a(ACC, '44')} strokeWidth="1" strokeDasharray="5 5" />
          <polyline points={pts + ' 640,58 0,58'} fill={a(ACC, '14')} stroke="none" />
          <polyline points={pts} fill="none" stroke={ACC} strokeWidth="1.8" style={{ filter: `drop-shadow(0 0 4px ${ACC})` }} />
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
        {legend.map((lg, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FM, fontSize: '7.5px', letterSpacing: '.14em', color: a(ACC, '99') }}>
            <i style={{ width: 9, height: 9, borderRadius: '50%', ...lg.dot }} />
            {lg.label}
          </span>
        ))}
      </div>
    </SubShell>
  )
}
