const NAV_ITEMS = [
  { id: 'home',      icon: '◈', label: 'HOME',      accent: 'var(--cyan-br)' },
  { id: 'finance',   icon: '◆', label: 'FINANCE',   accent: 'var(--accent-finance)' },
  { id: 'nutrition', icon: '◎', label: 'NUTRITION', accent: 'var(--accent-nutrition)' },
  { id: 'training',  icon: '▲', label: 'TRAINING',  accent: 'var(--accent-training)' },
  { id: 'calendar',  icon: '◷', label: 'CALENDAR',  accent: 'var(--accent-calendar)' },
]

export default function BottomNav({ tab, onTab }) {
  const active = NAV_ITEMS.find(n => n.id === tab) || NAV_ITEMS[0]
  return (
    <nav className="nav-rail">
      <div
        className="nav-rail-glow"
        style={{
          background: `linear-gradient(90deg, transparent, ${active.accent}, transparent)`,
          boxShadow: `0 0 18px ${active.accent}55`,
        }}
      />
      <div className="nav-bar">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`nav-btn${tab === item.id ? ' active' : ''}`}
            style={tab === item.id ? { color: item.accent } : {}}
            onClick={() => onTab(item.id)}
          >
            {tab === item.id && (
              <span
                style={{
                  position: 'absolute',
                  bottom: 0, left: '15%', right: '15%',
                  height: 2,
                  background: item.accent,
                  boxShadow: `0 0 8px ${item.accent}`,
                }}
              />
            )}
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
