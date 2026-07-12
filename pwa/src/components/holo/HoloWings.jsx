import { ACC, W, TEXT, BODY, FM, FD, FB, a, mix, deep } from './holoTokens'
import { feedColor } from './holoDomains'

// panel content renderers, shared by wing panels and the focus overlay.
// `big` switches to the enlarged focus-modal type scale.
export function PanelBody({ panel, big }) {
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
        <div style={{ position: 'relative', overflow: 'hidden', border: `1px solid ${a(ACC, '30')}`, background: `linear-gradient(180deg, ${a(ACC, '14')}, ${deep(62)})`, backdropFilter: 'blur(6px)', boxShadow: `0 0 34px ${a(ACC, '1f')}, inset 0 0 26px ${a(ACC, '0a')}`, padding: '11px 13px 10px', clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)', animation: `${float} 7.5s ease-in-out infinite` }}>
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
