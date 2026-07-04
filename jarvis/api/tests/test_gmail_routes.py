"""Tests for /gmail/* routes. Runs green with NO real Google credentials."""

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


class GmailStatusRouteTests(_EnvIsolatedTestCase):
    def test_status_returns_200_when_not_configured(self) -> None:
        response = client.get("/gmail/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["configured"])
        self.assertFalse(data["connected"])
        self.assertTrue(data["safety"]["read_only"])
        self.assertTrue(data["safety"]["send_disabled"])
        self.assertTrue(data["safety"]["modify_disabled"])
        self.assertFalse(data["safety"]["messages_stored"])


class GmailSearchRouteTests(_EnvIsolatedTestCase):
    def test_search_returns_200_with_empty_list_when_not_connected(self) -> None:
        response = client.get("/gmail/search", params={"q": "rehearsal"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["connected"])
        self.assertEqual(data["messages"], [])
        self.assertEqual(data["message_count"], 0)

    def test_search_never_persists_email_body_content_to_sqlite(self) -> None:
        before_tables = database.get_db().execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        before_names = {row["name"] for row in before_tables}

        client.get("/gmail/search", params={"q": "rehearsal"})

        after_tables = database.get_db().execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        after_names = {row["name"] for row in after_tables}

        self.assertEqual(before_names, after_names)
        self.assertFalse(any("gmail" in name.lower() for name in after_names))

    def test_search_default_query_is_used_when_missing(self) -> None:
        data = client.get("/gmail/search").json()
        self.assertTrue(data["query"])


if __name__ == "__main__":
    unittest.main()
