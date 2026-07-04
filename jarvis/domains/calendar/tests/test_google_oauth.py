"""Tests for the Google OAuth read-only connector boundary.

Runs with NO real Google credentials. Uses a test-only Fernet key, never a
real credential.
"""

import os
import unittest

from jarvis.domains.calendar import google_oauth

_TEST_FERNET_KEY = "gVoF-3xLNMHMDgDb97e6hS7-xDAbPCMJyWwgw9PFG3w="


class IsConfiguredTests(unittest.TestCase):
    def setUp(self) -> None:
        self._env_keys = [
            "PHOENIX_GOOGLE_CLIENT_ID",
            "PHOENIX_GOOGLE_CLIENT_SECRET",
            "PHOENIX_GOOGLE_REDIRECT_URI",
        ]
        self._saved = {key: os.environ.pop(key, None) for key in self._env_keys}

    def tearDown(self) -> None:
        for key, value in self._saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_not_configured_when_all_env_vars_missing(self) -> None:
        self.assertFalse(google_oauth.is_configured())

    def test_not_configured_when_only_client_id_set(self) -> None:
        os.environ["PHOENIX_GOOGLE_CLIENT_ID"] = "client-id"
        self.assertFalse(google_oauth.is_configured())

    def test_configured_when_all_three_set(self) -> None:
        os.environ["PHOENIX_GOOGLE_CLIENT_ID"] = "client-id"
        os.environ["PHOENIX_GOOGLE_CLIENT_SECRET"] = "client-secret"
        os.environ["PHOENIX_GOOGLE_REDIRECT_URI"] = "https://example.com/auth/google/callback"
        self.assertTrue(google_oauth.is_configured())


class TokenEncryptionRoundTripTests(unittest.TestCase):
    def setUp(self) -> None:
        self._saved = os.environ.get("PHOENIX_TOKEN_ENCRYPTION_KEY")
        os.environ["PHOENIX_TOKEN_ENCRYPTION_KEY"] = _TEST_FERNET_KEY

    def tearDown(self) -> None:
        if self._saved is None:
            os.environ.pop("PHOENIX_TOKEN_ENCRYPTION_KEY", None)
        else:
            os.environ["PHOENIX_TOKEN_ENCRYPTION_KEY"] = self._saved

    def test_encrypt_then_decrypt_returns_original(self) -> None:
        original = "not-a-real-token-just-test-data"
        encrypted = google_oauth.encrypt_token(original)
        self.assertNotEqual(encrypted, original)
        self.assertEqual(google_oauth.decrypt_token(encrypted), original)

    def test_encryption_key_missing_raises(self) -> None:
        os.environ.pop("PHOENIX_TOKEN_ENCRYPTION_KEY", None)
        with self.assertRaises(ValueError):
            google_oauth.encrypt_token("anything")


if __name__ == "__main__":
    unittest.main()
