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
      marginBottom: '12px',
    }}>
      <div style={{
        maxWidth: '85%',
        padding: '10px 14px',
        borderRadius: isJarvis ? '2px 12px 12px 12px' : '12px 2px 12px 12px',
        background: isJarvis ? '#111111' : '#1a1a0e',
        border: isJarvis ? '1px solid #222' : '1px solid #2a2410',
        color: isJarvis ? '#e8e8e8' : '#c9a84c',
        fontSize: '14px',
        lineHeight: '1.6',
        fontFamily: 'inherit',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {isJarvis && (
          <span style={{
            display: 'block',
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: '#c9a84c',
            marginBottom: '4px',
            fontWeight: 600,
          }}>
            JARVIS
          </span>
        )}
        {renderMarkdown(text)}
      </div>
    </div>
  )
}
