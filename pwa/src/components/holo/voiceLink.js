// Browser voice for the Holo shell: Web Speech API in (SpeechRecognition) and
// out (speechSynthesis). No keys, no network. Everything degrades to "not
// supported" honestly instead of pretending to listen.

export const VOICE_PREF_KEY = 'phoenix-voice-v1'

// Turn PHOENIX's on-screen text into something a synthetic voice reads well.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const spokenDate = (_, y, m, d) => `${Number(d)} ${MONTHS[Number(m) - 1] || m}`

export function speakable(text) {
  return String(text || '')
    .replace(/\b(20\d{2})-(\d{2})-(\d{2})\b/g, spokenDate)
    .replace(/€(\d[\d,]*)\.(\d{2})\b/g, '$1 euros $2')
    .replace(/€(\d[\d,]*)/g, '$1 euros')
    .replace(/\bBTC-EUR\b/g, 'Bitcoin').replace(/\bBTC\b/g, 'Bitcoin')
    .replace(/\bXNAS\.DE\b/g, 'the Nasdaq 100 E T F').replace(/\bIS3Q\.DE\b/g, 'the Quality E T F')
    .replace(/\bETFs\b/g, 'E T Fs').replace(/\bETF\b/g, 'E T F')
    .replace(/\bLHV\b/g, 'L H V').replace(/\bPWA\b/g, 'P W A')
    .replace(/\bW(\d{1,2}) (\d{4})\b/g, 'week $1')
    .replace(/\bkcal\b/gi, 'calories')
    .replace(/(\d+(?:\.\d+)?)\s*g\b(?!\w)/g, '$1 grams')
    .replace(/\bkg\b/gi, 'kilograms')
    .replace(/(\d+(?:\.\d+)?)%/g, '$1 percent')
    .replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, m) => (m === '00' ? `${Number(h)} o'clock` : `${Number(h)} ${m}`))
    .replace(/\s[—–-]\s/g, ', ')
    .replace(/[*#_~`|•▸◉]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function speechSupport(win = globalThis) {
  return {
    listen: Boolean(win.SpeechRecognition || win.webkitSpeechRecognition),
    speak: Boolean(win.speechSynthesis && win.SpeechSynthesisUtterance),
  }
}

// Prefer a natural English voice when the platform offers one.
export function pickVoice(voices) {
  const list = Array.isArray(voices) ? voices : []
  const english = list.filter(v => /^en(-|_)?(GB|US|AU|IE)?/i.test(v.lang || ''))
  const pool = english.length ? english : list
  const score = v => (/natural|neural|premium|enhanced/i.test(v.name) ? 3 : 0)
    + (/google|microsoft|siri|samantha|daniel/i.test(v.name) ? 1 : 0)
    + (/en-GB/i.test(v.lang) ? 1 : 0)
    + (v.localService ? 0.5 : 0)
  return pool.slice().sort((a, b) => score(b) - score(a))[0] || null
}

export function createSpeaker(win = globalThis) {
  const synth = win.speechSynthesis
  if (!synth || !win.SpeechSynthesisUtterance) return null
  return {
    speak(text, { onEnd, rate = 1.0, pitch = 0.95 } = {}) {
      const clean = speakable(text)
      if (!clean) { onEnd?.(); return }
      synth.cancel()
      const u = new win.SpeechSynthesisUtterance(clean)
      const voice = pickVoice(synth.getVoices())
      if (voice) { u.voice = voice; u.lang = voice.lang }
      else u.lang = 'en-GB'
      u.rate = rate; u.pitch = pitch
      u.onend = () => onEnd?.()
      u.onerror = () => onEnd?.()
      synth.speak(u)
    },
    stop() { synth.cancel() },
  }
}

// Hold-to-talk: start() on pointer down, stop() on pointer up; the final
// transcript arrives through onResult. onError receives a short reason.
export function createListener(win = globalThis, { lang = 'en-GB', onResult, onError, onPartial } = {}) {
  const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition
  if (!Ctor) return null
  let rec = null
  let finalText = ''
  return {
    start() {
      finalText = ''
      rec = new Ctor()
      rec.lang = lang
      rec.continuous = true
      rec.interimResults = true
      rec.onresult = event => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i]
          if (r.isFinal) finalText += r[0].transcript
          else interim += r[0].transcript
        }
        onPartial?.((finalText + ' ' + interim).trim())
      }
      rec.onerror = event => onError?.(event.error || 'unknown')
      rec.onend = () => { const text = finalText.trim(); rec = null; onResult?.(text) }
      try { rec.start() } catch (error) { onError?.(error?.message || 'start_failed') }
    },
    stop() { try { rec?.stop() } catch { /* already stopped */ } },
    active() { return rec !== null },
  }
}
