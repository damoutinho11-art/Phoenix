import { ACC, FM, a, deep } from './holoTokens'
import { PanelBody } from './HoloWings'

// centered focus modal — the enlarged view of a clicked wing panel
export default function HoloFocus({ panel, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 84, background: 'color-mix(in srgb, black 62%, transparent)', backdropFilter: 'blur(3px)', animation: 'holo-fadeIn .25s ease both', cursor: 'pointer' }} />
      <div style={{ position: 'absolute', left: '50%', top: '45%', transform: 'translate(-50%,-50%)', width: 'min(460px, calc(100vw - 28px))', zIndex: 86, animation: 'holo-focusIn .35s cubic-bezier(.2,.8,.4,1) both' }}>
        <div style={{ position: 'relative', overflow: 'hidden', border: `1px solid ${a(ACC, '55')}`, background: `linear-gradient(180deg, ${a(ACC, '1a')}, ${deep(90)})`, backdropFilter: 'blur(14px)', boxShadow: `0 0 60px ${a(ACC, '66')}, inset 0 0 40px ${a(ACC, '0d')}`, padding: '16px 18px 15px', clipPath: 'polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%)' }}>
          <div style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 1, background: ACC, transform: 'rotate(-45deg)', transformOrigin: '100% 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: FM, fontSize: 10, letterSpacing: '.28em', color: ACC, textShadow: `0 0 10px ${a(ACC, '66')}` }}>
              <i style={{ width: 5, height: 5, background: 'currentColor', boxShadow: '0 0 7px currentColor' }} />
              {panel.code}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: FM, fontSize: '8.5px', letterSpacing: '.12em', color: a(ACC, '99') }}>{panel.meta}</span>
              <button onClick={onClose} style={{ minWidth: 34, minHeight: 30, fontFamily: FM, fontSize: 11, color: ACC, background: deep(60), border: `1px solid ${a(ACC, '44')}`, cursor: 'pointer' }}>✕</button>
            </span>
          </div>
          <div style={{ height: 1, background: `linear-gradient(90deg, ${a(ACC, '88')}, transparent)`, marginBottom: 6 }} />
          <PanelBody panel={panel} big />
        </div>
      </div>
    </>
  )
}
