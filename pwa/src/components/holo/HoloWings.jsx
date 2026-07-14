import { useState, useEffect } from 'react'
import { ACC, W, TEXT, BODY, FM, FD, FB, a, mix, deep } from './holoTokens'
import { feedColor } from './holoDomains'
import { financeMicro, financeBody } from './subs/financeReadability'

// panel content renderers, shared by wing panels and the focus overlay.
// `big` switches to the enlarged focus-modal type scale.
function AllocationOrbitPanel({ panel, big }) {
  // draw-in: segments sweep from zero to their arc on mount (staggered).
  // setTimeout (not rAF) so it still fires when the tab isn't focused —
  // otherwise the ring could stay invisible until focus.
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setDrawn(true), 40)
    return () => clearTimeout(id)
  }, [])
  const slices = (panel.slices || panel.allocationSlices || [])
  const activeSlices = slices.filter(s => Number(s.weight || 0) >= 0.5)
  const shown = (activeSlices.length ? activeSlices : slices.slice(0, 1)).slice(0, big ? 6 : 4)
  const dormantCount = panel.dormantCount ?? Math.max(0, slices.length - activeSlices.length)
  const gid = `holo-allocation-${big ? 'focus' : 'wing'}`
  // Real donut: arc length = share of the whole. The uncovered arc is the
  // honest remainder (dormant/uncharted sleeves) — nothing is faked by radius.
  const donutSize = big ? 150 : 128
  const CX = 66, CY = 66
  const R = 44
  const THICK = big ? 16 : 17
  const CIRC = 2 * Math.PI * R
  const totalW = slices.reduce((sum, s) => sum + Math.max(0, Number(s.weight || 0)), 0) || 100
  const GAP = 2.4 // px of circumference between segments
  let cursor = 0
  const segments = shown.map((s, i) => {
    const len = (Math.max(0, Number(s.weight || 0)) / totalW) * CIRC
    const seg = { color: s.color || ACC, len: Math.max(1.2, len - GAP), offset: -cursor, key: s.label || i }
    cursor += len
    return seg
  })
  return (
    <div style={{ display: big ? 'grid' : 'block', gridTemplateColumns: big ? `${donutSize}px 1fr` : '1fr', gap: big ? 16 : 8, alignItems: 'center', paddingTop: big ? 4 : 5 }}>
      <svg viewBox="0 0 132 132" style={{ width: big ? donutSize : '100%', maxWidth: big ? donutSize : 150, height: donutSize, display: 'block', margin: big ? 0 : '0 auto' }}>
        <defs>
          <radialGradient id={`${gid}-hub`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={a(ACC, '20')} />
            <stop offset="66%" stopColor={a(ACC, '08')} />
            <stop offset="100%" stopColor={a(ACC, '00')} />
          </radialGradient>
        </defs>
        {/* faint counter-rotating guide ring for depth + motion */}
        <circle cx={CX} cy={CY} r={R + THICK / 2 + 6} fill="none" stroke={a(ACC, '16')} strokeWidth="1" strokeDasharray="1.5 7" style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'holo-ringSpinRev 44s linear infinite' }} />
        {/* machined bezel hairlines for depth */}
        <circle cx={CX} cy={CY} r={R + THICK / 2} fill="none" stroke={a(ACC, '20')} strokeWidth="1" />
        <circle cx={CX} cy={CY} r={R - THICK / 2} fill="none" stroke={a(ACC, '20')} strokeWidth="1" />
        {/* full-circle track = the whole; uncovered arc reads as dormant remainder */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke={a(ACC, '10')} strokeWidth={THICK} />
        {segments.map((seg, i) => (
          <circle
            key={seg.key}
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth={THICK}
            strokeLinecap="butt"
            strokeDasharray={drawn ? `${seg.len.toFixed(2)} ${(CIRC - seg.len).toFixed(2)}` : `0 ${CIRC.toFixed(2)}`}
            strokeDashoffset={seg.offset.toFixed(2)}
            transform={`rotate(-90 ${CX} ${CY})`}
            style={{ transition: `stroke-dasharray .8s cubic-bezier(.2,.8,.25,1) ${(i * 0.1).toFixed(2)}s`, filter: `drop-shadow(0 0 ${big ? 6 : 4}px ${a(seg.color, '66')})` }}
          />
        ))}
        {/* premium sheen — a soft light sweep orbiting the ring */}
        <g style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'holo-ringSpin 7s linear infinite' }}>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke={a(W, '99')} strokeWidth={THICK * 0.86} strokeLinecap="round" strokeDasharray={`${(CIRC * 0.05).toFixed(1)} ${(CIRC * 0.95).toFixed(1)}`} style={{ filter: 'blur(3px)', mixBlendMode: 'screen' }} opacity={big ? 0.5 : 0.4} />
        </g>
        {/* hub */}
        <circle cx={CX} cy={CY} r={R - THICK / 2 - 1.5} fill={`url(#${gid}-hub)`} />
        <text x={CX} y={CY - (big ? 4 : 3)} textAnchor="middle" fontFamily={FM} fontSize={big ? 7.5 : 6.5} letterSpacing={big ? 2 : 1.4} fill={a(ACC, 'cc')}>TOTAL</text>
        <text x={CX} y={CY + (big ? 12 : 10)} textAnchor="middle" fontFamily={FD} fontSize={big ? 16.5 : 12.5} fontWeight="700" fill={W} style={{ filter: `drop-shadow(0 0 7px ${a(ACC, '66')})` }}>{panel.total || panel.meta}</text>
      </svg>
      <div style={{ display: 'grid', gap: big ? 9 : 5, ...(big ? {} : { marginTop: 8 }) }}>
        {shown.map(s => (
          <div key={s.label} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: big ? 10 : 7, alignItems: 'center', minWidth: 0 }}>
            <span style={{ width: big ? 9 : 6, height: big ? 9 : 6, borderRadius: 2, background: s.color || ACC, boxShadow: `0 0 8px ${a(s.color || ACC, '88')}` }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ ...financeMicro({ fontSize: big ? 11 : 8, letterSpacing: '.09em', color: mix(BODY, 92) }), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.short || s.label}</div>
              {big && <div style={financeMicro({ fontSize: 9, letterSpacing: '.06em', color: a(ACC, '9f'), marginTop: 2 })}><span style={{ color: a(s.statusColor || ACC, 'cc') }}>{s.status}</span> · GAP {s.gap}%</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: FD, fontSize: big ? 20 : 15, fontWeight: 700, color: s.color || ACC, lineHeight: 1 }}>{Number(s.weight || 0).toFixed(1)}%</div>
              {big && <div style={financeMicro({ fontSize: 9, letterSpacing: '.05em', color: a(W, '99'), marginTop: 2 })}>{s.value}</div>}
            </div>
          </div>
        ))}
        {big && dormantCount > 0 && (
          <div style={{ marginTop: 3, paddingTop: 9, borderTop: `1px solid ${a(ACC, '18')}`, ...financeMicro({ fontSize: 9, letterSpacing: '.08em', color: a(ACC, '88') }) }}>
            {dormantCount} SLEEVES BELOW 0.5% · NOT CHARTED
          </div>
        )}
      </div>
    </div>
  )
}

function ValueSeedPanel({ panel, big }) {
  const gid = `holo-seed-${big ? 'focus' : 'wing'}`
  const seedSize = big ? 84 : 58
  // One honest mark on a baseline: the recorded point at left, then a neutral
  // dashed line to the right where the next snapshot will land. No implied
  // direction (that would fabricate a trend) — just "the curve starts here".
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: big ? 12 : 8, padding: big ? '6px 0 5px' : '5px 0 2px' }}>
        <span style={{ fontFamily: FD, fontSize: big ? 42 : 33, fontWeight: 700, color: W, lineHeight: 1, textShadow: `0 0 ${big ? 18 : 14}px ${a(ACC, '66')}` }}>{panel.big}</span>
        <span style={financeMicro({ fontSize: big ? 10 : 9, letterSpacing: '.14em', color: a(ACC, 'cc'), textAlign: 'right' })}>FIRST MARK</span>
      </div>
      <svg viewBox="0 0 154 48" style={{ width: '100%', height: seedSize, display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id={`${gid}-core`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={W} />
            <stop offset="42%" stopColor={a(ACC, 'dd')} />
            <stop offset="100%" stopColor={a(ACC, '00')} />
          </radialGradient>
          <linearGradient id={`${gid}-proj`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={a(ACC, '66')} />
            <stop offset="100%" stopColor={a(ACC, '0a')} />
          </linearGradient>
        </defs>
        {/* faint gridlines for parity with the real curve */}
        {[14, 26, 38].map(y => <line key={y} x1="8" x2="146" y1={y} y2={y} stroke={a(ACC, '0c')} strokeWidth="1" />)}
        {/* recorded segment (solid) → projection to next snapshot (dashed, neutral) */}
        <line x1="20" x2="30" y1="26" y2="26" stroke={ACC} strokeWidth="2" strokeLinecap="round" />
        <line x1="30" x2="140" y1="26" y2="26" stroke={`url(#${gid}-proj)`} strokeWidth="1.4" strokeDasharray="2 6" />
        {/* the one recorded point */}
        <circle cx="24" cy="26" r={big ? 4.4 : 3.4} fill={`url(#${gid}-core)`} style={{ filter: `drop-shadow(0 0 9px ${ACC})`, animation: 'holo-corePulse 2.1s ease-in-out infinite' }} />
        {/* where snapshot 2 will land */}
        <circle cx="140" cy="26" r={big ? 3 : 2.4} fill="none" stroke={a(ACC, '55')} strokeWidth="1.2" strokeDasharray="2 2" />
        <text x="140" y={big ? 16 : 15} textAnchor="end" fontFamily={FM} fontSize={big ? 7.5 : 6.5} letterSpacing=".1em" fill={a(ACC, '77')}>NEXT</text>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, ...financeMicro({ fontSize: big ? 9 : 7.5, color: a(ACC, '99') }) }}>
        <span>{panel.sparkLabel || 'VALUE CURVE'}</span>
        <span>AWAITING 2ND SNAPSHOT</span>
      </div>
      {big && (
        <div style={{ marginTop: 11, padding: '10px 12px', border: `1px solid ${a(ACC, '20')}`, background: deep(62), ...financeBody({ fontSize: 13.5, lineHeight: 1.55, color: mix(BODY, 84) }) }}>
          The curve plots recorded portfolio snapshots. Record a buy you placed and apply it in{' '}
          <span style={{ color: ACC, fontFamily: FM, fontSize: 11, letterSpacing: '.08em' }}>BRIEF → LEDGER</span>{' '}
          to log the next snapshot and start the line.
        </div>
      )}
    </>
  )
}

function ValueGraphPanel({ panel, big }) {
  const gid = `holo-value-${big ? 'focus' : 'wing'}`
  const points = panel.points || '8,28 146,28'
  const area = panel.pointsArea || `${points} 146,48 8,48`
  const nodes = panel.nodes || []
  const last = nodes[nodes.length - 1] || { x: panel.lastX || 146, y: panel.lastY || 28 }
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: big ? 12 : 8, padding: big ? '6px 0 5px' : '5px 0 2px' }}>
        <span style={{ fontFamily: FD, fontSize: big ? 42 : 33, fontWeight: 700, color: W, lineHeight: 1, textShadow: `0 0 ${big ? 18 : 14}px ${a(ACC, '66')}` }}>{panel.big}</span>
        <span style={{ fontFamily: FM, fontSize: big ? 10 : 8, letterSpacing: '.1em', color: panel.deltaColor || ACC, textAlign: 'right' }}>{panel.delta}</span>
      </div>
      <svg viewBox="0 0 154 56" style={{ width: '100%', height: big ? 104 : 62, display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`${gid}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={a(ACC, '3f')} />
            <stop offset="72%" stopColor={a(ACC, '08')} />
            <stop offset="100%" stopColor={a(ACC, '00')} />
          </linearGradient>
          <radialGradient id={`${gid}-last`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={W} />
            <stop offset="100%" stopColor={ACC} />
          </radialGradient>
        </defs>
        {[12, 24, 36, 48].map(y => <line key={y} x1="6" x2="148" y1={y} y2={y} stroke={a(ACC, '12')} strokeWidth="1" />)}
        {[32, 76, 120].map(x => <line key={x} x1={x} x2={x} y1="8" y2="50" stroke={a(ACC, '0c')} strokeWidth="1" />)}
        <polyline points={area} fill={`url(#${gid}-fill)`} stroke="none" />
        <polyline
          points={points}
          fill="none"
          stroke={panel.deltaColor || ACC}
          strokeWidth={big ? 2.2 : 1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 ${big ? 8 : 5}px ${a(panel.deltaColor || ACC, '77')})` }}
        />
        {nodes.slice(Math.max(0, nodes.length - (big ? 7 : 4))).map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={big ? 2.2 : 1.8} fill={a(W, 'dd')} stroke={ACC} strokeWidth=".8" />
        ))}
        <circle cx={last.x} cy={last.y} r={big ? 4.2 : 3.1} fill={`url(#${gid}-last)`} style={{ filter: `drop-shadow(0 0 8px ${ACC})`, animation: panel.isSeed ? 'holo-corePulse 1.8s ease-in-out infinite' : 'none' }} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontFamily: FM, fontSize: big ? '8.5px' : '7.5px', letterSpacing: '.14em', color: a(ACC, '99') }}>
        <span>{panel.graphLabel || panel.sparkLabel}</span>
        <span>{panel.isSeed ? 'NO TREND YET' : panel.meta}</span>
      </div>
    </>
  )
}

export function PanelBody({ panel, big }) {
  if (panel.type === 'allocationOrbit') return <AllocationOrbitPanel panel={panel} big={big} />
  if (panel.type === 'valueGraph' && panel.isSeed) return <ValueSeedPanel panel={panel} big={big} />
  if (panel.type === 'valueGraph') return <ValueGraphPanel panel={panel} big={big} />
  if (panel.type === 'rows') {
    return panel.rows.map((row, i) => (
      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: big ? 12 : 10, padding: big ? '9px 0' : '6px 0', borderBottom: `1px solid ${a(ACC, big ? '14' : '10')}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FB, fontSize: big ? 19 : 16, fontWeight: 400, color: TEXT, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.title}</div>
          <div style={{ fontFamily: FM, fontSize: big ? '8.5px' : '7.5px', letterSpacing: big ? '.1em' : '.08em', color: a(ACC, '99'), marginTop: big ? 2 : 1 }}>{row.sub}</div>
        </div>
        <div style={{ fontFamily: FD, fontSize: big ? 26 : 21, fontWeight: 600, color: row.valueColor, whiteSpace: 'nowrap', textShadow: `0 0 ${big ? 12 : 10}px ${a(ACC, '1f')}` }}>{row.value}</div>
      </div>
    ))
  }
  if (panel.type === 'bars') {
    return panel.bars.map((bar, i) => (
      <div key={i} style={{ padding: big ? '8px 0 9px' : '5px 0 6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: big ? 5 : 4 }}>
          <span style={{ fontFamily: FM, fontSize: big ? 9 : 8, letterSpacing: '.14em', color: mix(BODY, 72) }}>{bar.label}</span>
          <span style={{ fontFamily: FD, fontSize: big ? 22 : 18, fontWeight: 600, color: bar.color }}>{bar.val}</span>
        </div>
        <div style={{ height: big ? 6 : 4, background: a(ACC, '14'), border: `1px solid ${a(ACC, '20')}`, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: bar.w, background: `linear-gradient(90deg, ${mix(bar.color, 53)}, ${bar.color})`, boxShadow: `0 0 ${big ? 10 : 8}px ${mix(bar.color, 53)}` }} />
        </div>
      </div>
    ))
  }
  // spark
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: big ? 10 : 8, padding: big ? '5px 0 3px' : '4px 0 2px' }}>
        <span style={{ fontFamily: FD, fontSize: big ? 44 : 36, fontWeight: 700, color: W, textShadow: `0 0 ${big ? 16 : 14}px ${a(ACC, '66')}` }}>{panel.big}</span>
        <span style={{ fontFamily: FM, fontSize: big ? 11 : 9, letterSpacing: '.1em', color: panel.deltaColor }}>{panel.delta}</span>
      </div>
      <svg viewBox="0 0 130 38" style={{ width: '100%', height: big ? 64 : 44, display: 'block' }}>
        <polyline points={panel.points} fill="none" stroke={ACC} strokeWidth="1.6" style={{ filter: `drop-shadow(0 0 4px ${ACC})` }} />
        <polyline points={panel.pointsArea} fill={a(ACC, '18')} stroke="none" />
        <circle cx={panel.lastX} cy={panel.lastY} r="2.4" fill={W} style={{ filter: `drop-shadow(0 0 5px ${ACC})` }} />
      </svg>
      <div style={{ fontFamily: FM, fontSize: big ? '8.5px' : '7.5px', letterSpacing: '.16em', color: a(ACC, '99') }}>{panel.sparkLabel}</div>
    </>
  )
}

// one clip-cornered glass wing panel
function WingPanel({ panel, tilt, float, delay, mobile, onFocus }) {
  return (
    <section style={{ minWidth: mobile ? 'min(74vw, 300px)' : 'auto', scrollSnapAlign: mobile ? 'center' : 'none', animation: 'holo-in .6s cubic-bezier(.2,.8,.4,1) both', animationDelay: delay }}>
      <div className="holo-wing-tilt" style={{ '--tilt': tilt }} onClick={onFocus}>
        <div style={{ position: 'relative', overflow: 'hidden', textRendering: 'geometricPrecision', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', border: `1px solid ${a(ACC, '30')}`, background: `linear-gradient(180deg, ${a(ACC, '14')}, ${deep(62)})`, backdropFilter: 'blur(6px)', boxShadow: `0 0 34px ${a(ACC, '1f')}, inset 0 0 26px ${a(ACC, '0a')}`, padding: '11px 13px 10px', clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)', animation: `${float} 7.5s ease-in-out infinite` }}>
          <div style={{ position: 'absolute', left: 0, right: 0, height: '26%', background: `linear-gradient(180deg, transparent, ${a(ACC, '12')}, transparent)`, animation: 'holo-panelSweep 5.5s linear infinite', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 3, right: 3, width: 17, height: 1, background: ACC, transform: 'rotate(-45deg)', transformOrigin: '100% 0' }} />
          <div style={{ position: 'absolute', top: -1, left: -1, width: 9, height: 9, borderTop: `1px solid ${ACC}`, borderLeft: `1px solid ${ACC}` }} />
          <div style={{ position: 'absolute', bottom: -1, left: -1, width: 9, height: 9, borderBottom: `1px solid ${ACC}`, borderLeft: `1px solid ${ACC}` }} />
          <div style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderBottom: `1px solid ${ACC}`, borderRight: `1px solid ${ACC}` }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingRight: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FM, fontSize: '8.5px', letterSpacing: '.26em', color: ACC, textShadow: `0 0 9px ${a(ACC, '66')}` }}>
              <i style={{ width: 4, height: 4, background: 'currentColor', boxShadow: '0 0 6px currentColor' }} />
              {panel.code}
            </span>
            <span style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.12em', color: a(ACC, '99') }}>{panel.meta}</span>
          </div>
          <div style={{ height: 1, background: `linear-gradient(90deg, ${a(ACC, '77')}, transparent)`, marginBottom: 4 }} />
          <PanelBody panel={panel} />
        </div>
      </div>
    </section>
  )
}

function Readout({ list }) {
  return (
    <div style={{ width: '100%', maxWidth: 176, animation: 'holo-in .5s cubic-bezier(.2,.8,.4,1) .42s both' }}>
      <div style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.3em', color: a(ACC, 'cc'), marginBottom: 8, textShadow: `0 0 8px ${a(ACC, '66')}` }}>SYS.READOUT</div>
      {list.map((ro, i) => (
        <div key={i} style={{ marginBottom: 7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FM, fontSize: '7.5px', letterSpacing: '.1em', color: mix(BODY, 55), marginBottom: 2 }}>
            <span>{ro.k}</span><span style={{ color: TEXT }}>{ro.v}</span>
          </div>
          <div style={{ height: 2, background: a(ACC, '1a') }}>
            <div style={{ height: '100%', width: ro.w, background: ACC, boxShadow: `0 0 5px ${ACC}` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function Feed({ list }) {
  return (
    <div style={{ width: '100%', maxWidth: 196, alignSelf: 'flex-end', animation: 'holo-in .5s cubic-bezier(.2,.8,.4,1) .48s both' }}>
      <div style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.3em', color: a(ACC, 'cc'), marginBottom: 8, textAlign: 'right', textShadow: `0 0 8px ${a(ACC, '66')}` }}>EVENT.FEED</div>
      {list.map((fd, i) => (
        <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'baseline', justifyContent: 'flex-end', padding: '3.5px 0', borderBottom: `1px solid ${a(ACC, '12')}` }}>
          <span style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.06em', color: feedColor(fd.tone), textAlign: 'right' }}>{fd.msg}</span>
          <span style={{ fontFamily: FM, fontSize: 7, color: a(ACC, '99'), flexShrink: 0 }}>{fd.t}</span>
        </div>
      ))}
    </div>
  )
}

// wing columns (desktop) or bottom snap rail (mobile)
export default function HoloWings({ domain, isMobile, showTele, onFocus }) {
  if (isMobile) {
    return (
      <div data-plx="0.06" className="holo-rail" style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(62px + env(safe-area-inset-bottom))', zIndex: 40, display: 'flex', flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'stretch', gap: 14, pointerEvents: 'auto', overflowX: 'auto', scrollSnapType: 'x mandatory', padding: '0 13vw 4px' }}>
        {domain.panels.map((p, i) => (
          <WingPanel key={p.code} panel={p} tilt="0deg" float={i % 2 ? 'holo-floatB' : 'holo-floatA'} delay={(0.18 + i * 0.08).toFixed(2) + 's'} mobile onFocus={() => onFocus(p.code)} />
        ))}
      </div>
    )
  }
  const width = 'min(23vw, 290px)'
  const col = side => ({ position: 'absolute', top: '10%', bottom: '15%', width, zIndex: 40, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'stretch', gap: 14, pointerEvents: 'none', ...(side === 'left' ? { left: '3.2%' } : { right: '3.2%' }) })
  return (
    <>
      <div data-plx="0.06" style={col('left')}>
        <WingPanel panel={domain.panels[0]} tilt="16deg" float="holo-floatA" delay="0.18s" onFocus={() => onFocus(domain.panels[0].code)} />
        {showTele && <Readout list={domain.readout} />}
        <WingPanel panel={domain.panels[1]} tilt="13deg" float="holo-floatB" delay="0.30s" onFocus={() => onFocus(domain.panels[1].code)} />
      </div>
      <div data-plx="0.06" style={col('right')}>
        <WingPanel panel={domain.panels[2]} tilt="-16deg" float="holo-floatB" delay="0.24s" onFocus={() => onFocus(domain.panels[2].code)} />
        {showTele && <Feed list={domain.feed} />}
        <WingPanel panel={domain.panels[3]} tilt="-13deg" float="holo-floatA" delay="0.36s" onFocus={() => onFocus(domain.panels[3].code)} />
      </div>
    </>
  )
}
