import './cockpit.css'

function classes(...values) {
  return values.filter(Boolean).join(' ')
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
      style={{ '--phx-accent': accent, ...style }}
      {...props}
    >
      <div className="phx-cockpit-ambient" aria-hidden="true" />
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
