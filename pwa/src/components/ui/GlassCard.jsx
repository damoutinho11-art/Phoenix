export default function GlassCard({ children, style, className = '' }) {
  return (
    <div className={`glass ${className}`} style={{ borderRadius: 0, ...style }}>
      {children}
    </div>
  )
}
