import { useMemo } from 'react'
import { ACC, SCENE, G, RAISED, PANEL, BG, FM, mix, a } from './holoTokens'

// deterministic per-tab particle field (same seeding as the reference)
function useAtmosphere(tab, isMobile, density = 140) {
  return useMemo(() => {
    let seed = 11 + tab.length * 3
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    const particles = []
    for (let i = 0; i < density; i++) {
      const green = rnd() > 0.8
      particles.push({
        x: (rnd() * 96 + 2).toFixed(1) + '%',
        y: (rnd() * 86 + 4).toFixed(1) + '%',
        s: (rnd() > 0.72 ? 3 : 2) + 'px',
        c: green ? G : SCENE,
        dur: (2.1 + rnd() * 3.6).toFixed(1) + 's',
        delay: (rnd() * 3.2).toFixed(1) + 's',
      })
    }
    const risers = []
    for (let i = 0; i < (isMobile ? 6 : 12); i++) {
      risers.push({
        x: (18 + rnd() * 64).toFixed(1) + '%',
        h: (14 + rnd() * 26).toFixed(0) + 'px',
        dur: (5 + rnd() * 6).toFixed(1) + 's',
        delay: (rnd() * 7).toFixed(1) + 's',
      })
    }
    const bokeh = []
    for (let i = 0; i < (isMobile ? 0 : 6); i++) {
      let bx = rnd() * 92 + 4, by = rnd() * 80 + 8, tries = 0
      while (tries < 9 && bx > 30 && bx < 70 && by > 22 && by < 66) { bx = rnd() * 92 + 4; by = rnd() * 80 + 8; tries++ }
      bokeh.push({
        x: bx.toFixed(1) + '%',
        y: by.toFixed(1) + '%',
        s: (9 + rnd() * 11).toFixed(0) + 'px',
        c: rnd() > 0.75 ? G : ACC,
        dur: (9 + rnd() * 8).toFixed(1) + 's',
        delay: (rnd() * 6).toFixed(1) + 's',
      })
    }
    const sparks = []
    for (let i = 0; i < 7; i++) {
      const ang = rnd() * Math.PI * 2
      const dist = 80 + rnd() * 90
      sparks.push({
        tx: (Math.cos(ang) * dist).toFixed(0) + 'px',
        ty: (Math.sin(ang) * dist * 0.8).toFixed(0) + 'px',
        dur: (2.2 + rnd() * 2.6).toFixed(1) + 's',
        delay: (rnd() * 4.5).toFixed(1) + 's',
      })
    }
    return { particles, risers, bokeh, sparks }
  }, [tab, isMobile, density])
}

const HEX_GRID_URI = "url(data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='56'%20height='96'%3E%3Cpolygon%20points='28,3%2052,16%2052,45%2028,58%204,45%204,16'%20fill='none'%20stroke='%2320d8ec'%20stroke-width='0.6'/%3E%3C/svg%3E)"
const GRAIN_URI = "url(data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='160'%20height='160'%3E%3Cfilter%20id='n'%3E%3CfeTurbulence%20type='fractalNoise'%20baseFrequency='0.9'%20numOctaves='2'/%3E%3CfeColorMatrix%20type='saturate'%20values='0'/%3E%3C/filter%3E%3Crect%20width='160'%20height='160'%20filter='url(%23n)'%20opacity='0.55'/%3E%3C/svg%3E)"

export function useHoloAtmosphere(tab, isMobile) {
  return useAtmosphere(tab, isMobile)
}

// static set dressing + overlays; `blips` come from the domain feed
export default function HoloScene({ tab, isMobile, blips, atmosphere }) {
  const { particles, risers, bokeh } = atmosphere
  const sceneEdge = a(SCENE, '30')
  const sceneSoft = a(SCENE, '99')
  return (
    <>
      {/* ── deep set dressing ── */}
      <div data-plx="0.010" style={{ position: 'absolute', inset: '-3%' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.13, filter: 'blur(.4px)', backgroundImage: HEX_GRID_URI, backgroundSize: '56px 96px', maskImage: 'radial-gradient(ellipse at 50% 45%, transparent 20%, black 58%, transparent 96%)', WebkitMaskImage: 'radial-gradient(ellipse at 50% 45%, transparent 20%, black 58%, transparent 96%)' }} />
        <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.12, pointerEvents: 'none' }}>
          <g fill="none" stroke={SCENE} strokeWidth=".7">
            <rect x="60" y="90" width="130" height="84" strokeDasharray="5 4" />
            <rect x="84" y="112" width="82" height="40" />
            <circle cx="235" cy="560" r="46" strokeDasharray="3 5" />
            <circle cx="235" cy="560" r="28" />
            <rect x="1010" y="120" width="120" height="72" strokeDasharray="5 4" />
            <circle cx="1000" cy="540" r="52" strokeDasharray="2 6" />
            <path d="M 950 540 L 1050 540 M 1000 490 L 1000 590" />
            <path d="M 380 70 L 470 70 L 470 110" strokeDasharray="4 4" />
            <path d="M 820 640 L 740 640 L 740 600" strokeDasharray="4 4" />
          </g>
        </svg>
      </div>

      {/* atmosphere haze */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', left: '8%', top: '16%', width: '44vmin', height: '34vmin', borderRadius: '50%', background: `radial-gradient(circle, ${a(SCENE, '14')} 0%, transparent 68%)`, filter: 'blur(30px)', animation: 'holo-floatB 13s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', right: '6%', bottom: '20%', width: '50vmin', height: '36vmin', borderRadius: '50%', background: `radial-gradient(circle, ${mix(RAISED, 18)} 0%, transparent 70%)`, filter: 'blur(34px)', animation: 'holo-floatA 16s ease-in-out infinite' }} />
      </div>

      {/* god-ray + lens streak */}
      <div data-plx="0.016" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-8%', left: '50%', transform: 'translateX(-50%)', width: '58vmin', height: '72vmin', background: `radial-gradient(ellipse 50% 100% at 50% 0%, ${a(SCENE, '1f')} 0%, transparent 70%)`, animation: 'holo-beamPulse 5.5s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 2, height: '30vh', background: `linear-gradient(180deg, ${a(SCENE, '66')}, transparent)`, filter: 'blur(1px)' }} />
        <div style={{ position: 'absolute', top: '9%', left: '50%', transform: 'translateX(-50%)', width: '44vmin', height: 2, background: `linear-gradient(90deg, transparent, ${mix('white', 33)} 46%, ${a(SCENE, 'aa')} 50%, ${mix('white', 33)} 54%, transparent)`, filter: 'blur(1.4px)', animation: 'holo-beamPulse 5.5s ease-in-out infinite' }} />
      </div>

      {/* floor: grid + radar + rings + blips */}
      <div data-plx="0.022" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', left: '-22%', right: '-22%', bottom: '-5%', height: '46%', transform: 'perspective(520px) rotateX(63deg)', transformOrigin: '50% 100%', backgroundImage: `linear-gradient(${sceneEdge} 1px, transparent 1px), linear-gradient(90deg, ${sceneEdge} 1px, transparent 1px)`, backgroundSize: '44px 44px', animation: 'holo-gridFlow 3s linear infinite', maskImage: 'radial-gradient(ellipse 62% 92% at 50% 100%, black 22%, transparent 76%)', WebkitMaskImage: 'radial-gradient(ellipse 62% 92% at 50% 100%, black 22%, transparent 76%)' }} />
        <div style={{ position: 'absolute', left: '50%', top: '82%', width: '72vmin', height: '72vmin', transform: 'translate(-50%,-50%) perspective(560px) rotateX(72deg)', borderRadius: '50%', border: `1px solid ${sceneEdge}` }}>
          <div style={{ position: 'absolute', inset: '11%', borderRadius: '50%', border: `1px solid ${sceneEdge}` }} />
          <div style={{ position: 'absolute', inset: '24%', borderRadius: '50%', border: `1px dashed ${sceneSoft}`, animation: 'holo-ringSpin 26s linear infinite' }} />
          <div style={{ position: 'absolute', inset: '38%', borderRadius: '50%', border: `1px solid ${a(SCENE, '55')}`, boxShadow: `0 0 26px ${a(SCENE, '66')}, inset 0 0 26px ${a(SCENE, '1f')}` }} />
          {blips.map((bp, i) => (
            <i key={i} style={{ position: 'absolute', left: bp.x, top: bp.y, width: 5, height: 5, borderRadius: '50%', background: bp.c, color: bp.c, animation: 'holo-blipPing 3.4s ease-out infinite', animationDelay: bp.delay }} />
          ))}
        </div>
        <div style={{ position: 'absolute', left: '50%', top: '82%', width: '72vmin', height: '72vmin', transform: 'translate(-50%,-50%) perspective(560px) rotateX(72deg)', borderRadius: '50%', overflow: 'hidden', animation: 'holo-radarSpin 7s linear infinite', background: `conic-gradient(from 0deg, ${a(SCENE, '3d')} 0deg, transparent 68deg)`, maskImage: 'radial-gradient(circle, black 0 62%, transparent 63%)', WebkitMaskImage: 'radial-gradient(circle, black 0 62%, transparent 63%)' }} />
      </div>

      {/* rising particles */}
      {risers.map((rp, i) => (
        <i key={i} style={{ position: 'absolute', left: rp.x, bottom: '12%', width: 2, height: rp.h, background: `linear-gradient(180deg, ${SCENE}, transparent)`, pointerEvents: 'none', animation: `holo-riseFade ${rp.dur} linear infinite`, animationDelay: rp.delay }} />
      ))}

      {/* twinkle particles */}
      <div data-plx="0.03" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {particles.map((pt, i) => (
          <i key={i} style={{ position: 'absolute', left: pt.x, top: pt.y, width: pt.s, height: pt.s, borderRadius: '50%', background: pt.c, boxShadow: `0 0 6px ${pt.c}`, animation: `holo-twinkle ${pt.dur} ease-in-out infinite`, animationDelay: pt.delay }} />
        ))}
      </div>

      {/* foreground bokeh */}
      <div data-plx="0.10" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 55 }}>
        {bokeh.map((bk, i) => (
          <i key={i} style={{ position: 'absolute', left: bk.x, top: bk.y, width: bk.s, height: bk.s, borderRadius: '50%', background: bk.c, opacity: 0.16, filter: 'blur(3px)', animation: `holo-bokehDrift ${bk.dur} ease-in-out infinite`, animationDelay: bk.delay }} />
        ))}
      </div>

      {/* scanlines + grain + vignette */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 62, backgroundImage: `repeating-linear-gradient(0deg, ${mix('white', 1.6)} 0 1px, transparent 1px 3px)`, animation: 'holo-scanDrift 1.4s linear infinite', mixBlendMode: 'screen' }} />
      {!isMobile && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 62, opacity: 0.05, mixBlendMode: 'overlay', backgroundImage: GRAIN_URI }} />
      )}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 63, background: `radial-gradient(ellipse at 50% 44%, transparent 40%, ${mix(BG, 84)} 100%)` }} />
    </>
  )
}

// corner ticks + system labels + clock (edge HUD chrome)
export function HoloEdgeChrome({ clock }) {
  const tickBorder = `1px solid ${a(SCENE, '88')}`
  const sceneSoft = a(SCENE, '99')
  return (
    <>
      <div style={{ position: 'absolute', top: 12, left: 14, zIndex: 70, pointerEvents: 'none' }}>
        <div style={{ width: 26, height: 26, borderTop: tickBorder, borderLeft: tickBorder, position: 'absolute', top: 0, left: 0 }} />
        <div style={{ padding: '6px 0 0 12px', fontFamily: FM, fontSize: '8.5px', letterSpacing: '.3em', color: sceneSoft }}>
          PHOENIX <span style={{ color: SCENE }}>{'//'}</span> OS v2.5
        </div>
      </div>
      <div style={{ position: 'absolute', top: 12, right: 14, zIndex: 70, pointerEvents: 'none', textAlign: 'right' }}>
        <div style={{ width: 26, height: 26, borderTop: tickBorder, borderRight: tickBorder, position: 'absolute', top: 0, right: 0 }} />
        <div style={{ padding: '6px 12px 0 0', fontFamily: FM, fontSize: '8.5px', letterSpacing: '.22em', color: sceneSoft }}>
          {clock} <span style={{ color: SCENE }}>·</span> <span style={{ color: G }}>ONLINE</span>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 12, left: 14, zIndex: 70, pointerEvents: 'none' }}>
        <div style={{ width: 26, height: 26, borderBottom: tickBorder, borderLeft: tickBorder, position: 'absolute', bottom: 0, left: 0 }} />
      </div>
      <div style={{ position: 'absolute', bottom: 12, right: 14, zIndex: 70, pointerEvents: 'none' }}>
        <div style={{ width: 26, height: 26, borderBottom: tickBorder, borderRight: tickBorder, position: 'absolute', bottom: 0, right: 0 }} />
      </div>
    </>
  )
}

// typed boot line, top center — remounted (keyed) on domain switch
export function HoloBootLine({ bootLine }) {
  return (
    <div style={{ position: 'absolute', top: 13, left: '50%', transform: 'translateX(-50%)', zIndex: 70, display: 'flex', alignItems: 'center', gap: 9, animation: 'holo-inX .4s cubic-bezier(.2,.8,.4,1) both', whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, background: ACC, boxShadow: `0 0 8px ${ACC}` }} />
      <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.3em', color: a(ACC, '99') }}>{bootLine}</span>
      <span style={{ display: 'inline-block', width: 5, height: 11, background: ACC, boxShadow: `0 0 8px ${ACC}`, animation: 'holo-cursorBlink 1.4s ease-in-out infinite' }} />
    </div>
  )
}

// domain-switch scanline flash — keyed on fx to replay
export function HoloDomainFlash() {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 78, pointerEvents: 'none', mixBlendMode: 'screen', opacity: 0, background: `repeating-linear-gradient(0deg, transparent 0 3px, ${a(ACC, '14')} 3px 4px), linear-gradient(180deg, transparent 15%, ${a(ACC, '1f')} 50%, transparent 85%)`, animation: 'holo-domainFlash .55s ease-out both' }} />
  )
}

// connector lines + projection beams (desktop domain screens)
export function HoloBeams() {
  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 20, pointerEvents: 'none', opacity: 0.42 }}>
        {[[50, 38, 22, 26, '4s'], [50, 46, 22, 64, '5s'], [50, 38, 78, 26, '4.5s'], [50, 46, 78, 64, '5.4s']].map(([x1, y1, x2, y2, dur], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={a(SCENE, '66')} strokeWidth=".13" strokeDasharray="1.3 1" style={{ animation: `holo-dashFlow ${dur} linear infinite` }} />
        ))}
        <g fill={SCENE}>
          <circle cx="22" cy="26" r=".35" style={{ animation: 'holo-twinkle 2.6s ease-in-out infinite' }} />
          <circle cx="22" cy="64" r=".35" style={{ animation: 'holo-twinkle 3.1s ease-in-out infinite .4s' }} />
          <circle cx="78" cy="26" r=".35" style={{ animation: 'holo-twinkle 2.8s ease-in-out infinite .8s' }} />
          <circle cx="78" cy="64" r=".35" style={{ animation: 'holo-twinkle 3.4s ease-in-out infinite .2s' }} />
        </g>
      </svg>
      <div style={{ position: 'absolute', left: '6%', top: '18%', bottom: '22%', width: '38%', zIndex: 19, pointerEvents: 'none', clipPath: 'polygon(100% 42%, 100% 52%, 0% 100%, 0% 0%)', background: `linear-gradient(270deg, ${a(ACC, '10')}, transparent 72%)`, filter: 'blur(4px)', animation: 'holo-beamPulse 6.5s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', right: '6%', top: '18%', bottom: '22%', width: '38%', zIndex: 19, pointerEvents: 'none', clipPath: 'polygon(0% 42%, 0% 52%, 100% 100%, 100% 0%)', background: `linear-gradient(90deg, ${a(ACC, '10')}, transparent 72%)`, filter: 'blur(4px)', animation: 'holo-beamPulse 6.5s ease-in-out infinite' }} />
    </>
  )
}
