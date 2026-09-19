import assert from 'node:assert/strict'
import test from 'node:test'
import { speakable, pickVoice, speechSupport, createSpeaker, createListener, createServerSpeaker } from './voiceLink.js'

test('speakable turns PHOENIX text into something a voice reads naturally', () => {
  assert.equal(speakable('W38 2026 is deployed. BTC-EUR €28.14, XNAS.DE €178.91 — 2,000 kcal open at 19:00.'),
    'week 38 is deployed. Bitcoin 28 euros 14, the Nasdaq 100 E T F 178 euros 91, 2,000 calories open at 19 o\'clock.')
  assert.equal(speakable('Protein 175 g · 80% in band'), 'Protein 175 grams · 80 percent in band')
  assert.equal(speakable('**bold** • item'), 'bold  item'.replace(/\s{2,}/g, ' '))
  assert.equal(speakable(''), '')
  assert.equal(speakable('Session on 2026-09-19 conflicts'), 'Session on 19 September conflicts')
})

test('pickVoice prefers natural English voices and falls back gracefully', () => {
  const voices = [
    { name: 'Google Deutsch', lang: 'de-DE' },
    { name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
    { name: 'Google UK English Male', lang: 'en-GB' },
  ]
  assert.match(pickVoice(voices).name, /Natural/)
  assert.equal(pickVoice([{ name: 'Only', lang: 'et-EE' }]).name, 'Only')
  assert.equal(pickVoice([]), null)
})

test('missing browser APIs are reported, not faked', () => {
  assert.deepEqual(speechSupport({}), { listen: false, speak: false })
  assert.equal(createSpeaker({}), null)
  assert.equal(createListener({}), null)
})

test('listener collects final transcript across results and reports it on end', () => {
  let handlers = {}
  class FakeRec { start() { handlers = this } stop() { this.onend() } }
  const results = []
  const listener = createListener({ webkitSpeechRecognition: FakeRec }, { onResult: t => results.push(t) })
  listener.start()
  handlers.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'open ' }], { isFinal: true })] })
  handlers.onresult({ resultIndex: 1, results: [null, Object.assign([{ transcript: 'finance' }], { isFinal: true })] })
  listener.stop()
  assert.deepEqual(results, ['open finance'])
  assert.equal(listener.active(), false)
})

test('speaker cancels current speech and applies the chosen voice', () => {
  const spoken = []
  const win = {
    speechSynthesis: { cancel() { spoken.push('cancel') }, getVoices: () => [{ name: 'Google UK English Female', lang: 'en-GB' }], speak(u) { spoken.push(u) } },
    SpeechSynthesisUtterance: class { constructor(t) { this.text = t } },
  }
  const speaker = createSpeaker(win)
  speaker.speak('€5 test')
  assert.equal(spoken[0], 'cancel')
  assert.equal(spoken[1].text, '5 euros test')
  assert.equal(spoken[1].voice.lang, 'en-GB')
})

test('server speaker uses ElevenLabs when configured and caches repeated lines', async () => {
  const played = []; let synthCalls = 0
  class Audio { constructor(url) { this.url = url; played.push(url) } play() { this.onended?.(); return Promise.resolve() } pause() {} }
  const win = { Audio, URL: { createObjectURL: () => `blob:${++synthCalls}`, revokeObjectURL() {} } }
  const speaker = createServerSpeaker({ status: async () => ({ configured: true }), synthesize: async () => new Uint8Array([1]), fallback: null, win })
  await speaker.speak('Week 38 is deployed.')
  await speaker.speak('Week 38 is deployed.')
  assert.deepEqual(played, ['blob:1', 'blob:1'])
  assert.equal(speaker.provider(), 'elevenlabs')
})

test('server speaker falls back to the browser voice when unconfigured or failing', async () => {
  const fallbackSpoken = []
  const fallback = { speak: t => fallbackSpoken.push(t), stop() {} }
  const unconfigured = createServerSpeaker({ status: async () => ({ configured: false }), synthesize: async () => { throw new Error('no') }, fallback, win: {} })
  await unconfigured.speak('hello')
  assert.deepEqual(fallbackSpoken, ['hello'])
  assert.equal(unconfigured.provider(), 'browser')
  const failing = createServerSpeaker({ status: async () => ({ configured: true }), synthesize: async () => { throw Object.assign(new Error('502'), { status: 502 }) }, fallback, win: { URL: { createObjectURL() {}, revokeObjectURL() {} } } })
  await failing.speak('again')
  assert.deepEqual(fallbackSpoken, ['hello', 'again'])
})
