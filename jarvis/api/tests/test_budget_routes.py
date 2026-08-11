import json
from datetime import date
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.api.routers import budget as budget_router
from jarvis.api.routers.budget import _generate_budget_insight, _parse_lhv_statement_transactions
from jarvis.data import database


client = TestClient(app)


def test_statement_receipt_helpers_are_private_implementation_apis() -> None:
    assert not hasattr(database, "create_budget_statement_parse_receipt")
    assert not hasattr(database, "save_budget_statement_receipt_import")
    assert callable(database._create_budget_statement_parse_receipt)
    assert callable(database._save_budget_statement_receipt_import)


def _parse_reconciled_statement_receipt(raw_text: str | None = None) -> dict:
    raw_text = raw_text or """
05.05.2026 Starting balance 100.00
05.05.2026 Shop
1500000001 -10.00 90.00
05.05.2026 Final balance 90.00
"""
    with patch("jarvis.api.routers.budget._extract_pdf_text", return_value=raw_text):
        response = client.post(
            "/budget/parse-pdf",
            files={"file": ("account.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )
    assert response.status_code == 200
    data = response.json()
    assert data.get("receipt_id")
    return data


def test_default_transaction_month_uses_shared_clock() -> None:
    with patch("jarvis.core.clock.today", return_value=date(2030, 1, 2)):
        data = client.get("/budget/transactions").json()
    assert data["month"] == "2030-01"


def test_budget_memory_defaults_are_available() -> None:
    data = client.get("/budget/memory").json()

    assert data["profile"]["savings_target_pct"] == 25
    assert "Housing" in data["profile"]["fixed_categories"]
    assert "Emergency Fund" in data["profile"]["non_spending_categories"]
    assert any(
        "rahvusooper estonia" in rule.get("contains", [])
        for rule in data["profile"]["merchant_rules"]
    )


def test_budget_insight_is_deterministic_and_does_not_leak_prompt_text() -> None:
    summary = {
        "income_total": 0,
        "expenses_total": 60.29,
        "savings_rate": 0,
        "by_category": {
            "Housing": {"total": 546.54, "count": 3},
            "Investment": {"total": 144.58, "count": 5},
            "Emergency Fund": {"total": 587.00, "count": 2},
            "Eating Out": {"total": 40.95, "count": 3},
            "Transport": {"total": 13.87, "count": 2},
            "Food & Groceries": {"total": 5.47, "count": 1},
        },
    }

    with patch("jarvis.api.routers.budget.ai_gateway.generate_text") as generate_text:
        insight = _generate_budget_insight(summary, "2026-06")

    generate_text.assert_not_called()
    assert "Sir, your June 2026 savings rate is 0 percent" in insight
    assert "Your highest flexible spending category is Eating Out at 40 euros and 95 cents." in insight
    assert "Housing" not in insight
    assert "Investment" not in insight
    assert "Emergency Fund" not in insight
    assert "cut one restaurant or delivery order this week" in insight
    leaked_fragments = [
        "Generate a spoken",
        "Maximum 3 sentences",
        "No markdown",
        "We need to",
        "Data:",
    ]
    assert all(fragment not in insight for fragment in leaked_fragments)


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


def test_lhv_statement_parser_uses_budget_memory_for_income_savings_and_transfers() -> None:
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
17.06.2026 Diogo Andre Martinho Moutinho
EE127700771012074023
Emergency fund - deposit 1471947796 -337.00 712.44
30.06.2026 Lightyear (..7358) 2026-06-29 11:08
Lightyear\Volta\Tallinn\10412 ESTEST
1481611013 -70.42 113.52
01.07.2026 Final balance 2 294.15
"""

    transactions = _parse_lhv_statement_transactions(raw_text)

    assert [t["merchant"] for t in transactions] == [
        "Erik OÜ",
        "RIMI/SOPRUSE RIMI ISET",
        "Cash deposit",
        "RAHVUSOOPER ESTONIA",
        "Diogo Andre Martinho Moutinho",
        "Lightyear",
    ]
    assert transactions[0]["amount_eur"] == 420.00
    assert transactions[0]["category"] == "Housing"
    assert transactions[1]["amount_eur"] == 102.42
    assert transactions[1]["category"] == "Food & Groceries"
    assert transactions[2]["amount_eur"] == 1140.00
    assert transactions[2]["is_income"] == 0
    assert transactions[2]["category"] == "Transfers"
    assert transactions[3]["amount_eur"] == 2236.54
    assert transactions[3]["category"] == "Income"
    assert transactions[3]["is_income"] == 1
    assert transactions[3]["month"] == "2026-07"
    assert transactions[4]["amount_eur"] == 337.00
    assert transactions[4]["category"] == "Emergency Fund"
    assert transactions[4]["month"] == "2026-06"
    assert transactions[5]["amount_eur"] == 70.42
    assert transactions[5]["category"] == "Investment"


def test_lhv_parser_uses_final_reference_when_description_contains_ten_digit_number() -> None:
    raw_text = """
05.05.2026 Starting balance 100.00
08.05.2026 MAKSEKESKUS AS
EE711700017003216868
Refund/Payment / 2281415810
1434689425 0.64 100.64
08.05.2026 Final balance 100.64
"""

    transactions = _parse_lhv_statement_transactions(raw_text)

    assert len(transactions) == 1
    assert transactions[0]["amount_eur"] == 0.64
    assert transactions[0]["merchant"] == "MAKSEKESKUS AS"


def test_lhv_parser_keeps_withdrawal_and_fee_that_share_a_bank_reference() -> None:
    raw_text = """
05.05.2026 Starting balance 100.00
05.05.2026 HAN00706 Cash withdrawal: (..7358)
1431094563 -40.00 60.00
05.05.2026 HAN00706 Cash withdrawal fee: (..7358)
1431094563 -1.00 59.00
05.05.2026 Final balance 59.00
"""

    transactions = _parse_lhv_statement_transactions(raw_text)

    assert [transaction["amount_eur"] for transaction in transactions] == [40.0, 1.0]


def test_lhv_parser_routes_food_delivery_as_eating_out() -> None:
    raw_text = """
03.08.2026 Starting balance 100.00
03.08.2026 UBER *EATS (..7358)
1500000001 -30.23 69.77
03.08.2026 Final balance 69.77
"""

    transactions = _parse_lhv_statement_transactions(raw_text)

    assert transactions[0]["category"] == "Eating Out"


def test_parse_pdf_reports_reconciled_statement_quality() -> None:
    raw_text = """
05.05.2026 Starting balance 100.00
05.05.2026 Shop
1500000001 -10.00 90.00
05.05.2026 Refund / 2281415810
1500000002 0.64 90.64
05.05.2026 Final balance 90.64 Debit turnover -10.00 Credit turnover 0.64
"""

    with patch("jarvis.api.routers.budget._extract_pdf_text", return_value=raw_text):
        response = client.post(
            "/budget/parse-pdf",
            files={"file": ("lhv-statement.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )

    assert response.status_code == 200
    quality = response.json()["quality"]
    assert quality["status"] == "reconciled"
    assert quality["statement_rows"] == 2
    assert quality["parsed_rows"] == 2
    assert quality["balance_difference_eur"] == 0.0
    assert quality["statement_end_date"] == "2026-05-05"


def test_ai_fallback_pdf_parse_does_not_issue_statement_receipt() -> None:
    fallback_transactions = [
        {
            "date": "2026-05-05",
            "merchant": "Fallback",
            "amount_eur": 10.00,
            "category": "Other",
            "description": "AI parsed",
            "source": "pdf",
            "month": "2026-05",
            "is_income": 0,
        }
    ]
    with patch("jarvis.api.routers.budget._extract_pdf_text", return_value="unstructured text"):
        with patch("jarvis.api.routers.budget._parse_lhv_statement_transactions", return_value=[]):
            with patch(
                "jarvis.api.routers.budget._parse_transactions_with_claude",
                return_value=fallback_transactions,
            ):
                response = client.post(
                    "/budget/parse-pdf",
                    files={"file": ("fallback.pdf", b"%PDF-1.4 fake", "application/pdf")},
                )

    assert response.status_code == 200
    assert response.json()["parser"] == "ai_fallback"
    assert "receipt_id" not in response.json()


def test_text_parse_does_not_issue_statement_receipt() -> None:
    with patch("jarvis.api.routers.budget._parse_transactions_with_claude", return_value=[]):
        response = client.post(
            "/budget/parse",
            json={"raw_text": "05.05.2026 Shop -10.00", "source": "text"},
        )

    assert response.status_code == 200
    assert "receipt_id" not in response.json()


def test_save_reconciled_pdf_persists_authoritative_balance(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    parsed = _parse_reconciled_statement_receipt()
    transactions = [
        {**transaction, "category": "Shopping", "is_income": 0, "month": "2026-05"}
        for transaction in parsed["transactions"]
    ]

    response = client.post(
        "/budget/save",
        json={
            "transactions": transactions,
            "statement_receipt_id": parsed["receipt_id"],
        },
    )

    assert response.status_code == 200
    snapshot = database.get_latest_reconciled_budget_statement()
    assert snapshot["closing_balance_eur"] == 90.00
    assert snapshot["statement_end_date"] == "2026-05-05"
    assert snapshot["filename_hash"]
    assert "account.pdf" not in snapshot["metadata_json"]
    assert database.get_budget_transactions("2026-05")[0]["category"] == "Shopping"


def test_save_rejects_forged_client_statement_metadata(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    response = client.post(
        "/budget/save",
        json={
            "transactions": [],
            "statement": {
                "filename": "forged.pdf",
                "parser": "lhv_pdf",
                "quality": {
                    "status": "reconciled",
                    "statement_rows": 1,
                    "parsed_rows": 1,
                    "opening_balance_eur": 100.00,
                    "closing_balance_eur": 999999.00,
                    "balance_difference_eur": 0.0,
                    "statement_end_date": "2026-08-11",
                },
            },
        },
    )

    assert response.status_code == 422
    assert database.get_latest_reconciled_budget_statement() is None


def test_save_rejects_forged_statement_receipt_id(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()

    response = client.post(
        "/budget/save",
        json={"transactions": [], "statement_receipt_id": "forged-receipt"},
    )

    assert response.status_code == 422
    assert database.get_latest_reconciled_budget_statement() is None


@pytest.mark.parametrize(
    ("field", "replacement"),
    [
        ("date", "2026-05-06"),
        ("merchant", "Different merchant"),
        ("amount_eur", 11.00),
        ("description", "Changed description"),
        ("source", "text"),
    ],
)
def test_save_rejects_statement_receipt_transaction_mismatch(
    monkeypatch, tmp_path, field, replacement
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    parsed = _parse_reconciled_statement_receipt()
    transactions = [dict(transaction) for transaction in parsed["transactions"]]
    transactions[0][field] = replacement

    response = client.post(
        "/budget/save",
        json={
            "transactions": transactions,
            "statement_receipt_id": parsed["receipt_id"],
        },
    )

    assert response.status_code == 422
    assert database.get_budget_transactions("2026-05") == []
    assert database.get_latest_reconciled_budget_statement() is None


def test_save_rejects_replayed_statement_receipt(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    parsed = _parse_reconciled_statement_receipt()
    payload = {
        "transactions": parsed["transactions"],
        "statement_receipt_id": parsed["receipt_id"],
    }

    first = client.post("/budget/save", json=payload)
    replay = client.post("/budget/save", json=payload)

    assert first.status_code == 200
    assert replay.status_code == 422
    connection = database.get_db()
    try:
        assert connection.execute("SELECT COUNT(*) FROM budget_statement_snapshots").fetchone()[0] == 1
    finally:
        connection.close()


def test_save_rejects_expired_statement_receipt(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    parsed = _parse_reconciled_statement_receipt()
    connection = database.get_db()
    try:
        connection.execute(
            "UPDATE budget_statement_parse_receipts SET expires_at=? WHERE receipt_id=?",
            ("2000-01-01T00:00:00+00:00", parsed["receipt_id"]),
        )
        connection.commit()
    finally:
        connection.close()

    response = client.post(
        "/budget/save",
        json={
            "transactions": parsed["transactions"],
            "statement_receipt_id": parsed["receipt_id"],
        },
    )

    assert response.status_code == 422
    assert database.get_budget_transactions("2026-05") == []
    assert database.get_latest_reconciled_budget_statement() is None


def test_receipt_save_rolls_back_partial_transaction_failure_and_can_retry(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    parsed = _parse_reconciled_statement_receipt(
        """
05.05.2026 Starting balance 100.00
05.05.2026 Shop
1500000001 -10.00 90.00
05.05.2026 Cafe
1500000002 -5.00 85.00
05.05.2026 Final balance 85.00
"""
    )
    invalid_transactions = [dict(transaction) for transaction in parsed["transactions"]]
    invalid_transactions[1].pop("category")

    rejected = client.post(
        "/budget/save",
        json={
            "transactions": invalid_transactions,
            "statement_receipt_id": parsed["receipt_id"],
        },
    )

    assert rejected.status_code == 422
    assert database.get_budget_transactions("2026-05") == []
    assert database.get_latest_reconciled_budget_statement() is None
    connection = database.get_db()
    try:
        consumed_at = connection.execute(
            """SELECT consumed_at FROM budget_statement_parse_receipts
               WHERE receipt_id=?""",
            (parsed["receipt_id"],),
        ).fetchone()["consumed_at"]
        snapshot_count = connection.execute(
            "SELECT COUNT(*) FROM budget_statement_snapshots"
        ).fetchone()[0]
    finally:
        connection.close()
    assert consumed_at is None
    assert snapshot_count == 0

    corrected = client.post(
        "/budget/save",
        json={
            "transactions": parsed["transactions"],
            "statement_receipt_id": parsed["receipt_id"],
        },
    )

    assert corrected.status_code == 200
    assert len(database.get_budget_transactions("2026-05")) == 2


def test_save_rejects_receipt_with_nonzero_subcent_difference(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    parsed = _parse_reconciled_statement_receipt()
    connection = database.get_db()
    try:
        row = connection.execute(
            "SELECT snapshot_json FROM budget_statement_parse_receipts WHERE receipt_id=?",
            (parsed["receipt_id"],),
        ).fetchone()
        snapshot = json.loads(row["snapshot_json"])
        snapshot["balance_difference_eur"] = 0.004
        connection.execute(
            "UPDATE budget_statement_parse_receipts SET snapshot_json=? WHERE receipt_id=?",
            (json.dumps(snapshot, sort_keys=True), parsed["receipt_id"]),
        )
        connection.commit()
    finally:
        connection.close()

    response = client.post(
        "/budget/save",
        json={
            "transactions": parsed["transactions"],
            "statement_receipt_id": parsed["receipt_id"],
        },
    )

    assert response.status_code == 422
    assert database.get_budget_transactions("2026-05") == []
    assert database.get_latest_reconciled_budget_statement() is None


def test_reconciled_parse_receipt_stores_only_hashes_and_whitelisted_snapshot(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    parsed = _parse_reconciled_statement_receipt()
    connection = database.get_db()
    try:
        receipt = dict(
            connection.execute(
                "SELECT * FROM budget_statement_parse_receipts WHERE receipt_id=?",
                (parsed["receipt_id"],),
            ).fetchone()
        )
    finally:
        connection.close()

    assert len(receipt["filename_hash"]) == 64
    assert "account.pdf" not in receipt["snapshot_json"]
    assert "%PDF" not in receipt["snapshot_json"]
    assert "raw_pdf" not in receipt["snapshot_json"]


def test_transaction_only_budget_save_remains_supported(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    transaction = {
        "date": "2026-08-11",
        "merchant": "Manual transaction",
        "amount_eur": 10.00,
        "category": "Other",
        "description": "Manual entry",
        "source": "text",
        "month": "2026-08",
        "is_income": 0,
    }

    response = client.post("/budget/save", json={"transactions": [transaction]})

    assert response.status_code == 200
    assert len(database.get_budget_transactions("2026-08")) == 1
    assert database.get_latest_reconciled_budget_statement() is None


def test_save_rejects_unreconciled_statement_metadata(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    response = client.post(
        "/budget/save",
        json={
            "transactions": [
                {
                    "date": "2026-08-11",
                    "merchant": "Should not save",
                    "amount_eur": 1.00,
                    "category": "Other",
                    "month": "2026-08",
                }
            ],
            "statement": {
                "filename": "bad.pdf",
                "parser": "lhv_pdf",
                "quality": {"status": "review_required", "balance_difference_eur": 10},
            },
        },
    )

    assert response.status_code == 422
    assert database.get_budget_transactions("2026-08") == []


def test_save_rejects_text_statement_metadata() -> None:
    response = client.post(
        "/budget/save",
        json={
            "transactions": [],
            "statement": {
                "filename": "pasted-statement.txt",
                "parser": "text",
                "quality": {
                    "status": "reconciled",
                    "closing_balance_eur": 760.00,
                    "balance_difference_eur": 0.0,
                    "statement_end_date": "2026-08-11",
                },
            },
        },
    )

    assert response.status_code == 422


def test_save_rejects_nonfinite_statement_balance_difference() -> None:
    response = TestClient(app, raise_server_exceptions=False).post(
        "/budget/save",
        json={
            "transactions": [],
            "statement": {
                "filename": "account.pdf",
                "parser": "lhv_pdf",
                "quality": {
                    "status": "reconciled",
                    "closing_balance_eur": 760.00,
                    "balance_difference_eur": "NaN",
                    "statement_end_date": "2026-08-11",
                },
            },
        },
    )

    assert response.status_code == 422


def test_database_rejects_non_pdf_statement_snapshot(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()

    with pytest.raises(ValueError, match="Only PDF statements"):
        database.save_budget_statement_snapshot(
            {
                "statement_end_date": "2026-08-11",
                "closing_balance_eur": 760.00,
                "parser": "text",
                "quality_status": "reconciled",
                "balance_difference_eur": 0.0,
                "filename_hash": "digest",
            }
        )


def test_database_snapshot_whitelists_metadata_and_normalizes_values(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()

    saved = database.save_budget_statement_snapshot(
        {
            "statement_end_date": "2026-08-11",
            "opening_balance_eur": "1363.38",
            "closing_balance_eur": "760.00",
            "parser": "lhv_pdf",
            "quality_status": "reconciled",
            "statement_rows": 258,
            "parsed_rows": 258,
            "balance_difference_eur": "0.0",
            "filename_hash": "A" * 64,
            "filename": "account.pdf",
            "raw_pdf": b"%PDF secret",
            "base64": "c2VjcmV0",
            "caller_extra": "must not persist",
        }
    )

    assert saved["opening_balance_eur"] == 1363.38
    assert saved["closing_balance_eur"] == 760.00
    assert saved["balance_difference_eur"] == 0.0
    assert saved["filename_hash"] == "a" * 64
    metadata = json.loads(saved["metadata_json"])
    assert set(metadata) == {
        "imported_at",
        "statement_end_date",
        "opening_balance_eur",
        "closing_balance_eur",
        "parser",
        "quality_status",
        "statement_rows",
        "parsed_rows",
        "balance_difference_eur",
        "filename_hash",
    }
    assert not {"filename", "raw_pdf", "base64", "caller_extra"} & metadata.keys()


def test_direct_snapshot_helper_cannot_mint_authoritative_balance(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()

    saved = database.save_budget_statement_snapshot(
        {
            "statement_end_date": "2026-08-11",
            "opening_balance_eur": 770.00,
            "closing_balance_eur": 760.00,
            "parser": "lhv_pdf",
            "quality_status": "reconciled",
            "statement_rows": 1,
            "parsed_rows": 1,
            "balance_difference_eur": 0.0,
            "filename_hash": "a" * 64,
        }
    )

    assert saved["receipt_verified"] == 0
    assert database.get_latest_reconciled_budget_statement() is None


def test_direct_statement_import_helper_cannot_mint_authoritative_balance(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()

    database.save_budget_statement_import(
        [],
        {
            "statement_end_date": "2026-08-11",
            "opening_balance_eur": 770.00,
            "closing_balance_eur": 760.00,
            "parser": "lhv_pdf",
            "quality_status": "reconciled",
            "statement_rows": 1,
            "parsed_rows": 1,
            "balance_difference_eur": 0.0,
            "filename_hash": "a" * 64,
        },
    )

    assert database.get_latest_reconciled_budget_statement() is None


def test_legacy_snapshot_schema_migrates_rows_as_non_authoritative(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "legacy-cashflow.db")
    connection = database.get_db()
    try:
        connection.execute(
            """CREATE TABLE budget_statement_snapshots (
                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                   imported_at TEXT NOT NULL,
                   statement_end_date TEXT NOT NULL,
                   opening_balance_eur REAL,
                   closing_balance_eur REAL NOT NULL,
                   parser TEXT NOT NULL,
                   quality_status TEXT NOT NULL,
                   statement_rows INTEGER,
                   parsed_rows INTEGER,
                   balance_difference_eur REAL NOT NULL,
                   filename_hash TEXT NOT NULL,
                   metadata_json TEXT NOT NULL
               )"""
        )
        connection.execute(
            """INSERT INTO budget_statement_snapshots
               (imported_at, statement_end_date, opening_balance_eur, closing_balance_eur,
                parser, quality_status, statement_rows, parsed_rows,
                balance_difference_eur, filename_hash, metadata_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "2026-08-11T12:00:00+00:00",
                "2026-08-11",
                770.00,
                760.00,
                "lhv_pdf",
                "reconciled",
                1,
                1,
                0.0,
                "a" * 64,
                "{}",
            ),
        )
        connection.commit()
    finally:
        connection.close()

    database.init_db()

    connection = database.get_db()
    try:
        columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(budget_statement_snapshots)"
            ).fetchall()
        }
        receipt_verified = connection.execute(
            "SELECT receipt_verified FROM budget_statement_snapshots WHERE id=1"
        ).fetchone()["receipt_verified"]
    finally:
        connection.close()
    assert "receipt_verified" in columns
    assert receipt_verified == 0
    assert database.get_latest_reconciled_budget_statement() is None


def test_latest_authoritative_statement_requires_lhv_parser(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    parsed = _parse_reconciled_statement_receipt()
    saved = client.post(
        "/budget/save",
        json={
            "transactions": parsed["transactions"],
            "statement_receipt_id": parsed["receipt_id"],
        },
    )
    assert saved.status_code == 200

    connection = database.get_db()
    try:
        connection.execute(
            "UPDATE budget_statement_snapshots SET parser='ai_fallback'"
        )
        connection.commit()
    finally:
        connection.close()

    assert database.get_latest_reconciled_budget_statement() is None


@pytest.mark.parametrize(
    "filename_hash",
    [None, "", "a" * 63, "a" * 65, "g" * 64, "a" * 63 + "-"],
)
def test_database_snapshot_rejects_invalid_filename_hash(
    monkeypatch, tmp_path, filename_hash
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()

    with pytest.raises(ValueError, match="filename_hash"):
        database.save_budget_statement_snapshot(
            {
                "statement_end_date": "2026-08-11",
                "closing_balance_eur": 760.00,
                "parser": "lhv_pdf",
                "quality_status": "reconciled",
                "balance_difference_eur": 0.0,
                "filename_hash": filename_hash,
            }
        )


@pytest.mark.parametrize("field", ["opening_balance_eur", "closing_balance_eur", "balance_difference_eur"])
@pytest.mark.parametrize("invalid_value", [{}, "NaN", "Infinity", "-Infinity"])
def test_save_rejects_invalid_statement_balance_values(field, invalid_value) -> None:
    quality = {
        "status": "reconciled",
        "opening_balance_eur": 1363.38,
        "closing_balance_eur": 760.00,
        "balance_difference_eur": 0.0,
        "statement_end_date": "2026-08-11",
    }
    quality[field] = invalid_value

    response = TestClient(app, raise_server_exceptions=False).post(
        "/budget/save",
        json={
            "transactions": [],
            "statement": {
                "filename": "account.pdf",
                "parser": "lhv_pdf",
                "quality": quality,
            },
        },
    )

    assert response.status_code == 422


@pytest.mark.parametrize("field", ["opening_balance_eur", "closing_balance_eur", "balance_difference_eur"])
@pytest.mark.parametrize("invalid_value", [{}, "NaN", "Infinity", "-Infinity"])
def test_database_snapshot_rejects_invalid_balance_values(
    monkeypatch, tmp_path, field, invalid_value
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    snapshot = {
        "statement_end_date": "2026-08-11",
        "opening_balance_eur": 1363.38,
        "closing_balance_eur": 760.00,
        "parser": "lhv_pdf",
        "quality_status": "reconciled",
        "balance_difference_eur": 0.0,
        "filename_hash": "a" * 64,
    }
    snapshot[field] = invalid_value

    with pytest.raises(ValueError, match=field):
        database.save_budget_statement_snapshot(snapshot)


def test_statement_save_rolls_back_transactions_when_snapshot_insert_fails(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    parsed = _parse_reconciled_statement_receipt()

    def fail_snapshot_insert(snapshot, connection, *, receipt_verified):
        raise RuntimeError("simulated snapshot insertion failure")

    monkeypatch.setattr(
        database, "_save_budget_statement_snapshot_with_connection", fail_snapshot_insert
    )
    response = TestClient(app, raise_server_exceptions=False).post(
        "/budget/save",
        json={
            "transactions": parsed["transactions"],
            "statement_receipt_id": parsed["receipt_id"],
        },
    )

    assert response.status_code == 500
    assert database.get_budget_transactions("2026-05") == []


def test_parse_pdf_marks_impossible_final_balance_date_for_review() -> None:
    raw_text = """
01.02.2026 Starting balance 100.00
01.02.2026 Shop
1500000001 -10.00 90.00
31.02.2026 Final balance 90.00
"""

    with patch("jarvis.api.routers.budget._extract_pdf_text", return_value=raw_text):
        response = TestClient(app, raise_server_exceptions=False).post(
            "/budget/parse-pdf",
            files={"file": ("lhv-statement.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )

    assert response.status_code == 200
    quality = response.json()["quality"]
    assert quality["status"] == "review_required"
    assert quality["statement_end_date"] is None
    assert any("date" in warning.lower() for warning in quality["warnings"])


@pytest.mark.parametrize("field", ["statement_rows", "parsed_rows"])
@pytest.mark.parametrize("invalid_value", [True, "1", "MQ==", [], {}, -1])
def test_save_rejects_invalid_statement_row_counts_without_writes(
    monkeypatch, tmp_path, field, invalid_value
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    quality = {
        "status": "reconciled",
        "statement_rows": 1,
        "parsed_rows": 1,
        "opening_balance_eur": 770.00,
        "closing_balance_eur": 760.00,
        "balance_difference_eur": 0.0,
        "statement_end_date": "2026-08-11",
    }
    quality[field] = invalid_value

    response = client.post(
        "/budget/save",
        json={
            "transactions": [
                {
                    "date": "2026-08-11",
                    "merchant": "Must roll back",
                    "amount_eur": 10.00,
                    "category": "Other",
                    "month": "2026-08",
                }
            ],
            "statement": {
                "filename": "account.pdf",
                "parser": "lhv_pdf",
                "quality": quality,
            },
        },
    )

    assert response.status_code == 422
    assert database.get_budget_transactions("2026-08") == []
    assert database.get_latest_reconciled_budget_statement() is None


@pytest.mark.parametrize("field", ["statement_rows", "parsed_rows"])
@pytest.mark.parametrize(
    "invalid_value",
    [True, "1", "MQ==", b"1", b"MQ==", [], {}, -1],
)
def test_database_snapshot_rejects_invalid_row_counts_without_writes(
    monkeypatch, tmp_path, field, invalid_value
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    snapshot = {
        "statement_end_date": "2026-08-11",
        "opening_balance_eur": 770.00,
        "closing_balance_eur": 760.00,
        "parser": "lhv_pdf",
        "quality_status": "reconciled",
        "statement_rows": 1,
        "parsed_rows": 1,
        "balance_difference_eur": 0.0,
        "filename_hash": "a" * 64,
    }
    snapshot[field] = invalid_value

    with pytest.raises(ValueError, match=field):
        database.save_budget_statement_snapshot(snapshot)

    assert database.get_latest_reconciled_budget_statement() is None


def test_save_rejects_noncanonical_statement_end_date_without_writes(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()

    response = client.post(
        "/budget/save",
        json={
            "transactions": [
                {
                    "date": "2026-08-11",
                    "merchant": "Must not persist",
                    "amount_eur": 10.00,
                    "category": "Other",
                    "month": "2026-08",
                }
            ],
            "statement": {
                "filename": "account.pdf",
                "parser": "lhv_pdf",
                "quality": {
                    "status": "reconciled",
                    "statement_rows": 1,
                    "parsed_rows": 1,
                    "opening_balance_eur": 770.00,
                    "closing_balance_eur": 760.00,
                    "balance_difference_eur": 0.0,
                    "statement_end_date": "2026-8-1",
                },
            },
        },
    )

    assert response.status_code == 422
    assert database.get_budget_transactions("2026-08") == []
    assert database.get_latest_reconciled_budget_statement() is None


@pytest.mark.parametrize(
    "statement_end_date",
    ["2026-8-1", "2026-02-31", "not-a-date", {}, b"2026-08-11"],
)
def test_database_snapshot_rejects_invalid_statement_end_date_without_writes(
    monkeypatch, tmp_path, statement_end_date
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()

    with pytest.raises(ValueError, match="statement_end_date"):
        database.save_budget_statement_snapshot(
            {
                "statement_end_date": statement_end_date,
                "opening_balance_eur": 770.00,
                "closing_balance_eur": 760.00,
                "parser": "lhv_pdf",
                "quality_status": "reconciled",
                "statement_rows": 1,
                "parsed_rows": 1,
                "balance_difference_eur": 0.0,
                "filename_hash": "a" * 64,
            }
        )

    assert database.get_latest_reconciled_budget_statement() is None


def test_database_snapshot_rejects_nonzero_subcent_balance_difference(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()

    with pytest.raises(ValueError, match="difference"):
        database.save_budget_statement_snapshot(
            {
                "statement_end_date": "2026-08-11",
                "opening_balance_eur": 100.00,
                "closing_balance_eur": 100.00,
                "parser": "lhv_pdf",
                "quality_status": "reconciled",
                "statement_rows": 0,
                "parsed_rows": 0,
                "balance_difference_eur": 0.004,
                "filename_hash": "a" * 64,
            }
        )

    assert database.get_latest_reconciled_budget_statement() is None


def test_latest_reconciled_statement_excludes_nonzero_subcent_difference(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    connection = database.get_db()
    try:
        connection.execute(
            """INSERT INTO budget_statement_snapshots
               (imported_at, statement_end_date, opening_balance_eur, closing_balance_eur,
                parser, quality_status, statement_rows, parsed_rows,
                balance_difference_eur, filename_hash, metadata_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "2026-08-11T12:00:00+00:00",
                "2026-08-11",
                100.00,
                100.00,
                "lhv_pdf",
                "reconciled",
                0,
                0,
                0.004,
                "a" * 64,
                "{}",
            ),
        )
        connection.commit()
    finally:
        connection.close()

    assert database.get_latest_reconciled_budget_statement() is None


def test_lhv_salary_paid_at_month_end_belongs_to_next_budget_month() -> None:
    raw_text = """
30.05.2026 RAHVUSOOPER ESTONIA
EE471010002006932005
Töötasu 1482517441 2 236.54 2 350.06
"""

    transactions = _parse_lhv_statement_transactions(raw_text)

    assert len(transactions) == 1
    assert transactions[0]["category"] == "Income"
    assert transactions[0]["amount_eur"] == 2236.54
    assert transactions[0]["month"] == "2026-06"


def test_budget_summary_counts_income_positive_and_separates_savings_buckets(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "budget.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)
    database.init_db()
    database.save_budget_transactions([
        {"date": "2026-05-30", "merchant": "RAHVUSOOPER ESTONIA", "amount_eur": 2236.54, "category": "Income", "description": "Töötasu", "source": "test", "month": "2026-06", "is_income": 1},
        {"date": "2026-06-01", "merchant": "Erik OÜ", "amount_eur": 420.00, "category": "Housing", "description": "Rent May", "source": "test", "month": "2026-06", "is_income": 0},
        {"date": "2026-06-17", "merchant": "Diogo", "amount_eur": 337.00, "category": "Emergency Fund", "description": "Emergency fund - deposit", "source": "test", "month": "2026-06", "is_income": 0},
        {"date": "2026-06-30", "merchant": "Lightyear", "amount_eur": 70.42, "category": "Investment", "description": "Lightyear", "source": "test", "month": "2026-06", "is_income": 0},
        {"date": "2026-06-09", "merchant": "Cash deposit", "amount_eur": 1140.00, "category": "Transfers", "description": "Cash deposit from account", "source": "test", "month": "2026-06", "is_income": 0},
        {"date": "2026-06-08", "merchant": "Wolt", "amount_eur": 22.01, "category": "Eating Out", "description": "Wolt", "source": "test", "month": "2026-06", "is_income": 0},
    ])

    summary = database.get_budget_summary("2026-06")

    assert summary["income_total"] == 2236.54
    assert summary["expenses_total"] == 442.01
    assert summary["invested_total"] == 70.42
    assert summary["emergency_fund_total"] == 337.00
    assert summary["transfers_total"] == 1140.00
    assert summary["savings_total"] == 407.42
    assert summary["savings_rate"] == 18.2
    assert summary["by_category"]["Income"]["total"] == 2236.54


def test_transaction_only_conflict_preserves_receipt_identity_and_updates_review_fields(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "budget-reimport.db")
    database.init_db()
    parsed = _parse_reconciled_statement_receipt()
    original = parsed["transactions"][0]
    saved = client.post(
        "/budget/save",
        json={
            "transactions": parsed["transactions"],
            "statement_receipt_id": parsed["receipt_id"],
        },
    )
    assert saved.status_code == 200
    corrected = {
        **original,
        "category": "Reviewed category",
        "description": "Untrusted replacement",
        "source": "text",
        "month": "2026-06",
        "is_income": 1,
    }

    changed = database.save_budget_transactions([corrected])

    transactions = database.get_budget_transactions("2026-06")
    assert changed == 1
    assert len(transactions) == 1
    assert transactions[0]["date"] == original["date"]
    assert transactions[0]["merchant"] == original["merchant"]
    assert transactions[0]["amount_eur"] == original["amount_eur"]
    assert transactions[0]["description"] == original["description"]
    assert transactions[0]["source"] == original["source"]
    assert transactions[0]["category"] == "Reviewed category"
    assert transactions[0]["month"] == "2026-06"
    assert transactions[0]["is_income"] == 1


def test_budget_memory_profile_can_be_persisted(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "budget-memory.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)
    database.init_db()

    saved = database.save_budget_memory_profile({"savings_target_pct": 30, "merchant_rules": []})
    loaded = database.get_budget_memory_profile()

    assert saved["savings_target_pct"] == 30
    assert loaded == saved


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


def _save_authoritative_statement_for_investment_capacity(
    raw_text: str | None = None,
    month: str = "2026-08",
) -> None:
    parsed = _parse_reconciled_statement_receipt(
        raw_text or """
01.08.2026 Starting balance 1 000.00
11.08.2026 Shop
1500000001 -240.00 760.00
11.08.2026 Final balance 760.00
"""
    )
    saved = client.post(
        "/budget/save",
        json={
            "transactions": parsed["transactions"],
            "statement_receipt_id": parsed["receipt_id"],
        },
    )
    assert saved.status_code == 200
    database.save_budget_transactions(
        [
            {
                "date": f"{month}-01",
                "merchant": "Salary",
                "amount_eur": 3006.84,
                "category": "Income",
                "description": "Salary",
                "source": "test",
                "month": month,
                "is_income": 1,
            }
        ]
    )


def test_investment_capacity_uses_approved_policy_and_receipt_backed_snapshot(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "authority.db")
    database.init_db()
    database.save_budget_memory_profile(
        {
            "version": 2,
            "emergency_fund_floor_eur": 5000,
            "emergency_fund_balance_eur": 5000,
            "checking_buffer_eur": 300,
            "food_budget_eur": 200,
            "essential_spending_ceiling_eur": 950,
            "salary_day_cutoff": 25,
            "recurring_obligations": [],
            "merchant_rules": [],
        }
    )
    _save_authoritative_statement_for_investment_capacity()

    with patch("jarvis.api.routers.budget.clock.today", return_value=date(2026, 8, 11)):
        response = client.get("/budget/investment-capacity?month=2026-08")

    assert response.status_code == 200
    data = response.json()
    assert data["cash_capacity_eur"] == 260.00
    assert data["source"]["statement_end_date"] == "2026-08-11"
    assert data["source"]["receipt_verified"] == 1
    assert data["policy_version"] == 2
    assert len(data["input_hash"]) == 64
    json.dumps(data)


def test_investment_capacity_hash_covers_full_decision_inputs(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "authority.db")
    database.init_db()
    _save_authoritative_statement_for_investment_capacity()

    with patch("jarvis.api.routers.budget.clock.today", return_value=date(2026, 8, 11)):
        first = client.get("/budget/investment-capacity?month=2026-08").json()
        repeated = client.get("/budget/investment-capacity?month=2026-08").json()
    database.save_budget_memory_profile({"recurring_obligations": [{"name": "utilities", "amount_eur": 120, "contains": ["utilities"]}]})
    with patch("jarvis.api.routers.budget.clock.today", return_value=date(2026, 8, 11)):
        changed = client.get("/budget/investment-capacity?month=2026-08").json()

    assert first["input_hash"] == repeated["input_hash"]
    assert changed["input_hash"] != first["input_hash"]
    assert changed["protected_cash"]["unpaid_bills_eur"] == 120.0


def test_investment_capacity_blocks_without_receipt_backed_snapshot(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "missing.db")
    database.init_db()
    database.save_budget_statement_snapshot(
        {
            "statement_end_date": "2026-08-11",
            "opening_balance_eur": 1000,
            "closing_balance_eur": 760,
            "parser": "lhv_pdf",
            "quality_status": "reconciled",
            "statement_rows": 1,
            "parsed_rows": 1,
            "balance_difference_eur": 0,
            "filename_hash": "a" * 64,
        }
    )

    response = client.get("/budget/investment-capacity?month=2026-08")

    assert response.status_code == 200
    assert response.json()["data_ready"] is False
    assert "No reconciled" in response.json()["blockers"][0]
    assert response.json()["weekly_budget_eur"] == 0.0


def test_unpaid_recurring_bill_reduces_cash_capacity() -> None:
    profile = {
        "recurring_obligations": [
            {"name": "utilities", "amount_eur": 120, "contains": ["utilities", "alexela"]}
        ]
    }

    assert budget_router._unpaid_recurring_bills(profile, []) == 120.0
    assert budget_router._unpaid_recurring_bills(
        profile, [{"merchant": "Alexela", "description": "electricity"}]
    ) == 0.0


@pytest.mark.parametrize(
    "obligations",
    [
        "utilities",
        [{"amount_eur": 120, "contains": "utilities"}],
        [{"amount_eur": 120, "contains": None}],
        [{"amount_eur": 120, "contains": 1}],
        [{"amount_eur": 120, "contains": []}],
        [{"contains": ["utilities"]}],
        [{"amount_eur": "NaN", "contains": ["utilities"]}],
        [{"amount_eur": "120", "contains": ["utilities"]}],
        [{"amount_eur": True, "contains": ["utilities"]}],
        [{"amount_eur": -1, "contains": ["utilities"]}],
        ["utilities"],
        [
            {"amount_eur": 1e308, "contains": ["utilities"]},
            {"amount_eur": 1e308, "contains": ["electricity"]},
        ],
    ],
)
def test_unpaid_recurring_bills_rejects_malformed_obligations(obligations) -> None:
    assert budget_router._unpaid_recurring_bills(
        {"recurring_obligations": obligations}, []
    ) is None


@pytest.mark.parametrize(
    "obligations",
    [
        "utilities",
        [{"amount_eur": 120, "contains": "utilities"}],
        [{"amount_eur": 120, "contains": None}],
        [{"amount_eur": 120, "contains": 1}],
        [{"amount_eur": 120, "contains": []}],
        [{"contains": ["utilities"]}],
        [{"amount_eur": "NaN", "contains": ["utilities"]}],
        [{"amount_eur": "120", "contains": ["utilities"]}],
        [{"amount_eur": True, "contains": ["utilities"]}],
        [{"amount_eur": -1, "contains": ["utilities"]}],
        ["utilities"],
        [
            {"amount_eur": 1e308, "contains": ["utilities"]},
            {"amount_eur": 1e308, "contains": ["electricity"]},
        ],
    ],
)
def test_investment_capacity_blocks_malformed_recurring_obligations(
    monkeypatch, tmp_path, obligations
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "authority.db")
    database.init_db()
    database.save_budget_memory_profile({"recurring_obligations": obligations})
    _save_authoritative_statement_for_investment_capacity()

    response = TestClient(app, raise_server_exceptions=False).get(
        "/budget/investment-capacity?month=2026-08"
    )

    assert response.status_code == 200
    data = response.json()
    assert data["data_ready"] is False
    assert data["weekly_budget_eur"] == 0.0
    assert any("recurring_obligations" in blocker for blocker in data["blockers"])


def test_investment_capacity_blocks_explicitly_null_required_policy(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "authority.db")
    database.init_db()
    database.save_budget_memory_profile({"emergency_fund_balance_eur": None})
    _save_authoritative_statement_for_investment_capacity()

    with patch("jarvis.api.routers.budget.clock.today", return_value=date(2026, 8, 11)):
        response = client.get("/budget/investment-capacity?month=2026-08")

    assert response.status_code == 200
    data = response.json()
    assert data["data_ready"] is False
    assert data["weekly_budget_eur"] == 0.0
    assert "Cash-flow policy is missing emergency_fund_balance_eur." in data["blockers"]


@pytest.mark.parametrize(
    ("field", "invalid_value"),
    [
        ("checking_buffer_eur", True),
        ("checking_buffer_eur", "300"),
        ("checking_buffer_eur", float("nan")),
        ("checking_buffer_eur", float("inf")),
        ("salary_day_cutoff", True),
        ("salary_day_cutoff", "25"),
        ("salary_day_cutoff", 0),
        ("salary_day_cutoff", 32),
    ],
)
def test_investment_capacity_blocks_invalid_required_policy_value(
    monkeypatch, tmp_path, field: str, invalid_value: object
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "authority.db")
    database.init_db()
    database.save_budget_memory_profile({field: invalid_value})
    _save_authoritative_statement_for_investment_capacity()

    response = TestClient(app, raise_server_exceptions=False).get(
        "/budget/investment-capacity?month=2026-08"
    )

    assert response.status_code == 200
    data = response.json()
    assert data["data_ready"] is False
    assert data["weekly_budget_eur"] == 0.0
    assert f"Cash-flow policy has invalid {field}." in data["blockers"]
    assert "input_hash" not in data
    json.dumps(data, allow_nan=False)


@pytest.mark.parametrize("malformed_component", ["snapshot", "summary"])
def test_investment_capacity_blocks_non_json_safe_hash_input(
    monkeypatch, malformed_component: str
) -> None:
    snapshot = {
        "closing_balance_eur": 760,
        "statement_end_date": "2026-08-11",
        "quality_status": "reconciled",
        "parser": "lhv_pdf",
        "receipt_verified": 1,
    }
    summary = {
        "income_total": 3006.84,
        "expenses_total": 622.32,
        "invested_total": 0,
        "emergency_fund_total": 1392,
        "by_category": {},
    }
    if malformed_component == "snapshot":
        snapshot["closing_balance_eur"] = float("nan")
    else:
        summary["income_total"] = float("nan")
    monkeypatch.setattr(database, "get_latest_reconciled_budget_statement", lambda: snapshot)
    monkeypatch.setattr(database, "get_budget_summary", lambda month: summary)
    monkeypatch.setattr(database, "get_budget_transactions", lambda month: [])

    with patch("jarvis.api.routers.budget.clock.today", return_value=date(2026, 8, 11)):
        response = TestClient(app, raise_server_exceptions=False).get(
            "/budget/investment-capacity?month=2026-08"
        )

    assert response.status_code == 200
    data = response.json()
    assert data["data_ready"] is False
    assert data["weekly_budget_eur"] == 0.0
    assert "input_hash" not in data
    json.dumps(data, allow_nan=False)


def test_investment_capacity_reads_clock_once_for_default_month_and_authority_date(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "authority.db")
    database.init_db()
    _save_authoritative_statement_for_investment_capacity(
        """
25.08.2026 Starting balance 1 000.00
25.08.2026 Shop
1500000001 -240.00 760.00
25.08.2026 Final balance 760.00
"""
    )

    with patch(
        "jarvis.api.routers.budget.clock.today",
        side_effect=[date(2026, 8, 31), date(2026, 9, 2)],
    ) as today:
        response = client.get("/budget/investment-capacity")

    assert response.status_code == 200
    assert today.call_count == 1
    assert response.json()["data_ready"] is True


@pytest.mark.parametrize("month", ["2026-8", "2026-13", "not-a-month"])
def test_investment_capacity_rejects_noncanonical_month(month: str) -> None:
    response = client.get(f"/budget/investment-capacity?month={month}")

    assert response.status_code == 422
