"""Google OAuth2 boundary for Phoenix's read-only Calendar + Gmail connectors.

READ ONLY — DO NOT ADD WRITE SCOPES.

SCOPES is intentionally limited to calendar.readonly and gmail.readonly. Do not
add calendar.events, gmail.modify, gmail.send, or any other write/mutate scope
to this module, ever, under any code path, including future ones.

This module never logs a raw access token, refresh token, client_secret, or
authorization code. Functions here that touch decrypted credentials are meant
to be called only from google_calendar_client.py / gmail_client.py, never
returned directly to an API response.
"""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timezone
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
]

_CLIENT_ID_ENV = "PHOENIX_GOOGLE_CLIENT_ID"
_CLIENT_SECRET_ENV = "PHOENIX_GOOGLE_CLIENT_SECRET"
_REDIRECT_URI_ENV = "PHOENIX_GOOGLE_REDIRECT_URI"
_ENCRYPTION_KEY_ENV = "PHOENIX_TOKEN_ENCRYPTION_KEY"

_GOOGLE_AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
_GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"


def _client_id() -> str | None:
    return os.getenv(_CLIENT_ID_ENV, "").strip() or None


def _client_secret() -> str | None:
    return os.getenv(_CLIENT_SECRET_ENV, "").strip() or None


def _redirect_uri() -> str | None:
    return os.getenv(_REDIRECT_URI_ENV, "").strip() or None


def is_configured() -> bool:
    """True only if client_id, client_secret, and redirect_uri are all set."""
    return bool(_client_id() and _client_secret() and _redirect_uri())


def _client_config() -> dict[str, Any]:
    return {
        "web": {
            "client_id": _client_id(),
            "client_secret": _client_secret(),
            "auth_uri": _GOOGLE_AUTH_URI,
            "token_uri": _GOOGLE_TOKEN_URI,
            "redirect_uris": [_redirect_uri()],
        }
    }


def generate_state_token() -> str:
    """Generate a random CSRF state token for the OAuth login flow."""
    return secrets.token_urlsafe(32)


def build_authorization_url(state: str) -> tuple[str, str]:
    """Build the Google OAuth2 consent screen URL. Requires is_configured().

    Returns (auth_url, code_verifier). google-auth-oauthlib's Flow uses PKCE
    and auto-generates a fresh code_verifier per Flow instance (used to derive
    the code_challenge embedded in auth_url). Google's token endpoint requires
    the *exact same* code_verifier at the /callback exchange step, but a Flow
    object is not persisted across the login/callback request round-trip — so
    the caller (google_auth router) must persist this code_verifier
    server-side (alongside the CSRF state token) and pass it back into
    exchange_code_for_tokens(). Without this, Google rejects the exchange with
    "(invalid_grant) Missing code verifier."
    """
    if not is_configured():
        raise ValueError("Google OAuth is not configured.")
    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=_redirect_uri())
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )
    return auth_url, flow.code_verifier


def exchange_code_for_tokens(code: str, code_verifier: str) -> Credentials:
    """Exchange an authorization code for credentials. Never logs the code or tokens.

    code_verifier must be the exact value returned by build_authorization_url()
    for this same login attempt (see that function's docstring for why).
    """
    if not is_configured():
        raise ValueError("Google OAuth is not configured.")
    flow = Flow.from_client_config(
        _client_config(),
        scopes=SCOPES,
        redirect_uri=_redirect_uri(),
        code_verifier=code_verifier,
        autogenerate_code_verifier=False,
    )
    flow.fetch_token(code=code)
    return flow.credentials


def _fernet() -> Fernet:
    key = os.getenv(_ENCRYPTION_KEY_ENV, "").strip()
    if not key:
        raise ValueError(f"{_ENCRYPTION_KEY_ENV} is not configured.")
    return Fernet(key.encode("utf-8"))


def encrypt_token(raw_token: str) -> str:
    return _fernet().encrypt(raw_token.encode("utf-8")).decode("utf-8")


def decrypt_token(encrypted_token: str) -> str:
    try:
        return _fernet().decrypt(encrypted_token.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Stored Google token could not be decrypted.") from exc


def credentials_to_stored_row(credentials: Credentials) -> dict[str, Any]:
    """Encrypt credentials into the shape database.save_google_oauth_tokens expects."""
    expiry = credentials.expiry.isoformat() if credentials.expiry else ""
    return {
        "access_token_encrypted": encrypt_token(credentials.token or ""),
        "refresh_token_encrypted": encrypt_token(credentials.refresh_token or ""),
        "token_expiry": expiry,
        "scopes": list(credentials.scopes or SCOPES),
    }


def credentials_from_stored_row(row: dict[str, Any]) -> Credentials:
    """Rebuild in-memory Credentials from an encrypted stored row. Never expose the result."""
    access_token = decrypt_token(row["access_token_encrypted"])
    refresh_token = decrypt_token(row["refresh_token_encrypted"])
    scopes = str(row.get("scopes", "")).split()
    return Credentials(
        token=access_token or None,
        refresh_token=refresh_token or None,
        token_uri=_GOOGLE_TOKEN_URI,
        client_id=_client_id(),
        client_secret=_client_secret(),
        scopes=scopes or SCOPES,
    )


def refresh_if_needed(credentials: Credentials) -> Credentials:
    """Refresh credentials in-memory using the refresh_token if expired. Never logs tokens."""
    if credentials.valid:
        return credentials
    if not credentials.refresh_token:
        raise ValueError("No refresh_token available; user must reconnect Google.")
    credentials.refresh(GoogleAuthRequest())
    return credentials


def revoke_credentials(credentials: Credentials) -> bool:
    """Best-effort revoke of the stored token with Google. Never raises."""
    try:
        import requests  # noqa: PLC0415

        token = credentials.refresh_token or credentials.token
        if not token:
            return False
        response = requests.post(
            "https://oauth2.googleapis.com/revoke",
            params={"token": token},
            headers={"content-type": "application/x-www-form-urlencoded"},
            timeout=10,
        )
        return response.status_code == 200
    except Exception:
        return False


def token_expiry_iso(credentials: Credentials) -> str | None:
    if credentials.expiry is None:
        return None
    expiry = credentials.expiry
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    return expiry.isoformat()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds")


def store_credentials(credentials: Credentials) -> dict[str, Any]:
    """Encrypt and persist credentials. The only place tokens are written to SQLite."""
    from jarvis.data import database  # noqa: PLC0415

    row = credentials_to_stored_row(credentials)
    return database.save_google_oauth_tokens(
        access_token_encrypted=row["access_token_encrypted"],
        refresh_token_encrypted=row["refresh_token_encrypted"],
        token_expiry=row["token_expiry"],
        scopes=row["scopes"],
    )


def load_stored_credentials() -> Credentials | None:
    """Load and decrypt stored credentials, refreshing if expired. Never returned to API responses."""
    from jarvis.data import database  # noqa: PLC0415

    row = database.get_google_oauth_tokens()
    if not row:
        return None
    credentials = credentials_from_stored_row(row)
    refreshed = refresh_if_needed(credentials)
    if refreshed.token != credentials.token:
        store_credentials(refreshed)
    return refreshed


def connection_status() -> dict[str, Any]:
    """Safe, secret-free connection status for status endpoints."""
    from jarvis.data import database  # noqa: PLC0415

    row = database.get_google_oauth_tokens()
    if not row:
        return {"connected": False, "connected_at": None, "token_expiry": None, "scopes": []}
    return {
        "connected": True,
        "connected_at": row.get("connected_at"),
        "token_expiry": row.get("token_expiry"),
        "scopes": str(row.get("scopes", "")).split(),
    }


def disconnect() -> bool:
    """Best-effort revoke with Google, then delete the local encrypted row."""
    from jarvis.data import database  # noqa: PLC0415

    row = database.get_google_oauth_tokens()
    if row:
        try:
            credentials = credentials_from_stored_row(row)
            revoke_credentials(credentials)
        except Exception:
            pass
    return database.delete_google_oauth_tokens()
