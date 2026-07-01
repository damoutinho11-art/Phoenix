from datetime import date
from unittest.mock import patch

from fastapi.testclient import TestClient

from jarvis.api.main import app


client = TestClient(app)


def test_default_transaction_month_uses_shared_clock() -> None:
    with patch("jarvis.core.clock.today", return_value=date(2030, 1, 2)):
        data = client.get("/budget/transactions").json()
    assert data["month"] == "2030-01"


def test_parse_pdf_transactions_reads_pdf_and_returns_transactions() -> None:
    transactions = [
        {
            "date": "2026-06-25",
            "merchant": "TORUPILLI SELVER",
            "amount_eur": 14.57,
            "category": "Food & Groceries",
            "is_income": 0,
            "description": "Groceries.",
            "month": "2026-06",
            "source": "pdf",
        }
    ]
    with patch("jarvis.api.routers.budget._extract_pdf_text", return_value="raw lhv text") as extract:
        with patch("jarvis.api.routers.budget._parse_transactions_with_claude", return_value=transactions) as parse:
            response = client.post(
                "/budget/parse-pdf",
                files={"file": ("lhv-statement.pdf", b"%PDF-1.4 fake", "application/pdf")},
            )

    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 1
    assert data["filename"] == "lhv-statement.pdf"
    assert data["transactions"] == transactions
    extract.assert_called_once_with(b"%PDF-1.4 fake")
    parse.assert_called_once_with("raw lhv text", source="pdf")


def test_parse_pdf_rejects_non_pdf_upload() -> None:
    response = client.post(
        "/budget/parse-pdf",
        files={"file": ("statement.txt", b"not a pdf", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Please upload a PDF file"


def test_parse_pdf_rejects_oversized_upload(monkeypatch) -> None:
    monkeypatch.setattr("jarvis.api.routers.budget.MAX_PDF_BYTES", 3)
    response = client.post(
        "/budget/parse-pdf",
        files={"file": ("statement.pdf", b"1234", "application/pdf")},
    )

    assert response.status_code == 413
    assert response.json()["detail"] == "PDF is too large. Maximum size is 8 MB"
