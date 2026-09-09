"""Authenticate offline business-route tests with a synthetic owner credential.

Access-control tests live in the separate security_tests directory and do not
inherit this fixture. This only changes ASGI TestClient requests, never HTTP
requests to deployed services.
"""
import hashlib
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def synthetic_owner_client(monkeypatch):
    key = 'synthetic-offline-business-route-key'
    monkeypatch.setenv('PHOENIX_ACCESS_KEY_SHA256', hashlib.sha256(key.encode()).hexdigest())
    monkeypatch.setenv('PHOENIX_FINANCE_SELECTION_MODE', 'legacy')
    original = TestClient.request

    def authenticated(self, method, url, **kwargs):
        headers = dict(kwargs.pop('headers', None) or {})
        if not any(name.lower() == 'authorization' for name in headers):
            headers['Authorization'] = f'Bearer {key}'
        return original(self, method, url, headers=headers, **kwargs)

    monkeypatch.setattr(TestClient, 'request', authenticated)
