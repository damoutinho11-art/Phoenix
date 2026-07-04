"""Gmail read-only API routes. Routers call gmail_client; no business logic here."""

from __future__ import annotations

from fastapi import APIRouter, Query

from jarvis.domains.calendar import gmail_client, google_oauth

router = APIRouter()

_SETUP_STEPS = [
    "Create a Google Cloud OAuth client and enable the Gmail API.",
    "Set PHOENIX_GOOGLE_CLIENT_ID, PHOENIX_GOOGLE_CLIENT_SECRET, PHOENIX_GOOGLE_REDIRECT_URI.",
    "Set PHOENIX_TOKEN_ENCRYPTION_KEY to a generated Fernet key.",
    "Optionally set PHOENIX_GMAIL_DEFAULT_QUERY to scope the default search.",
    "Visit /auth/google/login to connect (read-only Gmail scope only).",
]


@router.get("/status")
def gmail_status() -> dict:
    """Safe Gmail connector status. No network call, no secrets."""
    configured = google_oauth.is_configured()
    connection = google_oauth.connection_status()
    return {
        "mode": "gmail_read_only",
        "configured": configured,
        "connected": connection["connected"],
        "default_query": gmail_client.default_query(),
        "safety": {
            "read_only": True,
            "send_disabled": True,
            "modify_disabled": True,
            "messages_stored": False,
        },
        "setup_steps": _SETUP_STEPS if not (configured and connection["connected"]) else [],
    }


@router.get("/search")
def gmail_search(q: str | None = Query(default=None), max_results: int = Query(10, ge=1, le=50)) -> dict:
    """Search read-only Gmail messages (metadata + snippet only).

    Always returns 200. When not connected/configured, returns an empty list
    rather than an error so the UI can render a "not connected" state.
    """
    configured = google_oauth.is_configured()
    connection = google_oauth.connection_status()

    if not configured or not connection["connected"]:
        return {
            "configured": configured,
            "connected": False,
            "query": q or gmail_client.default_query(),
            "message_count": 0,
            "messages": [],
            "fetch_warnings": ["Gmail is not connected."],
            "read_only_notice": "Read-only. No sends, no modifications, no messages stored.",
        }

    messages, fetch_warnings = gmail_client.search_messages(query=q, max_results=max_results)
    return {
        "configured": configured,
        "connected": True,
        "query": q or gmail_client.default_query(),
        "message_count": len(messages),
        "messages": messages,
        "fetch_warnings": fetch_warnings,
        "read_only_notice": "Read-only. No sends, no modifications, no messages stored.",
    }
