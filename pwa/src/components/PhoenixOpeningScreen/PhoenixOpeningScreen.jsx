import { useCallback, useEffect, useRef, useState } from 'react'
import { postJarvisChat } from '../../api/client'
import { speak, stopSpeaking } from '../../services/tts'
import './PhoenixOpeningScreen.css'

const PHOENIX_WELCOME_BRIEF = 'Good morning, Sir. PHOENIX is online. Finance, recovery, training, and calendar modules are standing by.'

const LOCAL_DOMAIN_PATTERNS = [
  { domain: 'finance', pattern: /\b(finance|money|portfolio|budget|holding|holdings|investment|investments)\b/i, reply: 'Opening finance.' },
  { domain: 'training', pattern: /\b(training|workout|gym|legs|jump|session)\b/i, reply: 'Opening training.' },
  { domain: 'nutrition', pattern: /\b(recovery|nutrition|meal|food|sleep|readiness)\b/i, reply: 'Opening recovery.' },
  { domain: 'calendar', pattern: /\b(calendar|schedule|event|events|agenda|meeting)\b/i, reply: 'Opening calendar.' },
]

function detectLocalDomainCommand(text) {
  const clean = text || ''
  if (!/\b(open|show|go|launch|switch|display)\b/i.test(clean)) return null
  return LOCAL_DOMAIN_PATTERNS.find(item => item.pattern.test(clean)) || null
}

export default function PhoenixOpeningScreen({ src = '/phoenix/opening.html', onOpenDomain }) {
  const iframeRef = useRef(null)
  const recognitionRef = useRef(null)
  const holdingRef = useRef(false)
  const finalTranscriptRef = useRef('')
  const latestTranscriptRef = useRef('')
  const welcomeSpokenRef = useRef(false)
  const silenceTimerRef = useRef(null)
  const hardStopTimerRef = useRef(null)
  const [showTypeBar, setShowTypeBar] = useState(false)
  const [typeInput, setTypeInput] = useState('')

  const clearVoiceTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    if (hardStopTimerRef.current) {
      window.clearTimeout(hardStopTimerRef.current)
      hardStopTimerRef.current = null
    }
  }, [])

  const stopRecognitionNow = useCallback(() => {
    holdingRef.current = false
    clearVoiceTimers()

    try {
      recognitionRef.current?.stop()
    } catch {
      try { recognitionRef.current?.abort() } catch {}
    }
  }, [clearVoiceTimers])

  const scheduleAutoStopAfterSpeech = useCallback(() => {
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current)

    silenceTimerRef.current = window.setTimeout(() => {
      stopRecognitionNow()
    }, 1050)
  }, [stopRecognitionNow])

  const postToFrame = useCallback((payload) => {
    iframeRef.current?.contentWindow?.postMessage(payload, '*')
  }, [])

  const setFrameState = useCallback((state, detail = {}) => {
    postToFrame({ type: 'PHOENIX_PARENT_STATE', state, ...detail })
  }, [postToFrame])

  const finishSpeaking = useCallback((text) => {
    setFrameState('idle', {
      label: 'OPERATOR LINK STABLE',
      text,
    })
  }, [setFrameState])

  const announceWelcome = useCallback((reason = 'entry') => {
    if (welcomeSpokenRef.current) return
    welcomeSpokenRef.current = true

    setFrameState('speaking', {
      label: 'PHOENIX ONLINE',
      text: PHOENIX_WELCOME_BRIEF,
    })

    speak(PHOENIX_WELCOME_BRIEF, {
      onEnd: () => finishSpeaking(PHOENIX_WELCOME_BRIEF),
    }).catch?.(() => {
      // Browser autoplay can block audio before a gesture.
      // If this was an automatic entry attempt, allow the next reactor hold to retry.
      if (reason === 'entry') welcomeSpokenRef.current = false
    })
  }, [finishSpeaking, setFrameState])


  const processCommand = useCallback(async (text) => {
    const clean = String(text || '').trim()

    if (!clean) {
      const msg = 'I did not catch that. Hold the reactor and speak again.'
      setFrameState('error', { label: 'NO SPEECH DETECTED', text: msg })
      return
    }

    const local = detectLocalDomainCommand(clean)
    if (local) {
      setFrameState('speaking', {
        label: 'ROUTE READY',
        text: local.reply,
      })
      speak(local.reply, {
        onEnd: () => finishSpeaking(local.reply),
      })
      window.setTimeout(() => onOpenDomain?.(local.domain), 450)
      return
    }

    setFrameState('processing', {
      label: 'PROCESSING REQUEST',
      text: `You: ${clean}`,
    })

    try {
      const data = await postJarvisChat({
        domain: 'home',
        message: clean,
        history: [],
      })

      const response = data?.response || 'Command received. PHOENIX is ready.'
      setFrameState('speaking', {
        label: 'RESPONSE READY',
        text: response,
      })

      speak(response, {
        onEnd: () => finishSpeaking(response),
      })
    } catch (error) {
      console.error('PHOENIX backend chat failed:', error)
      const fallback = 'Backend offline. Start the PHOENIX server, then try again.'
      setFrameState('error', {
        label: 'BACKEND OFFLINE',
        text: fallback,
      })
      speak(fallback, {
        onEnd: () => finishSpeaking(fallback),
      })
    }
  }, [finishSpeaking, onOpenDomain, setFrameState])

  const stopListening = useCallback(() => {
    if (!holdingRef.current && !recognitionRef.current) return
    stopRecognitionNow()
  }, [stopRecognitionNow])


  const startListening = useCallback(() => {
    if (holdingRef.current) return

    stopSpeaking()
    finalTranscriptRef.current = ''
    latestTranscriptRef.current = ''
    clearVoiceTimers()
    setShowTypeBar(false)
    holdingRef.current = true

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      holdingRef.current = false
      const msg = 'Speech recognition is not available in this browser. Use Chrome or type your command.'
      setFrameState('error', {
        label: 'SPEECH API UNAVAILABLE',
        text: msg,
      })
      speak(msg)
      return
    }

    setFrameState('listening', {
      label: 'VOICE INTERFACE ACTIVE',
      text: 'Listening, Diogo. Speak your command.',
    })

    hardStopTimerRef.current = window.setTimeout(() => {
      stopRecognitionNow()
    }, 8000)

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false
    recognitionRef.current = recognition

    recognition.onresult = (event) => {
      let interim = ''

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += transcript
        } else {
          interim += transcript
        }
      }

      const shown = (finalTranscriptRef.current || interim).trim()
      latestTranscriptRef.current = shown

      if (shown) {
        setFrameState('hearing', {
          label: 'HEARING SIGNAL',
          text: shown,
        })

        // Prevent the UI from staying stuck in HEARING forever.
        // Once we have words, stop shortly after the user pauses.
        scheduleAutoStopAfterSpeech()
      }
    }

    recognition.onerror = (e) => {
      holdingRef.current = false
      recognitionRef.current = null
      clearVoiceTimers()
      if (e.error === 'no-speech') {
        setFrameState('error', {
          label: 'NO SPEECH DETECTED',
          text: 'No speech detected. Tap below to type.',
        })
        window.setTimeout(() => setShowTypeBar(true), 1500)
        return
      }
      const msg = 'Microphone permission is blocked. Allow microphone access and hold the reactor again.'
      setFrameState('error', {
        label: 'MIC PERMISSION NEEDED',
        text: msg,
      })
      setShowTypeBar(true)
      speak(msg)
    }

    recognition.onend = () => {
      recognitionRef.current = null
      clearVoiceTimers()

      const spoken = (finalTranscriptRef.current || latestTranscriptRef.current || '').trim()
      finalTranscriptRef.current = ''
      latestTranscriptRef.current = ''

      if (!spoken) {
        holdingRef.current = false
        setFrameState('error', {
          label: 'NO SPEECH DETECTED',
          text: 'I did not catch that. Tap below to type.',
        })
        window.setTimeout(() => setShowTypeBar(true), 1500)
        return
      }

      holdingRef.current = false

      // Preserve the original PHOENIX cadence: a short processing beat after hearing.
      setFrameState('processing', {
        label: 'PROCESSING REQUEST',
        text: `You: ${spoken}`,
      })

      window.setTimeout(() => processCommand(spoken), 320)
    }


    try {
      recognition.start()
    } catch (error) {
      holdingRef.current = false
      recognitionRef.current = null
      clearVoiceTimers()
      console.error('Speech recognition start failed:', error)
      const msg = 'The microphone could not start. Check browser permissions.'
      setFrameState('error', {
        label: 'MIC START FAILED',
        text: msg,
      })
      speak(msg)
    }
  }, [clearVoiceTimers, processCommand, scheduleAutoStopAfterSpeech, setFrameState, setShowTypeBar, stopRecognitionNow])

  useEffect(() => {
    function handleMessage(event) {
      const data = event?.data
      if (!data || typeof data !== 'object') return

      if (data.type === 'PHOENIX_OPEN_DOMAIN') {
        onOpenDomain?.(data.domain)
        return
      }

      if (data.type === 'PHOENIX_OPEN_COCKPIT') {
        onOpenDomain?.('finance')
        return
      }

      if (data.type === 'PHOENIX_VOICE_START') {
        startListening()
        return
      }

      if (data.type === 'PHOENIX_VOICE_STOP') {
        stopListening()
        return
      }

      if (data.type === 'PHOENIX_TEXT_SUBMIT') {
        processCommand(data.text)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
      clearVoiceTimers()
      try { recognitionRef.current?.abort() } catch {}
      stopSpeaking()
    }
  }, [clearVoiceTimers, onOpenDomain, processCommand, startListening, stopListening])

  function submitTypeInput() {
    const text = typeInput.trim()
    if (!text) return
    setTypeInput('')
    setShowTypeBar(false)
    processCommand(text)
  }

  return (
    <section className="phoenix-opening-shell" aria-label="PHOENIX opening screen">
      <iframe
        ref={iframeRef}
        title="PHOENIX opening screen"
        className="phoenix-opening-frame"
        src={src}
        allow="microphone"
        onLoad={() => {
          setFrameState('idle', {
            label: 'OPERATOR LINK STABLE',
            text: PHOENIX_WELCOME_BRIEF,
          })

          // Every time the PHOENIX home screen is entered, try to speak the brief.
          // If Chrome blocks autoplay, the first reactor hold retries it.
          window.setTimeout(() => announceWelcome('entry'), 650)
        }}
      />
      {showTypeBar && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
          background: 'rgba(1,6,8,.92)', borderTop: '1px solid rgba(32,216,236,.28)',
          backdropFilter: 'blur(12px)', padding: '12px 16px',
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <input
            autoFocus
            value={typeInput}
            onChange={e => setTypeInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitTypeInput() }}
            placeholder="TYPE TO PHOENIX…"
            style={{
              flex: 1, background: 'rgba(32,216,236,.06)', border: '1px solid rgba(32,216,236,.3)',
              borderRadius: 4, color: '#c9f6ff', fontFamily: 'inherit', fontSize: 12,
              letterSpacing: '.1em', padding: '10px 12px', outline: 'none',
            }}
          />
          <button
            onClick={submitTypeInput}
            style={{
              background: 'rgba(32,216,236,.12)', border: '1px solid rgba(32,216,236,.4)',
              borderRadius: 4, color: '#20d8ec', fontFamily: 'inherit', fontSize: 10,
              letterSpacing: '.14em', padding: '10px 14px', cursor: 'pointer',
            }}
          >SEND</button>
          <button
            onClick={() => setShowTypeBar(false)}
            style={{
              background: 'transparent', border: 'none', color: 'rgba(132,212,226,.5)',
              fontSize: 18, cursor: 'pointer', padding: '4px 8px', lineHeight: 1,
            }}
          >×</button>
        </div>
      )}
    </section>
  )
}
