"""Google OAuth2 HTTP endpoints. READ ONLY — see google_oauth.py for scope contract.

Routers call the google_oauth connector module; no business/crypto logic lives here.
"""

from __future__ import annotations

import os
import time

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse

from jarvis.domains.calendar import google_oauth

router = APIRouter()

_STATE_TTL_SECONDS = 600
# Each pending login stores its PKCE code_verifier alongside the CSRF state
# token so /callback can reuse the exact same verifier that produced the
# code_challenge sent to Google in /login. PKCE requires the verifier to match
# byte-for-byte across both steps; a fresh Flow object per request would
# otherwise generate a new, mismatched verifier. See
# google_oauth.build_authorization_url() for the full explanation.
_pending_states: dict[str, dict[str, float | str]] = {}


def _public_frontend_url() -> str:
    return os.getenv("PHOENIX_PUBLIC_FRONTEND_URL", "").strip().rstrip("/") or "/"


def _prune_states() -> None:
    now = time.time()
    expired = [state for state, entry in _pending_states.items() if now - entry["created"] > _STATE_TTL_SECONDS]
    for state in expired:
        _pending_states.pop(state, None)


@router.get("/login")
def google_login() -> RedirectResponse:
    """Redirect to Google's consent screen. Never crashes when not configured."""
    if not google_oauth.is_configured():
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured. Set PHOENIX_GOOGLE_CLIENT_ID, "
            "PHOENIX_GOOGLE_CLIENT_SECRET, and PHOENIX_GOOGLE_REDIRECT_URI.",
        )
    _prune_states()
    state = google_oauth.generate_state_token()
    auth_url, code_verifier = google_oauth.build_authorization_url(state)
    _pending_states[state] = {"created": time.time(), "code_verifier": code_verifier}
    return RedirectResponse(url=auth_url, status_code=302)


@router.get("/callback")
def google_callback(code: str | None = Query(default=None), state: str | None = Query(default=None)) -> RedirectResponse:
    """Exchange the authorization code for tokens, encrypt, and store them.

    Rejects missing/invalid state to prevent CSRF. Never includes the raw code
    or tokens in any response or redirect.
    """
    if not google_oauth.is_configured():
        raise HTTPException(status_code=503, detail="Google OAuth is not configured.")
    _prune_states()
    if not state or state not in _pending_states:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")
    pending = _pending_states.pop(state)
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code.")

    try:
        credentials = google_oauth.exchange_code_for_tokens(code, pending["code_verifier"])
        google_oauth.store_credentials(credentials)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Google OAuth token exchange failed: {exc}") from exc

    return RedirectResponse(url=f"{_public_frontend_url()}/calendar?connected=google", status_code=302)


@router.post("/disconnect")
def google_disconnect() -> dict:
    """Revoke the stored Google token (best effort) and delete the local row.

    POST-only, destructive-to-local-state action. Requires no body.
    """
    deleted = google_oauth.disconnect()
    return {"disconnected": True, "had_connection": deleted, "read_only_notice": "No Google/Gmail data was ever writable; this only removes Phoenix's stored access."}


@router.get("/status")
def google_status() -> dict:
    """Safe status object. Never includes secrets, tokens, or client_secret."""
    configured = google_oauth.is_configured()
    connection = google_oauth.connection_status()
    setup_steps = [
        "Create a Google Cloud OAuth client (Web application type).",
        "Enable the Google Calendar API and Gmail API for the project.",
        "Set PHOENIX_GOOGLE_CLIENT_ID, PHOENIX_GOOGLE_CLIENT_SECRET, PHOENIX_GOOGLE_REDIRECT_URI.",
        "Set PHOENIX_TOKEN_ENCRYPTION_KEY to a generated Fernet key.",
        "Visit /auth/google/login to connect your account (read-only scopes only).",
    ]
    return {
        "mode": "google_oauth_read_only",
        "configured": configured,
        "connected": connection["connected"],
        "connected_at": connection["connected_at"],
        "token_expiry": connection["token_expiry"],
        "scopes_granted": connection["scopes"],
        "safety": {
            "read_only": True,
            "write_scopes_requested": False,
            "credentials_stored": connection["connected"],
            "credentials_encrypted": True,
        },
        "setup_steps": setup_steps if not configured else [],
    }
