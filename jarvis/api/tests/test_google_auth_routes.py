"""Tests for /auth/google routes. Runs green with NO real Google credentials.

This test suite explicitly clears any Google OAuth env vars so it never
depends on (or leaks) real credentials that may be present in a local .env.
"""

import base64
import hashlib
import os
import unittest
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qsl, urlparse

from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.data import database
from jarvis.domains.calendar import google_oauth

client = TestClient(app)

_ENV_KEYS = [
    "PHOENIX_GOOGLE_CLIENT_ID",
    "PHOENIX_GOOGLE_CLIENT_SECRET",
    "PHOENIX_GOOGLE_REDIRECT_URI",
    "PHOENIX_TOKEN_ENCRYPTION_KEY",
]


class _EnvIsolatedTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._saved = {key: os.environ.pop(key, None) for key in _ENV_KEYS}
        database.delete_google_oauth_tokens()

    def tearDown(self) -> None:
        for key, value in self._saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        database.delete_google_oauth_tokens()


class GoogleLoginRouteTests(_EnvIsolatedTestCase):
    def test_login_returns_clear_error_when_not_configured(self) -> None:
        response = client.get("/auth/google/login", follow_redirects=False)
        self.assertEqual(response.status_code, 503)

    def test_login_redirects_when_configured(self) -> None:
        os.environ["PHOENIX_GOOGLE_CLIENT_ID"] = "test-client-id"
        os.environ["PHOENIX_GOOGLE_CLIENT_SECRET"] = "test-client-secret"
        os.environ["PHOENIX_GOOGLE_REDIRECT_URI"] = "https://example.com/auth/google/callback"
        response = client.get("/auth/google/login", follow_redirects=False)
        self.assertEqual(response.status_code, 302)
        self.assertIn("accounts.google.com", response.headers["location"])


class GoogleCallbackRouteTests(_EnvIsolatedTestCase):
    def test_callback_rejects_missing_state(self) -> None:
        os.environ["PHOENIX_GOOGLE_CLIENT_ID"] = "test-client-id"
        os.environ["PHOENIX_GOOGLE_CLIENT_SECRET"] = "test-client-secret"
        os.environ["PHOENIX_GOOGLE_REDIRECT_URI"] = "https://example.com/auth/google/callback"
        response = client.get("/auth/google/callback", params={"code": "fake-code"})
        self.assertEqual(response.status_code, 400)

    def test_callback_rejects_invalid_state(self) -> None:
        os.environ["PHOENIX_GOOGLE_CLIENT_ID"] = "test-client-id"
        os.environ["PHOENIX_GOOGLE_CLIENT_SECRET"] = "test-client-secret"
        os.environ["PHOENIX_GOOGLE_REDIRECT_URI"] = "https://example.com/auth/google/callback"
        response = client.get(
            "/auth/google/callback",
            params={"code": "fake-code", "state": "not-a-real-state-token"},
        )
        self.assertEqual(response.status_code, 400)

    def test_callback_not_configured_returns_error_not_crash(self) -> None:
        response = client.get(
            "/auth/google/callback",
            params={"code": "fake-code", "state": "whatever"},
        )
        self.assertEqual(response.status_code, 503)

    def test_callback_reuses_login_code_verifier_for_pkce(self) -> None:
        """Regression test for (invalid_grant) Missing code verifier.

        google-auth-oauthlib's Flow auto-generates a fresh, random
        code_verifier per Flow instance. /login and /callback build separate
        Flow objects, so the code_challenge sent to Google during /login must
        be derivable from the exact code_verifier /callback later hands to
        exchange_code_for_tokens(). This asserts that end-to-end via the real
        PKCE math instead of just checking that some value was passed.
        """
        os.environ["PHOENIX_GOOGLE_CLIENT_ID"] = "test-client-id"
        os.environ["PHOENIX_GOOGLE_CLIENT_SECRET"] = "test-client-secret"
        os.environ["PHOENIX_GOOGLE_REDIRECT_URI"] = "https://example.com/auth/google/callback"

        login_response = client.get("/auth/google/login", follow_redirects=False)
        self.assertEqual(login_response.status_code, 302)
        query = dict(parse_qsl(urlparse(login_response.headers["location"]).query))
        state = query["state"]
        code_challenge = query["code_challenge"]

        captured: dict[str, str] = {}

        def fake_exchange(code: str, code_verifier: str):
            captured["code"] = code
            captured["code_verifier"] = code_verifier
            fake_credentials = MagicMock()
            fake_credentials.token = "fake-access-token"
            fake_credentials.refresh_token = "fake-refresh-token"
            fake_credentials.expiry = None
            fake_credentials.scopes = google_oauth.SCOPES
            return fake_credentials

        with patch.object(google_oauth, "exchange_code_for_tokens", side_effect=fake_exchange), \
                patch.object(google_oauth, "store_credentials", return_value={}):
            callback_response = client.get(
                "/auth/google/callback",
                params={"code": "fake-code", "state": state},
                follow_redirects=False,
            )

        self.assertEqual(callback_response.status_code, 302)
        self.assertEqual(captured["code"], "fake-code")
        self.assertIn("code_verifier", captured)

        recomputed_challenge = base64.urlsafe_b64encode(
            hashlib.sha256(captured["code_verifier"].encode("utf-8")).digest()
        ).decode().rstrip("=")
        self.assertEqual(recomputed_challenge, code_challenge)


class GoogleStatusRouteTests(_EnvIsolatedTestCase):
    def test_status_never_includes_token_values(self) -> None:
        response = client.get("/auth/google/status")
        self.assertEqual(response.status_code, 200)
        raw_body = response.text
        for forbidden in ["ya29.", "1//", "GOCSPX-"]:
            self.assertNotIn(forbidden, raw_body)

    def test_status_shape_when_not_configured(self) -> None:
        data = client.get("/auth/google/status").json()
        self.assertFalse(data["configured"])
        self.assertFalse(data["connected"])
        self.assertIn("setup_steps", data)
        self.assertTrue(len(data["setup_steps"]) > 0)

    def test_status_never_500s_when_not_configured(self) -> None:
        response = client.get("/auth/google/status")
        self.assertEqual(response.status_code, 200)


class GoogleDisconnectRouteTests(_EnvIsolatedTestCase):
    def test_disconnect_is_post_only(self) -> None:
        response = client.get("/auth/google/disconnect")
        self.assertEqual(response.status_code, 405)

    def test_disconnect_post_succeeds_with_no_body(self) -> None:
        response = client.post("/auth/google/disconnect")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["disconnected"])


if __name__ == "__main__":
    unittest.main()
