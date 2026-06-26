export default function ActionButton({ children, variant = '', onClick, disabled, style }) {
  return (
    <button
      className={`action${variant ? ' ' + variant : ''}${disabled ? ' ghost' : ''}`}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      {children}
    </button>
  )
}
