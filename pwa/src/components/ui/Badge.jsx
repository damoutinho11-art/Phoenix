export default function Badge({ children, variant = '' }) {
  return <span className={`badge${variant ? ' ' + variant : ''}`}>{children}</span>
}
