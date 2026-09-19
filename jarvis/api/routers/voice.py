"""Text-to-speech proxy.

The ElevenLabs key lives only in the deployment environment; the PWA sends
text and receives audio. Requests are private (access-control middleware),
short, and never logged. Without a key the route reports 'unconfigured' so
the client can fall back to the browser voice instead of failing.
"""
from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter()

MAX_CHARS = 1200
DEFAULT_VOICE_ID = "onwK4e9ZLuTAKqWW03F9"
DEFAULT_MODEL_ID = "eleven_turbo_v2_5"
ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"


def _config() -> dict:
    key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    return {
        "configured": bool(key),
        "provider": "elevenlabs" if key else None,
        "voice_id": os.getenv("ELEVENLABS_VOICE_ID", DEFAULT_VOICE_ID).strip() or DEFAULT_VOICE_ID,
        "model_id": os.getenv("ELEVENLABS_MODEL_ID", DEFAULT_MODEL_ID).strip() or DEFAULT_MODEL_ID,
        "_key": key,
    }


class SpeakRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    text: str = Field(min_length=1, max_length=MAX_CHARS)


@router.get("/status")
def voice_status() -> dict:
    cfg = _config()
    return {"configured": cfg["configured"], "provider": cfg["provider"], "max_chars": MAX_CHARS,
            "voice_id": cfg["voice_id"] if cfg["configured"] else None}


@router.post("/speak")
async def voice_speak(payload: SpeakRequest) -> Response:
    cfg = _config()
    if not cfg["configured"]:
        raise HTTPException(status_code=503, detail="Voice synthesis is not configured.")
    body = {
        "text": payload.text,
        "model_id": cfg["model_id"],
        "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.15, "use_speaker_boost": True},
    }
    headers = {"xi-api-key": cfg["_key"], "Content-Type": "application/json", "Accept": "audio/mpeg"}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            upstream = await client.post(ELEVENLABS_URL.format(voice_id=cfg["voice_id"]), json=body, headers=headers)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Voice provider unreachable.")
    if upstream.status_code == 401:
        raise HTTPException(status_code=502, detail="Voice provider rejected the configured key.")
    if upstream.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Voice provider error ({upstream.status_code}).")
    return Response(content=upstream.content, media_type="audio/mpeg",
                    headers={"Cache-Control": "no-store, private"})
