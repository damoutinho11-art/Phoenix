import { ACC, INK, a, deep } from './holoTokens'
import { PanelBody } from './HoloWings.jsx'

function MobileActionButton({ action, onAction }) {
  const approved = action.approved
  const primary = action.primary && !approved

  return (
    <button
      type="button"
      className={`holo-mobile-action${primary ? ' is-primary' : ''}${approved ? ' is-approved' : ''}`}
      onClick={() => onAction(action.sub)}
      style={{
        color: approved ? 'var(--phx-positive)' : primary ? INK : a(ACC, 'd9'),
        background: primary ? `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})` : deep(60),
        borderColor: approved ? 'color-mix(in srgb, var(--phx-positive) 44%, transparent)' : primary ? ACC : a(ACC, '38'),
        boxShadow: primary ? `0 0 24px ${a(ACC, '44')}` : 'none',
      }}
    >
      <span>{action.label}</span>
    </button>
  )
}

function MobilePanel({ panel, onFocus }) {
  return (
    <button type="button" className="holo-mobile-panel" onClick={() => onFocus(panel.code)}>
      <div className="holo-mobile-panel__chrome" />
      <div className="holo-mobile-panel__heading">
        <span className="holo-mobile-panel__code">{panel.code}</span>
        <span className="holo-mobile-panel__meta">{panel.meta}</span>
      </div>
      <div className="holo-mobile-panel__divider" />
      <div className="holo-mobile-panel__body">
        <PanelBody panel={panel} />
      </div>
    </button>
  )
}

export default function HoloMobileDomain({ domain, onFocus, onAction }) {
  return (
    <section className="holo-mobile-domain">
      <div className="holo-mobile-domain__summary">
        <span className="holo-mobile-domain__label">LIVE COMMAND</span>
        <p className="holo-mobile-domain__brief">{domain.heroBrief}</p>
      </div>

      <div className="holo-mobile-domain__actions">
        {domain.heroActions.map((action) => (
          <MobileActionButton key={action.label} action={action} onAction={onAction} />
        ))}
      </div>

      <div className="holo-mobile-domain__panels">
        {domain.panels.map((panel) => (
          <MobilePanel key={panel.code} panel={panel} onFocus={onFocus} />
        ))}
      </div>
    </section>
  )
}
