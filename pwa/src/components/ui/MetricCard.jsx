export default function MetricCard({ label, value, sub, color, style }) {
  return (
    <div className="metric" style={style}>
      <div>
        <div className="label">{label}</div>
        {sub && <div className="label" style={{ marginTop: 4 }}>{sub}</div>}
      </div>
      <div className="value" style={color ? { color } : {}}>{value}</div>
    </div>
  )
}
