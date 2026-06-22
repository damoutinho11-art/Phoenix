import { useEffect, useRef, useState } from 'react'
import Message from './Message'
import StatusBar from './StatusBar'
import { useJarvis } from '../hooks/useJarvis'

export default function Chat() {
  const { messages, apiStatus, loading, greet, send } = useJarvis()
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)
  const greeted = useRef(false)

  useEffect(() => {
    if (!greeted.current) {
      greeted.current = true
      greet()
    }
  }, [greet])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSubmit(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    send(text)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh',
      background: '#0a0a0a',
      fontFamily: 'Inter, sans-serif',
      maxWidth: '680px',
      margin: '0 auto',
      width: '100%',
    }}>
      <StatusBar apiStatus={apiStatus} loading={loading} />

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {messages.map(msg => (
          <Message key={msg.id} role={msg.role} text={msg.text} />
        ))}
        {loading && messages.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'flex-start',
            marginBottom: '12px',
          }}>
            <div style={{
              padding: '10px 14px',
              borderRadius: '2px 12px 12px 12px',
              background: '#111111',
              border: '1px solid #222',
              color: '#444',
              fontSize: '14px',
            }}>
              <span style={{ color: '#c9a84c', fontSize: '10px', letterSpacing: '0.1em', fontWeight: 600, display: 'block', marginBottom: '4px' }}>JARVIS</span>
              …
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          gap: '8px',
          padding: '12px 16px',
          borderTop: '1px solid #1a1a1a',
          background: '#0a0a0a',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="portfolio · recommendation · calendar · status"
          disabled={loading}
          style={{
            flex: 1,
            background: '#111',
            border: '1px solid #222',
            borderRadius: '8px',
            padding: '10px 14px',
            color: '#e8e8e8',
            fontSize: '14px',
            fontFamily: 'inherit',
            outline: 'none',
            caretColor: '#c9a84c',
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          style={{
            background: input.trim() && !loading ? '#c9a84c' : '#1a1a1a',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 18px',
            color: input.trim() && !loading ? '#0a0a0a' : '#333',
            fontSize: '14px',
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: input.trim() && !loading ? 'pointer' : 'default',
            transition: 'background 0.15s, color 0.15s',
            letterSpacing: '0.04em',
          }}
        >
          Send
        </button>
      </form>
    </div>
  )
}
