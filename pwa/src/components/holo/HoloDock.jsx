import { SCENE, BODY, FM, HOME_ACCENT, a, mix, deep } from './holoTokens'

const RAW = {
  home: 'var(--phx-accent)', // resolved per-scope below via ACCENTS
  finance: 'var(--phx-finance)',
  nutrition: 'var(--phx-nutrition)',
  training: 'var(--phx-training)',
  calendar: 'var(--phx-calendar)',
}
const ICONS = { home: '◈', finance: '◆', nutrition: '◎', training: '▲', calendar: '◷' }
export const DOCK_ORDER = ['home', 'finance', 'nutrition', 'training', 'calendar']

// bottom holo dock — 5 domain tabs with digit shortcuts and skewed end caps
export default function HoloDock({ tab, onGo, accent }) {
  const cap = skew => ({ width: 20, alignSelf: 'flex-end', height: 30, borderTop: `1px solid ${a(SCENE, '55')}`, background: `linear-gradient(180deg, ${a(SCENE, '10')}, ${deep(86)})`, transform: `skewX(${skew}deg)` })
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 90, padding: '0 12px calc(8px + env(safe-area-inset-bottom))' }}>
      <nav style={{ position: 'relative', width: 'min(560px, 100%)', margin: '0 auto', display: 'flex', alignItems: 'stretch' }}>
        <div style={{ ...cap(28), borderLeft: `1px solid ${a(SCENE, '26')}`, transformOrigin: '100% 0', marginRight: -6 }} />
        <div style={{ flex: 1, position: 'relative' }}>
          <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, boxShadow: `0 0 18px ${mix(accent, 40)}` }} />
          <div style={{ display: 'flex', border: `1px solid ${a(SCENE, '33')}`, borderTop: 'none', background: deep(86), backdropFilter: 'blur(18px)' }}>
            {DOCK_ORDER.map((id, i) => {
              const c = id === 'home' ? HOME_ACCENT : RAW[id]
              const active = tab === id
              return (
                <button key={id} onClick={() => onGo(id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 4px 8px', position: 'relative', color: active ? c : mix(BODY, 32), border: 'none', borderLeft: i === 0 ? 'none' : `1px solid ${a(SCENE, '0f')}`, background: active ? `linear-gradient(180deg, ${mix(c, 8)}, transparent)` : 'none', cursor: 'pointer', filter: active ? `drop-shadow(0 0 5px ${c})` : 'none', minHeight: 48 }}>
                  {active && (
                    <>
                      <span style={{ position: 'absolute', bottom: 0, left: '18%', right: '18%', height: 2, background: c, boxShadow: `0 0 10px ${c}` }} />
                      <span style={{ position: 'absolute', top: 0, left: '18%', right: '18%', height: 1, background: `linear-gradient(90deg, transparent, ${mix(c, 53)}, transparent)` }} />
                    </>
                  )}
                  <span style={{ position: 'absolute', top: 4, right: 6, fontFamily: FM, fontSize: '6.5px', letterSpacing: '.1em', color: active ? mix(c, 67) : mix(BODY, 20) }}>{'0' + (i + 1)}</span>
                  <span style={{ fontSize: 15, lineHeight: 1 }}>{ICONS[id]}</span>
                  <span style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.14em' }}>{id.toUpperCase()}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div style={{ ...cap(-28), borderRight: `1px solid ${a(SCENE, '26')}`, transformOrigin: '0 0', marginLeft: -6 }} />
      </nav>
    </div>
  )
}
