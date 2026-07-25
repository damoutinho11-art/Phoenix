// Shared HUD chrome for nutrition sub-screens.
// Lime primary · gold secondary · warm near-white text.

const KEYFRAMES_ID = 'phx-nutri-hud-keyframes'
const KEYFRAMES = `
  @keyframes phNuScan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
  @keyframes phNuScanDrift { 0%{background-position:0 0} 100%{background-position:0 6px} }
  @keyframes phNuHoloSweep { 0%{top:-12%} 100%{top:112%} }
  @keyframes phNuFlicker {
    0%, 91%, 94%, 100% { opacity: 1; }
    92% { opacity: .72; }
    93% { opacity: .95; }
    95.5% { opacity: .8; }
  }
  @keyframes phNuBlink { 0%,100%{opacity:.9} 50%{opacity:.2} }
`

export const NU = {
  lime: '#9dff6f',
  limeBr: '#d5ffc7',
  gold: '#ffd166',
  goldMut: 'rgba(255,209,102,.45)',
  border: 'rgba(255,209,102,.2)',
  borderLime: 'rgba(157,255,111,.28)',
  text: 'rgba(240,255,240,.94)',
  dim: 'rgba(190,214,202,.72)',
  red: '#ff5c7a',
  mono: 'var(--phx-font-mono)',
  display: 'var(--phx-font-display)',
  body: 'var(--phx-font-body)',
}

function ensureKeyframes() {
  if (typeof document === 'undefined' || document.getElementById(KEYFRAMES_ID)) return
  const style = document.createElement('style')
  style.id = KEYFRAMES_ID
  style.textContent = KEYFRAMES
  document.head.appendChild(style)
}

export function NuHolo() {
  ensureKeyframes()
  return (
    <>
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 60,
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(157,255,111,.02) 0 1px, transparent 1px 3px)',
        animation: 'phNuScanDrift 1.4s linear infinite', mixBlendMode: 'screen',
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 61,
        background: 'radial-gradient(ellipse at 50% 40%, transparent 55%, rgba(1,4,8,.5) 100%)',
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', left: 0, right: 0, height: '9%', top: '-12%', pointerEvents: 'none', zIndex: 62,
        background: 'linear-gradient(180deg, transparent, rgba(157,255,111,.045), transparent)',
        animation: 'phNuHoloSweep 7s linear infinite',
      }} />
    </>
  )
}

// Screen root: dark bg + holo + flicker
export function NuScreen({ children, style = {} }) {
  ensureKeyframes()
  return (
    <div className="phx-scope-nutrition" style={{
      height: '100%', display: 'flex', flexDirection: 'column', position: 'relative',
      background: 'radial-gradient(circle at 78% 4%, rgba(157,255,111,.06), transparent 34rem), linear-gradient(180deg, #081208 0%, #060c12 42%, #04090e 100%)',
      color: NU.text, fontFamily: NU.body,
      animation: 'phNuFlicker 9s linear infinite',
      ...style,
    }}>
      <NuHolo />
      {children}
    </div>
  )
}

// Sticky console top bar with animated scan line
export function NuTopBar({ onBack, title, code = 'SYS.NUTRI', right = null }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '13px 18px 11px', borderBottom: `1px solid ${NU.borderLime}`,
      position: 'sticky', top: 0, background: 'rgba(2,8,4,.96)', backdropFilter: 'blur(12px)',
      zIndex: 10, flexShrink: 0, overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${NU.lime},transparent)`, animation: 'phNuScan 3.5s linear infinite', opacity: .6 }} />
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <span onClick={onBack} style={{ color: NU.lime, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
        <span style={{ fontFamily: NU.mono, fontSize: 7, letterSpacing: '.18em', color: 'rgba(157,255,111,.5)', marginRight: 10, whiteSpace: 'nowrap' }}>{code} //</span>
        <span style={{ fontFamily: NU.display, fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: NU.limeBr, filter: 'drop-shadow(0 0 8px rgba(157,255,111,.22))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{right}</div>
    </div>
  )
}

// Bracketed section header: [ 01 :: TITLE ] with blinking pip + rail
export function NuSection({ n, title, color = NU.lime }) {
  const code = String(n).padStart(2, '0')
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '18px 14px 8px', overflow: 'hidden' }}>
      <div style={{ width: 8, alignSelf: 'stretch', borderLeft: `1px solid ${color}88`, borderTop: `1px solid ${color}88`, borderBottom: `1px solid ${color}88`, marginTop: 12, minHeight: 16, flexShrink: 0 }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '2px 10px', whiteSpace: 'nowrap' }}>
        <span style={{ fontFamily: NU.display, fontSize: 15, fontWeight: 700, letterSpacing: '.1em', color, textShadow: `0 0 12px ${color}55` }}>{code}</span>
        <span style={{ fontFamily: NU.mono, fontSize: 9, letterSpacing: '.24em', color, textTransform: 'uppercase' }}>{title}</span>
        <span style={{ width: 5, height: 5, background: color, boxShadow: `0 0 7px ${color}`, animation: 'phNuBlink 1.8s ease-in-out infinite', display: 'inline-block' }} />
      </div>
      <div style={{ width: 8, alignSelf: 'stretch', borderRight: `1px solid ${color}88`, borderTop: `1px solid ${color}88`, borderBottom: `1px solid ${color}88`, marginTop: 12, minHeight: 16, flexShrink: 0 }} />
      <div style={{ flex: 1, height: 1, marginLeft: 10, background: `linear-gradient(90deg, ${color}44, transparent)` }} />
      <div style={{ marginLeft: 8, fontFamily: NU.mono, fontSize: 6, letterSpacing: '.14em', color: `${color}38`, flexShrink: 0 }}>{`NUT-${code}`}</div>
    </div>
  )
}

// Corner-bracket panel
export function NuPanel({ children, style = {}, accent = NU.lime, onClick }) {
  const bc = `${accent}55`
  return (
    <div onClick={onClick} style={{ position: 'relative', border: `1px solid ${accent}26`, background: 'rgba(4,10,6,.72)', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default', ...style }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${accent},transparent)`, opacity: .35 }} />
      {[['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']].map(([v, h]) => (
        <div key={v + h} style={{ position: 'absolute', [v]: 0, [h]: 0, width: 9, height: 9, [`border${v[0].toUpperCase() + v.slice(1)}`]: `1px solid ${bc}`, [`border${h[0].toUpperCase() + h.slice(1)}`]: `1px solid ${bc}`, pointerEvents: 'none' }} />
      ))}
      {children}
    </div>
  )
}
