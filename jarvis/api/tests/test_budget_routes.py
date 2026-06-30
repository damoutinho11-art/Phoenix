from datetime import date
from unittest.mock import patch

from fastapi.testclient import TestClient

from jarvis.api.main import app


client = TestClient(app)


def test_default_transaction_month_uses_shared_clock() -> None:
    with patch("jarvis.core.clock.today", return_value=date(2030, 1, 2)):
        data = client.get("/budget/transactions").json()
    assert data["month"] == "2030-01"
