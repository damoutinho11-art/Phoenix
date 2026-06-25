const VOICE_ID = 'onwK4e9ZLuTAKqWW03F9'
const API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY

let currentAudio = null

// speak(text, { onEnd }) — onEnd fires when audio finishes or on error
export async function speak(text, { onEnd } = {}) {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }

  const clean = text
    // Currency — convert before anything else
    .replace(/€(\d+)\.(\d{2})/g, '$1 euros and $2 cents')
    .replace(/€(\d+)/g, '$1 euros')

    // Acronyms — spell out or add spaces so TTS reads naturally
    .replace(/\bBTC-EUR\b/g, 'Bitcoin')
    .replace(/\bBTC\b/g, 'Bitcoin')
    .replace(/\bETFs\b/g, 'E T Fs')
    .replace(/\bETF\b/g, 'E T F')
    .replace(/\bLHV\b/g, 'L H V')
    .replace(/\bVIX\b/g, 'V I X')
    .replace(/\bTTS\b/g, 'T T S')
    .replace(/\bPWA\b/g, 'P W A')
    .replace(/\bSTT\b/g, 'S T T')
    .replace(/\bAPI\b/g, 'A P I')

    // Percentages
    .replace(/(\d+\.\d+)%/g, '$1 percent')
    .replace(/(\d+)%/g, '$1 percent')

    // Remove markdown
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/^[-•·→]\s/gm, '')
    .replace(/→/g, ', ')
    .replace(/•/g, ', ')
    .replace(/[*#_~`|]/g, '')

    // Clean up spacing
    .replace(/\n+/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  if (!clean) { onEnd?.(); return }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': API_KEY,
        },
        body: JSON.stringify({
          text: clean,
          model_id: 'eleven_multilingual_v2',
          output_format: 'mp3_44100_128',
          voice_settings: {
            stability: 0.35,
            similarity_boost: 0.85,
            style: 0.40,
            use_speaker_boost: true,
            speed: 1.15,
          },
        }),
      }
    )

    if (!response.ok) throw new Error(`ElevenLabs ${response.status}`)

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    currentAudio = new Audio(url)

    // Wait for audio to be fully loaded before playing
    await new Promise((resolve, reject) => {
      currentAudio.oncanplaythrough = resolve
      currentAudio.onerror = reject
      currentAudio.load()
    })

    currentAudio.play()

    currentAudio.onended = () => {
      URL.revokeObjectURL(url)
      currentAudio = null
      if (onEnd) onEnd()
    }

    return currentAudio
  } catch (err) {
    console.error('TTS failed:', err)
    onEnd?.()
  }
}

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
}

export function isSpeaking() {
  return currentAudio !== null && !currentAudio.paused
}
