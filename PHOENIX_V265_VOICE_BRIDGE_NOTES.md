# PHOENIX v2.65 Voice Bridge Fix

This update fixes the previous iframe-only integration.

## Problem fixed

The v2.64 home screen looked correct, but it was isolated inside an iframe. That meant it did not use the real React app voice pipeline, selected ElevenLabs voice, or project chat backend.

## What changed

- `PhoenixOpeningScreen.jsx` now owns:
  - SpeechRecognition microphone capture
  - real `postJarvisChat(...)` backend calls
  - real `speak(...)` ElevenLabs TTS from `src/services/tts.js`
- `public/phoenix/opening.html` now acts as the visual cockpit only.
- Reactor hold/release is bridged to React:
  - Hold -> parent starts mic
  - Release -> parent stops mic
  - Parent sends UI state back to the iframe
- Typed commands inside the PHOENIX dock are also bridged to React.
- The iframe's local browser speech synthesis is cancelled so it does not use the wrong voice.

## Run

```powershell
cd pwa
npm install
npm run build
npm run dev
```

## Important

For ElevenLabs voice to work, your `.env` / Vite env must still include:

```txt
VITE_ELEVENLABS_API_KEY=...
```

The selected voice is still controlled by `src/services/tts.js`.
