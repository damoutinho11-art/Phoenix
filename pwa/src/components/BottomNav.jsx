const TABS = [
  { id: 'chat',      label: 'CHAT',      icon: '◈', accent: '#c9a84c' },
  { id: 'finance',   label: 'FINANCE',   icon: '◆', accent: '#20d8ec' },
  { id: 'nutrition', label: 'NUTRITION', icon: '◉', accent: '#9dff6f' },
  { id: 'training',  label: 'TRAINING',  icon: '◎', accent: '#ff9f43' },
]

export default function BottomNav({ tab, onTab }) {
  return (
    <div style={{
      display: 'flex',
      borderTop: '1px solid #1a1a1a',
      background: '#0a0a0a',
      paddingBottom: 'env(safe-area-inset-bottom)',
      flexShrink: 0,
    }}>
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onTab(t.id)}
          style={{
            flex: 1,
            padding: '10px 0',
            background: 'none',
            border: 'none',
            borderTop: tab === t.id ? `2px solid ${t.accent}` : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          <span style={{ fontSize: '16px', color: tab === t.id ? t.accent : '#333' }}>
            {t.icon}
          </span>
          <span style={{
            fontSize: '9px',
            letterSpacing: '0.1em',
            fontWeight: 600,
            color: tab === t.id ? t.accent : '#333',
            fontFamily: "'Oswald', 'Inter', sans-serif",
          }}>
            {t.label}
          </span>
        </button>
      ))}
    </div>
  )
}
