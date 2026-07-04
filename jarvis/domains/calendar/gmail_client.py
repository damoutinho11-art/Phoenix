"""Gmail read-only client.

READ ONLY — DO NOT ADD WRITE METHODS.

This module calls users().messages().list() and users().messages().get()
(format="metadata" only) — it never calls send, modify, trash, or delete, and
none of those methods are imported or referenced anywhere in this file.

Nothing from Gmail is stored in SQLite by default: every search is a live,
on-demand read. Only metadata + snippet are fetched, never the raw MIME body.
"""

from __future__ import annotations

import os
import re
from typing import Any

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from jarvis.domains.calendar import google_oauth

_DEFAULT_QUERY_ENV = "PHOENIX_GMAIL_DEFAULT_QUERY"
_DEFAULT_QUERY = "plaan.opera.ee OR rehearsal OR performance OR schedule"
_SCHEDULE_KEYWORDS = re.compile(r"rehearsal|performance|schedule|proov|etendus|opera", re.IGNORECASE)


def default_query() -> str:
    return os.getenv(_DEFAULT_QUERY_ENV, "").strip() or _DEFAULT_QUERY


def _header_value(headers: list[dict[str, str]], name: str) -> str | None:
    for header in headers:
        if header.get("name", "").lower() == name.lower():
            return header.get("value")
    return None


def _normalize_message(raw: dict[str, Any]) -> dict[str, Any]:
    headers = raw.get("payload", {}).get("headers", [])
    subject = _header_value(headers, "Subject") or "(no subject)"
    sender = _header_value(headers, "From") or ""
    received_at = _header_value(headers, "Date")
    snippet = raw.get("snippet", "")
    haystack = f"{subject} {snippet}"
    return {
        "id": raw.get("id", ""),
        "subject": subject,
        "from": sender,
        "snippet": snippet,
        "received_at": received_at,
        "has_schedule_keywords": bool(_SCHEDULE_KEYWORDS.search(haystack)),
    }


def _search_with_credentials(credentials: Credentials, *, query: str, max_results: int) -> list[dict[str, Any]]:
    service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
    list_result = (
        service.users()
        .messages()
        .list(userId="me", q=query, maxResults=max_results)
        .execute()
    )
    message_ids = [m["id"] for m in list_result.get("messages", [])]

    normalized: list[dict[str, Any]] = []
    for message_id in message_ids:
        raw = (
            service.users()
            .messages()
            .get(userId="me", id=message_id, format="metadata", metadataHeaders=["Subject", "From", "Date"])
            .execute()
        )
        normalized.append(_normalize_message(raw))
    return normalized


def search_messages(query: str | None = None, max_results: int = 10) -> tuple[list[dict[str, Any]], list[str]]:
    """Search read-only Gmail messages (metadata + snippet only).

    Returns (messages, fetch_warnings). Never raises; on any failure returns an
    empty list with a warning describing what happened.
    """
    safe_query = (query or "").strip() or default_query()
    safe_max_results = max(1, min(int(max_results or 10), 50))

    credentials = google_oauth.load_stored_credentials()
    if credentials is None:
        return [], ["Gmail is not connected."]

    try:
        return _search_with_credentials(credentials, query=safe_query, max_results=safe_max_results), []
    except HttpError as exc:
        if exc.resp is not None and exc.resp.status == 401:
            try:
                refreshed = google_oauth.refresh_if_needed(credentials)
                google_oauth.store_credentials(refreshed)
                return _search_with_credentials(refreshed, query=safe_query, max_results=safe_max_results), []
            except Exception as retry_exc:
                return [], [f"Gmail search failed after token refresh attempt: {retry_exc}"]
        return [], [f"Gmail search failed: {exc}"]
    except Exception as exc:
        return [], [f"Gmail search failed: {exc}"]
