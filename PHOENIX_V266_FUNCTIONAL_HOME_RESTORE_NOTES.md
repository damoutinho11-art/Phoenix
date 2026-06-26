# PHOENIX v2.66 Functional Home Restore

This fixes the iframe mistake.

## What changed

- App home now uses the real `HomeScreen` again, not iframe-only `PhoenixOpeningScreen`.
- The real mic logic is restored.
- The real ElevenLabs `speak(...)` path is restored.
- Assistant replies from home now speak using the selected voice in `src/services/tts.js`.
- Interim/final speech recognition capture is more robust.
- The v2.64/v2.63 visual language is applied directly to `HomeScreen.css`.
- Reactor image asset is copied to `pwa/public/phoenix/reactor_core_centered_crop_v230.png`.
- Bottom-right cockpit/finance button is hidden.
- Side cards can open app modules.

## Run

```powershell
cd pwa
npm install
npm run build
npm run dev
```
