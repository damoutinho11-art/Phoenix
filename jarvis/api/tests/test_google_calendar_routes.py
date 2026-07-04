"""Tests for /calendar/google/* routes. Runs green with NO real Google credentials."""

import os
import unittest

from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.data import database

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


class GoogleCalendarStatusRouteTests(_EnvIsolatedTestCase):
    def test_status_returns_200_when_not_configured(self) -> None:
        response = client.get("/calendar/google/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["configured"])
        self.assertFalse(data["connected"])

    def test_status_never_includes_secrets(self) -> None:
        raw_body = client.get("/calendar/google/status").text
        for forbidden in ["ya29.", "1//", "GOCSPX-"]:
            self.assertNotIn(forbidden, raw_body)


class GoogleCalendarPreviewRouteTests(_EnvIsolatedTestCase):
    def test_preview_returns_200_with_empty_events_when_not_connected(self) -> None:
        response = client.get("/calendar/google/preview")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["connected"])
        self.assertEqual(data["events"], [])
        self.assertEqual(data["event_count"], 0)

    def test_preview_never_includes_raw_tokens(self) -> None:
        raw_body = client.get("/calendar/google/preview").text
        for forbidden in ["ya29.", "1//", "GOCSPX-"]:
            self.assertNotIn(forbidden, raw_body)

    def test_preview_days_param_is_capped(self) -> None:
        response = client.get("/calendar/google/preview", params={"days": 999})
        self.assertEqual(response.status_code, 422)

    def test_preview_defaults_to_14_days(self) -> None:
        response = client.get("/calendar/google/preview")
        self.assertEqual(response.status_code, 200)


class UnifiedCalendarRouteTests(_EnvIsolatedTestCase):
    def test_unified_returns_200_when_google_not_connected(self) -> None:
        response = client.get("/calendar/unified")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("events", data)
        self.assertIn("sources", data)
        self.assertFalse(data["sources"]["google_calendar"]["connected"])


if __name__ == "__main__":
    unittest.main()
