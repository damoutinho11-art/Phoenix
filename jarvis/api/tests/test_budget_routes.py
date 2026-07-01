from datetime import date
from unittest.mock import patch

from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.api.routers.budget import _parse_lhv_statement_transactions


client = TestClient(app)


def test_default_transaction_month_uses_shared_clock() -> None:
    with patch("jarvis.core.clock.today", return_value=date(2030, 1, 2)):
        data = client.get("/budget/transactions").json()
    assert data["month"] == "2030-01"


def test_parse_pdf_transactions_reads_pdf_with_local_lhv_parser() -> None:
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
        with patch("jarvis.api.routers.budget._parse_lhv_statement_transactions", return_value=transactions) as parse_lhv:
            with patch("jarvis.api.routers.budget._parse_transactions_with_claude") as parse_ai:
                response = client.post(
                    "/budget/parse-pdf",
                    files={"file": ("lhv-statement.pdf", b"%PDF-1.4 fake", "application/pdf")},
                )

    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 1
    assert data["filename"] == "lhv-statement.pdf"
    assert data["parser"] == "lhv_pdf"
    assert data["transactions"] == transactions
    extract.assert_called_once_with(b"%PDF-1.4 fake")
    parse_lhv.assert_called_once_with("raw lhv text", source="pdf")
    parse_ai.assert_not_called()


def test_lhv_statement_parser_handles_expense_income_and_footer_noise() -> None:
    raw_text = r"""
01.06.2026 Starting balance 1 030.40
01.06.2026 Erik OÜ
EE787700771010676326
Rent May 1455243399 -420.00 609.70
05.06.2026 RIMI/SOPRUSE RIMI ISET (..7358) 2026-06-04 18:18 RIMI/SOPRUSE
RIMI ISET\SOPRUS PST 174/176 \HARJUMAA, TA \13413 ESTEST
1458731919 -102.42 299.27
The funds on the accounts are guaranteed to the extent and with conditions stated in the Guarantee Fund Act.
09.06.2026 Cash deposit (from account
EE457700772012074268)
1463187214 1 140.00 1 265.93
30.06.2026 RAHVUSOOPER ESTONIA
EE471010002006932005
Töötasu 1482517441 2 236.54 2 350.06
01.07.2026 Final balance 2 294.15
"""

    transactions = _parse_lhv_statement_transactions(raw_text)

    assert [t["merchant"] for t in transactions] == [
        "Erik OÜ",
        "RIMI/SOPRUSE RIMI ISET",
        "Cash deposit",
        "RAHVUSOOPER ESTONIA",
    ]
    assert transactions[0]["amount_eur"] == 420.00
    assert transactions[0]["category"] == "Housing"
    assert transactions[1]["amount_eur"] == 102.42
    assert transactions[1]["category"] == "Food & Groceries"
    assert transactions[2]["amount_eur"] == -1140.00
    assert transactions[2]["is_income"] == 1
    assert transactions[3]["amount_eur"] == -2236.54
    assert transactions[3]["category"] == "Income"


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
