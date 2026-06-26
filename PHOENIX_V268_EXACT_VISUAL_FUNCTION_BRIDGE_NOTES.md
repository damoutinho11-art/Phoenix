# PHOENIX v2.68 Exact Visual Lock + Functional Bridge

This version fixes the visual drift from v2.66/v2.67.

## What changed

- The home screen now uses the exact finalized PHOENIX v2.64 HTML again.
- The reactor design, position, title glow, module spacing, boot/cadence, and HUD feel are locked to v2.64.
- The visually-drifted direct React `HomeScreen` is no longer used as the home route.
- A small parent bridge connects the exact v2.64 screen to the real React app:
  - hold reactor -> React starts microphone
  - release reactor -> React stops microphone
  - React sends Listening / Hearing / Processing / Speaking state back to the visual screen
  - typed commands in the PHOENIX dock go through React too
- Voice cadence is restored to the original ElevenLabs `src/services/tts.js` settings.
- Browser speech fallback from v2.67 was removed because it changed the selected voice/cadence.
- API connectivity/CORS fixes from v2.67 are kept.

## Important

This version needs the backend server running for general chat answers.

However, local route commands such as:

- open finance
- open training
- open calendar
- open recovery

are handled locally first, so they can route without waiting for backend chat.

## Run

Terminal 1:

```powershell
cd "$env:USERPROFILE\Desktop\jarvis_v2_phoenix_v268_exact_visual_function_bridge_full_source\jarvis_v2"
py run_server.py
```

Terminal 2:

```powershell
cd "$env:USERPROFILE\Desktop\jarvis_v2_phoenix_v268_exact_visual_function_bridge_full_source\jarvis_v2\pwa"
npm install
npm run dev -- --host 127.0.0.1 --port 5180
```

Open:

```txt
http://127.0.0.1:5180/
```
