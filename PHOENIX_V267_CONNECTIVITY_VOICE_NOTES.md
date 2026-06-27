# PHOENIX v2.67 Connectivity + Voice Fix

This version fixes the problem seen in the screenshot:

- The app was running on `http://127.0.0.1:5180`
- The backend API is on `http://localhost:8000`
- The backend CORS list did not safely allow all local Vite ports
- The frontend API client was hardcoded instead of using `VITE_API_URL`
- TTS could fail silently when ElevenLabs/audio playback failed

## What changed

### Backend
- `jarvis/api/main.py`
  - Allows local dev ports including 5180
  - Adds `allow_origin_regex` for localhost/127.0.0.1 dev ports

### Frontend
- `pwa/src/api/client.js`
  - Uses `VITE_API_URL` from `.env`
  - Falls back to `http://localhost:8000`

### Voice
- `pwa/src/services/tts.js`
  - Keeps the selected ElevenLabs voice ID
  - Uses ElevenLabs first
  - Falls back to browser speech if ElevenLabs fails or the key is missing
  - `stopSpeaking()` now stops both ElevenLabs audio and browser speech fallback

### Home
- `pwa/src/components/HomeScreen.jsx`
  - Replaces vague "Connection error" with "Backend offline. Start the JARVIS server, then try again."
  - Still attempts to speak that error so you can test the voice path

## Run correctly

You need two terminals:

### Terminal 1 — backend

```powershell
cd "$env:USERPROFILE\Desktop\jarvis_v2_phoenix_v267_connectivity_voice_full_source\jarvis_v2"
py -m pip install -r requirements.txt
py run_server.py
```

### Terminal 2 — frontend

```powershell
cd "$env:USERPROFILE\Desktop\jarvis_v2_phoenix_v267_connectivity_voice_full_source\jarvis_v2\pwa"
npm install
npm run dev -- --host 127.0.0.1 --port 5180
```

Open:

```txt
http://127.0.0.1:5180/
```

## Shortcut

You can also run:

```powershell
cd "$env:USERPROFILE\Desktop\jarvis_v2_phoenix_v267_connectivity_voice_full_source\jarvis_v2"
powershell -ExecutionPolicy Bypass -File .\start_phoenix_all.ps1
```

## Important

Do not paste your API keys into ChatGPT.

Check that:

- root `.env` has `ANTHROPIC_API_KEY=...`
- `pwa/.env` has:
  - `VITE_API_URL=http://localhost:8000`
  - `VITE_ELEVENLABS_API_KEY=...`
