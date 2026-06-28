function renderMarkdown(text) {
  return text.split(/\*\*/).map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  )
}

export default function Message({ role, text }) {
  const isJarvis = role === 'jarvis'

  return (
    <div style={{
      display: 'flex',
      justifyContent: isJarvis ? 'flex-start' : 'flex-end',
      marginBottom: 12,
    }}>
      <div style={{
        maxWidth: '85%',
        padding: '10px 14px',
        ...(isJarvis
          ? {
            background: 'rgba(1,10,13,.7)',
            border: '1px solid var(--line)',
            borderRadius: '2px 12px 12px 12px',
            color: 'var(--text)',
          }
          : {
            background: 'rgba(32,216,236,.06)',
            border: '1px solid rgba(32,216,236,.2)',
            borderRadius: '12px 2px 12px 12px',
            color: 'var(--cyan-br)',
          }),
        fontSize: 14,
        lineHeight: 1.6,
        fontFamily: 'var(--body)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {isJarvis && (
          <span style={{
            display: 'block',
            fontFamily: 'var(--mono)',
            fontSize: 9, letterSpacing: '.12em',
            color: 'var(--cyan)', marginBottom: 4,
          }}>
            PHOENIX
          </span>
        )}
        {renderMarkdown(text)}
      </div>
    </div>
  )
}
