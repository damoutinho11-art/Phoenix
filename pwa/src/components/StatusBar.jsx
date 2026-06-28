export default function StatusBar({ apiStatus, loading }) {
  const color = apiStatus === 'ok'
    ? 'var(--green)'
    : apiStatus === 'error'
    ? 'var(--red)'
    : 'var(--dim)'

  const label = loading ? 'thinking…'
    : apiStatus === 'ok' ? 'online'
    : apiStatus === 'error' ? 'unreachable'
    : 'connecting'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '7px 16px',
      borderBottom: '1px solid var(--line)',
      background: 'rgba(1,6,8,.9)',
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: 'var(--mono)', fontSize: 10,
        letterSpacing: '.1em', color: 'var(--muted)',
      }}>
        PHOENIX
        <span style={{ color: 'var(--line)' }}>·</span>
        <span style={{ color, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            display: 'inline-block',
            width: 6, height: 6,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 6px ${color}`,
          }} />
          {label}
        </span>
      </span>
    </div>
  )
}
