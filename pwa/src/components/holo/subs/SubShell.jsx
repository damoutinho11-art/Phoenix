import { ACC, FM, a, deep } from '../holoTokens'
import { SUB_META } from '../holoDomains'

// shared modal projection shell: scrim, clip-cornered frame, breadcrumb
// header with ESC chip + ✕, gradient divider, scrollable body
export default function SubShell({ subKey, onClose, meta: metaOverride, children }) {
  const [crumb, fixtureMeta, width] = SUB_META[subKey]
  const meta = metaOverride || fixtureMeta
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 79, background: 'color-mix(in srgb, black 74%, transparent)', backdropFilter: 'blur(6px)', animation: 'holo-fadeIn .25s ease both', cursor: 'pointer' }} />
      <div style={{ position: 'fixed', left: '50%', top: '46.5%', transform: 'translate(-50%,-50%)', width, zIndex: 80, animation: 'holo-focusIn .4s cubic-bezier(.2,.8,.4,1) both' }}>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 170px)', border: `1px solid ${a(ACC, '50')}`, background: `linear-gradient(180deg, ${a(ACC, '14')}, ${deep(94)})`, backdropFilter: 'blur(16px)', boxShadow: `0 0 90px ${a(ACC, '66')}, inset 0 0 50px ${a(ACC, '0a')}`, clipPath: 'polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 0 100%)' }}>
          <div style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 1, background: ACC, transform: 'rotate(-45deg)', transformOrigin: '100% 0', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -1, left: -1, width: 11, height: 11, borderBottom: `1px solid ${ACC}`, borderLeft: `1px solid ${ACC}`, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderBottom: `1px solid ${ACC}`, borderRight: `1px solid ${ACC}`, pointerEvents: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '13px 16px 10px', flexShrink: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FM, fontSize: 10, letterSpacing: '.26em', color: ACC, textShadow: `0 0 10px ${a(ACC, '66')}`, whiteSpace: 'nowrap' }}>
              <i style={{ width: 5, height: 5, background: 'currentColor', boxShadow: '0 0 7px currentColor' }} />
              {crumb}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.14em', color: a(ACC, '99'), whiteSpace: 'nowrap' }}>{meta}</span>
              <span style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.14em', color: a(ACC, '99'), border: `1px solid ${a(ACC, '30')}`, padding: '3px 7px' }}>ESC</span>
              <button onClick={onClose} style={{ minWidth: 34, minHeight: 30, fontFamily: FM, fontSize: 11, color: ACC, background: deep(60), border: `1px solid ${a(ACC, '44')}`, cursor: 'pointer' }}>✕</button>
            </span>
          </div>
          <div style={{ height: 1, background: `linear-gradient(90deg, ${a(ACC, '88')}, transparent)`, margin: '0 16px', flexShrink: 0 }} />
          <div className="holo-sub-body" style={{ overflowY: 'auto', padding: '14px 18px 18px' }}>
            {children}
          </div>
        </div>
      </div>
    </>
  )
}

// shared mono section label ("PRE-FLIGHT CHECKS — TAP TO VERIFY")
export function SubLabel({ children, style }) {
  return <div style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.3em', color: a(ACC, '99'), marginBottom: 10, ...style }}>{children}</div>
}

// shared progress-ring + centered value (approval / meal / session / sleep)
export function RingGauge({ r, box, size, stroke, strokeW, offset, dash, big, bigStyle, sub, subColor, subStyle, pullUp, transition }) {
  return (
    <>
      <svg viewBox={`0 0 ${box} ${box}`} style={{ width: size, height: size, display: 'block', margin: '0 auto' }}>
        <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke={a(ACC, '1e')} strokeWidth={strokeW} />
        <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke={stroke} strokeWidth={strokeW} strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={offset} transform={`rotate(-90 ${box / 2} ${box / 2})`} style={{ filter: `drop-shadow(0 0 6px ${stroke})`, transition: transition || 'stroke-dashoffset .5s cubic-bezier(.3,.8,.3,1)' }} />
        <circle cx={box / 2} cy={box / 2} r={r - 9} fill="none" stroke={a(ACC, '22')} strokeWidth="1" strokeDasharray="2 4" />
      </svg>
      <div style={{ marginTop: pullUp[0], marginBottom: pullUp[1] }}>
        <div style={{ fontFamily: 'var(--phx-font-display)', fontWeight: 700, color: 'var(--phx-text)', ...bigStyle }}>{big}</div>
        <div style={{ fontFamily: FM, fontSize: '6.5px', letterSpacing: '.26em', color: subColor || a(ACC, '99'), marginTop: 2, ...subStyle }}>{sub}</div>
      </div>
    </>
  )
}
