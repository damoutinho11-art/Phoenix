"""Tests for /calendar/connectors/status. Runs green with NO real Google credentials."""

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


class ConnectorsStatusRouteTests(unittest.TestCase):
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

    def test_returns_200_and_all_four_connectors(self) -> None:
        response = client.get("/calendar/connectors/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        connectors = data["connectors"]
        for name in ["plaan", "ics_feed", "google_calendar", "gmail"]:
            self.assertIn(name, connectors)

    def test_writes_enabled_is_always_false(self) -> None:
        data = client.get("/calendar/connectors/status").json()
        self.assertFalse(data["writes_enabled"])
        self.assertTrue(data["read_only"])

    def test_no_secrets_in_response(self) -> None:
        raw_body = client.get("/calendar/connectors/status").text
        for forbidden in ["ya29.", "1//", "GOCSPX-"]:
            self.assertNotIn(forbidden, raw_body)


if __name__ == "__main__":
    unittest.main()
