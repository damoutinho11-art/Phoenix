from datetime import date
from unittest.mock import patch

from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.api.routers.budget import _generate_budget_insight, _parse_lhv_statement_transactions
from jarvis.data import database


client = TestClient(app)


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
