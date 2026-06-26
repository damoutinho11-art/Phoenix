export default function SectionTitle({ eyebrow, title, accentColor }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {eyebrow && <div className="eyebrow" style={accentColor ? { color: accentColor } : {}}>{eyebrow}</div>}
      <div className="page-title" style={accentColor ? { filter: `drop-shadow(0 0 12px ${accentColor}88)` } : {}}>{title}</div>
    </div>
  )
}
