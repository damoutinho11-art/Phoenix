import { ACC, G, W, FM, FD, a, mix, deep } from './holoTokens'

const GLOBE = 'min(26vmin,218px)'
const GLOBE_MID = 'min(24vmin,201px)'
const GLOBE_SM = 'min(17vmin,146px)'

// Central reactor core: ring-frame SVG, gimbal orbits, 3D wireframe globe,
// plasma heart, emitter beam + ripple pad, pedestal hero readout.
export default function HoloCore({
  domain, hot, dimmed, isShort, sparks, showChips, isHome,
}) {
  const accentGlow = a(ACC, '66')
  const accentGlowSoft = a(ACC, '1f')
  const accentEdge = a(ACC, '30')
  const reactorOffset = (464.9 * (1 - domain.reactorPct)).toFixed(1)
  const coreFilter = dimmed
    ? `drop-shadow(0 0 34px ${accentGlow}) brightness(.45)`
    : hot
      ? `drop-shadow(0 0 34px ${accentGlow}) brightness(1.3) saturate(1.15)`
      : `drop-shadow(0 0 34px ${accentGlow})`

  const globeRing = (rot, alpha) => (
    <i key={rot + alpha} style={{ position: 'absolute', left: 0, top: 0, transform: `translate(-50%,-50%) ${rot}`, width: GLOBE, height: GLOBE, borderRadius: '50%', border: `1px solid ${a(ACC, alpha)}` }} />
  )

  return (
    <div style={{ position: 'absolute', left: '50%', top: isShort ? '36%' : '43%', transform: 'translate(-50%,-50%)', width: 0, height: 0, zIndex: 30 }}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '70vmin', height: '70vmin', maxWidth: 600, maxHeight: 600, background: `radial-gradient(circle, ${accentGlowSoft} 0%, transparent 62%)`, pointerEvents: 'none', animation: 'holo-corePulseC 4.2s ease-in-out infinite' }} />
      <div data-plx="0.04" style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, transform: 'translate(-50%,-50%)', width: 'min(44vmin, 372px)', height: 'min(44vmin, 372px)', animation: 'holo-coreAssemble .9s cubic-bezier(.2,.8,.4,1) .05s both', filter: coreFilter, transition: 'filter .5s ease' }}>
          <div style={{ position: 'absolute', inset: 0, animation: 'holo-orbitDrift 10s ease-in-out infinite' }}>
            <svg viewBox="0 0 200 200" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <g style={{ transformOrigin: '50% 50%', animation: 'holo-ringSpin 34s linear infinite' }}>
                <circle cx="100" cy="100" r="98" fill="none" stroke={accentEdge} strokeWidth=".7" strokeDasharray="2 5" />
                <path d="M 100 2 A 98 98 0 0 1 171 31" fill="none" stroke={ACC} strokeWidth="1.3" />
                <path d="M 100 198 A 98 98 0 0 1 29 169" fill="none" stroke={ACC} strokeWidth="1.3" />
              </g>
              <g style={{ transformOrigin: '50% 50%', animation: 'holo-ringSpinRev 21s linear infinite' }}>
                <circle cx="100" cy="100" r="88" fill="none" stroke={accentEdge} strokeWidth=".6" strokeDasharray="11 8" />
                <circle cx="100" cy="12" r="2" fill={ACC} style={{ filter: `drop-shadow(0 0 4px ${ACC})` }} />
              </g>
              <circle cx="100" cy="100" r="83" fill="none" stroke={accentEdge} strokeWidth="2.6" strokeDasharray=".8 3.55" />
              <circle cx="100" cy="100" r="80" fill="none" stroke={accentEdge} strokeWidth=".8" strokeDasharray="1.5 22.4" />
              <circle cx="100" cy="100" r="74" fill="none" stroke={a(ACC, '1c')} strokeWidth="3.4" />
              <circle cx="100" cy="100" r="74" fill="none" stroke={ACC} strokeWidth="3.4" strokeLinecap="round" strokeDasharray="464.9" strokeDashoffset={reactorOffset} transform="rotate(-90 100 100)" style={{ filter: `drop-shadow(0 0 7px ${ACC})`, transition: 'stroke-dashoffset 1s cubic-bezier(.3,.8,.3,1)' }} />
              <g stroke={ACC} strokeWidth="1.1" fill="none" opacity=".85">
                <path d="M 96 6 L 100 2 L 104 6" />
                <path d="M 96 194 L 100 198 L 104 194" />
                <path d="M 6 96 L 2 100 L 6 104" />
                <path d="M 194 96 L 198 100 L 194 104" />
              </g>
              <g style={{ transformOrigin: '50% 50%', animation: 'holo-ringSpinRev 44s linear infinite' }} fill="none" stroke={W} strokeWidth=".9" strokeLinecap="round">
                <path d="M 100 7 A 93 93 0 0 1 166 34" style={{ animation: 'holo-arcFlicker 9.5s linear infinite' }} />
                {hot && <path d="M 34 166 A 93 93 0 0 1 8 108" style={{ animation: 'holo-arcFlicker 4.1s linear infinite 1.2s' }} />}
                {hot && <path d="M 178 138 A 93 93 0 0 1 148 172" style={{ animation: 'holo-arcFlicker 3.6s linear infinite 2.3s' }} />}
              </g>
              <defs>
                <path id="holoCoreTextOrbit" d="M 100,100 m -92,0 a 92,92 0 1,1 184,0 a 92,92 0 1,1 -184,0" />
              </defs>
              <g style={{ transformOrigin: '50% 50%', animation: 'holo-ringSpin 70s linear infinite' }} fill={a(ACC, '77')} fontFamily="Share Tech Mono, monospace" fontSize="4.8" letterSpacing="1.6">
                <text><textPath href="#holoCoreTextOrbit">PHOENIX ORBITAL ARRAY · CORE STABLE · MODULES LINKED 04 · REACTOR NOMINAL · PHOENIX ORBITAL ARRAY · CORE STABLE · MODULES LINKED 04 ·</textPath></text>
              </g>
            </svg>

            {/* gimbal orbits + satellites */}
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
              <div style={{ position: 'absolute', left: 0, top: 0, width: 'min(38vmin, 322px)', height: 'min(38vmin, 322px)', transform: 'translate(-50%,-50%) rotate(-16deg) scaleY(.34)' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px solid ${a(ACC, '2e')}` }} />
                <div style={{ position: 'absolute', inset: 0, animation: 'holo-ringSpin 12s linear infinite' }}>
                  <i style={{ position: 'absolute', left: '50%', top: 0, width: 5, height: 5, margin: -2.5, borderRadius: '50%', background: W, transform: 'scaleY(2.94)', boxShadow: `0 0 8px ${ACC}, 0 0 16px ${ACC}` }} />
                </div>
              </div>
              <div style={{ position: 'absolute', left: 0, top: 0, width: 'min(42vmin, 354px)', height: 'min(42vmin, 354px)', transform: 'translate(-50%,-50%) rotate(14deg) scaleY(.3)' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px dashed ${a(ACC, '24')}` }} />
                <div style={{ position: 'absolute', inset: 0, animation: 'holo-ringSpinRev 19s linear infinite' }}>
                  <i style={{ position: 'absolute', left: '50%', top: 0, width: 4, height: 4, margin: -2, borderRadius: '50%', background: G, transform: 'scaleY(3.33)', boxShadow: `0 0 8px ${G}` }} />
                </div>
              </div>
            </div>

            {/* 3D gyroscope rings */}
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, perspective: 760, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: 'rotateX(64deg) rotateZ(-22deg)', transformStyle: 'preserve-3d' }}>
                <i style={{ position: 'absolute', left: 0, top: 0, width: 'min(31vmin, 262px)', height: 'min(31vmin, 262px)', marginLeft: 'calc(min(31vmin, 262px) / -2)', marginTop: 'calc(min(31vmin, 262px) / -2)', borderRadius: '50%', border: `1.3px solid ${mix(W, 35)}`, boxShadow: `0 0 14px ${accentGlowSoft}`, animation: 'holo-globeSpin 9s linear infinite' }} />
              </div>
              <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: 'rotateX(72deg) rotateZ(28deg)', transformStyle: 'preserve-3d' }}>
                <i style={{ position: 'absolute', left: 0, top: 0, width: 'min(34vmin, 288px)', height: 'min(34vmin, 288px)', marginLeft: 'calc(min(34vmin, 288px) / -2)', marginTop: 'calc(min(34vmin, 288px) / -2)', borderRadius: '50%', border: `1px dashed ${mix(G, 25)}`, animation: 'holo-globeSpinRev 14s linear infinite' }} />
              </div>
            </div>

            {/* spark ejections (burst / voice-hot states) */}
            {hot && (
              <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, pointerEvents: 'none' }}>
                {sparks.map((sk, i) => (
                  <i key={i} style={{ position: 'absolute', left: 0, top: 0, width: 3, height: 3, margin: -1.5, borderRadius: '50%', background: W, boxShadow: `0 0 7px ${ACC}`, '--tx': sk.tx, '--ty': sk.ty, animation: `holo-sparkOut ${sk.dur} cubic-bezier(.2,.6,.6,1) infinite`, animationDelay: sk.delay }} />
                ))}
              </div>
            )}

            {/* 3D wireframe globe */}
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, perspective: 900 }}>
              <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transformStyle: 'preserve-3d', animation: 'holo-globeSpin 18s linear infinite' }}>
                {globeRing('rotateY(0deg)', '5e')}
                {globeRing('rotateY(30deg)', '3a')}
                {globeRing('rotateY(60deg)', '3a')}
                {globeRing('rotateY(90deg)', '5e')}
                {globeRing('rotateY(120deg)', '3a')}
                {globeRing('rotateY(150deg)', '3a')}
                <i style={{ position: 'absolute', left: 0, top: 0, transform: 'translate(-50%,-50%) rotateX(90deg)', width: GLOBE, height: GLOBE, borderRadius: '50%', border: `1px solid ${a(ACC, '66')}` }} />
                <i style={{ position: 'absolute', left: 0, top: 0, transform: `translate(-50%,-50%) translateY(calc(${GLOBE} * -0.19)) rotateX(90deg)`, width: GLOBE_MID, height: GLOBE_MID, borderRadius: '50%', border: `1px solid ${a(ACC, '44')}` }} />
                <i style={{ position: 'absolute', left: 0, top: 0, transform: `translate(-50%,-50%) translateY(calc(${GLOBE} * 0.19)) rotateX(90deg)`, width: GLOBE_MID, height: GLOBE_MID, borderRadius: '50%', border: `1px solid ${a(ACC, '44')}` }} />
                <i style={{ position: 'absolute', left: 0, top: 0, transform: `translate(-50%,-50%) translateY(calc(${GLOBE} * -0.35)) rotateX(90deg)`, width: GLOBE_SM, height: GLOBE_SM, borderRadius: '50%', border: `1px solid ${a(ACC, '30')}` }} />
                <i style={{ position: 'absolute', left: 0, top: 0, transform: `translate(-50%,-50%) translateY(calc(${GLOBE} * 0.35)) rotateX(90deg)`, width: GLOBE_SM, height: GLOBE_SM, borderRadius: '50%', border: `1px solid ${a(ACC, '30')}` }} />
              </div>
              <div style={{ position: 'absolute', left: 0, top: 0, transform: 'translate(-50%,-50%)', width: GLOBE, height: GLOBE, borderRadius: '50%', overflow: 'hidden', pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', left: '5%', right: '5%', height: '15%', background: `linear-gradient(180deg, transparent, ${a(ACC, '30')} 42%, ${mix(W, 17)} 50%, ${a(ACC, '30')} 58%, transparent)`, animation: 'holo-scanBand 5.6s linear infinite' }} />
              </div>
              <div style={{ position: 'absolute', left: 0, top: 0, width: 'min(12vmin,100px)', height: 'min(12vmin,100px)', borderRadius: '50%', background: `conic-gradient(from 0deg, transparent 0%, ${a(ACC, 'b0')} 22%, ${W} 34%, transparent 52%, ${a(ACC, '70')} 74%, transparent 96%)`, filter: 'blur(5px)', opacity: 0.85, animation: `holo-plasmaSpin ${hot ? '1.1s' : '3.6s'} linear infinite` }} />
              <div style={{ position: 'absolute', left: 0, top: 0, width: 'min(7.5vmin,64px)', height: 'min(7.5vmin,64px)', borderRadius: '50%', background: `radial-gradient(circle, white 0%, ${W} 28%, ${ACC} 52%, transparent 74%)`, filter: 'blur(2px)', animation: `holo-plasmaPulse ${hot ? '1s' : '2.7s'} ease-in-out infinite` }} />
            </div>
          </div>
        </div>

        {/* emitter beam + pad */}
        <div style={{ position: 'absolute', left: 0, top: 'min(13vmin, 110px)', transform: 'translateX(-50%)', width: 'min(15vmin, 128px)', height: 'min(5.2vmin, 46px)', pointerEvents: 'none', clipPath: 'polygon(33% 0%, 67% 0%, 92% 100%, 8% 100%)', background: `linear-gradient(180deg, transparent 0%, ${a(ACC, '30')} 100%)`, filter: 'blur(1px)', animation: 'holo-beamPulse 4.6s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', left: 0, top: 'min(18.6vmin, 158px)', transform: 'translate(-50%,-50%)', width: 'min(28vmin, 240px)', height: 'min(6.4vmin, 56px)', pointerEvents: 'none', animation: 'holo-corePulseC 4.6s ease-in-out infinite' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px solid ${a(ACC, '44')}`, boxShadow: `0 0 18px ${accentGlowSoft}` }} />
          <div style={{ position: 'absolute', inset: '16% 18%', borderRadius: '50%', border: `1px dashed ${a(ACC, '30')}` }} />
          <div style={{ position: 'absolute', inset: '34% 38%', borderRadius: '50%', background: `radial-gradient(ellipse, ${a(ACC, '3c')} 0%, transparent 72%)` }} />
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: '100%', height: '100%', borderRadius: '50%', border: `1px solid ${a(ACC, '66')}`, animation: 'holo-padRipple 3.4s ease-out infinite' }} />
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: '100%', height: '100%', borderRadius: '50%', border: `1px solid ${a(ACC, '44')}`, animation: 'holo-padRipple 3.4s ease-out infinite 1.15s' }} />
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: '100%', height: '100%', borderRadius: '50%', border: `1px solid ${mix(W, 20)}`, animation: 'holo-padRipple 3.4s ease-out infinite 2.3s' }} />
        </div>

        {/* pedestal hero readout */}
        <div style={{ position: 'absolute', left: 0, top: isShort ? 'min(17vmin, 148px)' : 'min(24vmin, 204px)', transform: 'translateX(-50%)', textAlign: 'center', whiteSpace: 'nowrap', animation: 'holo-inX .6s cubic-bezier(.2,.8,.4,1) .3s both', zIndex: 46 }}>
          {/* On home the unit is taken out of flow so the wordmark itself is
              dead-center; marginRight cancels the trailing letter-space. */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: isHome ? 0 : 10, justifyContent: 'center', position: 'relative' }}>
            <span style={{ fontFamily: FD, fontSize: isShort ? 'clamp(34px, 6.6vmin, 54px)' : 'clamp(50px, 9.4vmin, 82px)', letterSpacing: isHome ? '.2em' : 'normal', marginRight: isHome ? '-.2em' : 0, fontWeight: 700, lineHeight: 1, color: W, textShadow: `0 0 28px ${accentGlow}, 0 0 84px ${accentGlowSoft}, -1px 0 1px ${mix('rgb(255,80,120)', 18)}, 1px 0 1px ${mix('rgb(80,180,255)', 20)}` }}>{domain.heroValue}</span>
            <span style={{ fontFamily: FM, fontSize: 12, letterSpacing: '.2em', color: a(ACC, '99'), ...(isHome ? { position: 'absolute', left: 'calc(100% + 10px)', bottom: 4 } : {}) }}>{domain.heroUnit}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, justifyContent: 'center', marginTop: 7 }}>
            <span style={{ width: 26, height: 1, background: `linear-gradient(90deg, transparent, ${a(ACC, '88')})` }} />
            <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.34em', color: a(ACC, 'cc'), textShadow: `0 0 10px ${accentGlow}` }}>{domain.heroLabel}</span>
            <span style={{ width: 26, height: 1, background: `linear-gradient(90deg, ${a(ACC, '88')}, transparent)` }} />
          </div>
          {showChips && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', margin: '10px auto 0', flexWrap: 'wrap', maxWidth: 'min(560px, 46vw)', whiteSpace: 'normal' }}>
              {domain.heroChips.map((c, i) => (
                <span key={i} style={{ fontFamily: FM, fontSize: '8.5px', letterSpacing: '.14em', color: c.color, border: `1px solid ${mix(c.color, 33)}`, background: deep(60), padding: '4px 9px', display: 'inline-flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(4px)' }}>
                  <i style={{ width: 4, height: 4, borderRadius: 99, background: 'currentColor', boxShadow: '0 0 6px currentColor' }} />
                  {c.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
