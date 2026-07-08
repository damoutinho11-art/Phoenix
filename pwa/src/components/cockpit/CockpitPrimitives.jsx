import './cockpit.css'

function classes(...values) {
  return values.filter(Boolean).join(' ')
}

// Injected once: hologram keyframes shared by all cockpit shells
const HOLO_KEYFRAMES = `
  @keyframes phCkScanDrift { 0%{background-position:0 0} 100%{background-position:0 6px} }
  @keyframes phCkHoloSweep { 0%{top:-12%} 100%{top:112%} }
  @keyframes phCkFlicker {
    0%, 91%, 94%, 100% { opacity: 1; }
    92% { opacity: .72; }
    93% { opacity: .95; }
    95.5% { opacity: .8; }
  }
`
function ensureHoloKeyframes() {
  if (typeof document === 'undefined' || document.getElementById('phx-holo-keyframes')) return
  const style = document.createElement('style')
  style.id = 'phx-holo-keyframes'
  style.textContent = HOLO_KEYFRAMES
  document.head.appendChild(style)
}

function HoloOverlay() {
  ensureHoloKeyframes()
  return (
    <>
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 60,
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,.022) 0 1px, transparent 1px 3px)',
        animation: 'phCkScanDrift 1.4s linear infinite', mixBlendMode: 'screen',
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 61,
        background: 'radial-gradient(ellipse at 50% 40%, transparent 55%, rgba(1,4,8,.5) 100%)',
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', left: 0, right: 0, height: '9%', top: '-12%', pointerEvents: 'none', zIndex: 62,
        background: 'linear-gradient(180deg, transparent, color-mix(in srgb, var(--phx-accent) 6%, transparent), transparent)',
        animation: 'phCkHoloSweep 7s linear infinite',
      }} />
    </>
  )
}

export function CockpitShell({
  children,
  accent = '#00bbdd',
  className = '',
  style,
  ...props
}) {
  return (
    <main
      className={classes('phx-cockpit-shell', className)}
      style={{ '--phx-accent': accent, position: 'relative', animation: 'phCkFlicker 9s linear infinite', ...style }}
      {...props}
    >
      <div className="phx-cockpit-ambient" aria-hidden="true" />
      <HoloOverlay />
      {children}
    </main>
  )
}

export function DomainHeader({ eyebrow, title, subtitle, actions, className = '' }) {
  return (
    <header className={classes('phx-domain-header', className)}>
      <div>
        {eyebrow && <div className="phx-eyebrow">{eyebrow}</div>}
        <h1 className="phx-domain-title">{title}</h1>
        {subtitle && <p className="phx-domain-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="phx-domain-actions">{actions}</div>}
    </header>
  )
}

export function DataPanel({
  children,
  eyebrow,
  title,
  meta,
  className = '',
  as: Component = 'section',
}) {
  return (
    <Component className={classes('phx-data-panel', className)}>
      <span className="phx-panel-scan phx-motion" aria-hidden="true" />
      {(eyebrow || title || meta) && (
        <div className="phx-panel-heading">
          <div>
            {eyebrow && <div className="phx-eyebrow">{eyebrow}</div>}
            {title && <h2 className="phx-panel-title">{title}</h2>}
          </div>
          {meta && <div className="phx-panel-meta">{meta}</div>}
        </div>
      )}
      {children}
    </Component>
  )
}

export function StatusChip({ children, tone = 'neutral', className = '' }) {
  return (
    <span className={classes('phx-status-chip', `phx-status-${tone}`, className)}>
      <span className="phx-status-dot" aria-hidden="true" />
      {children}
    </span>
  )
}

export function SourceStamp({ source, freshness, asOf, className = '' }) {
  const sourceLabel = source ? String(source).toUpperCase() : 'SOURCE UNKNOWN'
  const detail = [freshness, asOf].filter(Boolean).join(' · ')
  return (
    <div className={classes('phx-source-stamp', className)}>
      <span>{sourceLabel}</span>
      {detail && <span className="phx-source-detail">{detail}</span>}
    </div>
  )
}

export function EmptyState({
  status = 'EMPTY',
  title,
  message,
  className = '',
}) {
  return (
    <div className={classes('phx-empty-state', className)} role="status">
      <div className="phx-empty-code">{status}</div>
      {title && <h3>{title}</h3>}
      {message && <p>{message}</p>}
    </div>
  )
}

export function AuditDrawer({ summary, children, open = false, className = '' }) {
  return (
    <details className={classes('phx-audit-drawer', className)} open={open}>
      <summary>
        <span>{summary}</span>
        <span className="phx-audit-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="phx-audit-content">{children}</div>
    </details>
  )
}
