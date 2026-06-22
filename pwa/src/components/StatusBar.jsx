export default function StatusBar({ apiStatus, loading }) {
  const color = apiStatus === 'ok' ? '#4caf50' : apiStatus === 'error' ? '#ef5350' : '#666'
  const label = loading ? 'thinking…'
    : apiStatus === 'ok' ? 'online'
    : apiStatus === 'error' ? 'unreachable'
    : 'connecting'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 16px',
      borderBottom: '1px solid #1a1a1a',
      background: '#0a0a0a',
    }}>
      <span style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '11px',
        letterSpacing: '0.08em',
        color: '#555',
        fontWeight: 500,
      }}>
        J.A.R.V.I.S.
        <span style={{ color: '#333' }}>·</span>
        <span style={{ color }}>
          <span style={{
            display: 'inline-block',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: color,
            marginRight: '4px',
            verticalAlign: 'middle',
          }} />
          {label}
        </span>
      </span>
    </div>
  )
}
