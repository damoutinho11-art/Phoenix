# Finance Cash-Flow Authority Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PHOENIX's fixed weekly investment budget with a deterministic, fail-closed budget calculated from a reconciled bank balance and the approved household-cash policy.

**Architecture:** A pure Finance-domain calculator accepts integer-cent cash-flow inputs and returns an immutable authority result. Budget persists reconciled statement snapshots and assembles current cash-flow inputs from SQLite; the Finance router injects the calculated weekly amount into an in-memory portfolio-state copy before calling the existing allocation engine. Budget and Finance UI surfaces expose the same authority payload and provenance.

**Tech Stack:** Python 3, FastAPI, Pydantic, SQLite, pytest, React, Vite, Node test runner.

## Global Constraints

- Emergency-fund floor: EUR 5,000.
- Emergency-fund monthly contribution: EUR 0 while the verified balance is at least EUR 5,000.
- Everyday-account floor: EUR 300; it is a persistent minimum balance, not a monthly contribution.
- Monthly food reserve: EUR 200.
- Monthly essential-spending ceiling: EUR 950.
- Buys remain weekly and manual; no broker integration, order creation, or automatic execution.
- Currency arithmetic uses integer cents and deterministic half-up rounding.
- The emergency fund is excluded from deployable cash and portfolio allocation.
- Missing, stale, or unreconciled household cash data blocks recommendations; the fixed EUR 115.38 value is never a fallback.
- Do not edit or revert unrelated changes in `jarvis/domains/finance/portfolio_state.json`.

---

## File Structure

- Create `jarvis/domains/finance/cashflow_authority.py`: pure policy validation, weekly-window counting, and capacity arithmetic.
- Create `jarvis/domains/finance/tests/test_cashflow_authority.py`: unit and boundary tests for the pure calculator.
- Modify `jarvis/data/database.py`: statement-snapshot schema and persistence helpers.
- Modify `jarvis/api/routers/budget.py`: policy defaults, statement-aware save contract, and authority assembly endpoint.
- Modify `jarvis/api/tests/test_budget_routes.py`: persistence, reconciliation, and authority API tests.
- Modify `jarvis/api/routers/finance.py`: fail-closed authority gate and in-memory weekly-budget injection.
- Modify `jarvis/api/tests/test_finance_routes.py`: dynamic-budget and blocker route tests.
- Modify `jarvis/api/tests/test_finance_manual_buy_checklist.py`: cross-surface budget consistency test.
- Modify `pwa/src/api/client.js`: statement metadata save and cash-authority client methods.
- Modify `pwa/src/components/holo/subs/BudgetContent.jsx`: approved policy controls and authoritative snapshot telemetry.
- Modify `pwa/src/components/holo/subs/FinanceSubs.jsx`: compact Cash Authority line in the existing Brief lane.
- Modify `pwa/src/components/holo/financeControlRoomContract.test.js`: source-contract assertions for both surfaces.
- Modify `jarvis/domains/finance/production_smoke_gate.py`: verify authority consistency and provenance.
- Modify `jarvis/domains/finance/tests/test_production_smoke_gate.py`: smoke-gate regression tests.

---

### Task 1: Pure Cash-Flow Authority Calculator

**Files:**
- Create: `jarvis/domains/finance/cashflow_authority.py`
- Create: `jarvis/domains/finance/tests/test_cashflow_authority.py`

**Interfaces:**
- Consumes: `policy: dict`, `snapshot: dict`, `month_summary: dict`, `today: date`, and `week_closed: bool`.
- Produces: `calculate_cashflow_authority(...) -> dict` with `data_ready`, `blockers`, `weekly_budget_eur`, `deployable_capacity_eur`, `cash_capacity_eur`, `sustainable_capacity_eur`, `remaining_weekly_windows`, and `protected_cash`.

- [ ] **Step 1: Write failing policy and arithmetic tests**

```python
from datetime import date

from jarvis.domains.finance.cashflow_authority import calculate_cashflow_authority


POLICY = {
    "version": 2,
    "emergency_fund_floor_eur": 5000,
    "emergency_fund_balance_eur": 5000,
    "checking_buffer_eur": 300,
    "food_budget_eur": 200,
    "essential_spending_ceiling_eur": 950,
    "salary_day_cutoff": 25,
}


def test_760_cash_protects_food_and_persistent_buffer() -> None:
    result = calculate_cashflow_authority(
        policy=POLICY,
        snapshot={"closing_balance_eur": 760, "statement_end_date": "2026-08-11", "quality_status": "reconciled"},
        month_summary={"income_total": 3006.84, "expenses_total": 622.32, "invested_total": 0, "emergency_fund_total": 1392, "by_category": {}},
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=False,
    )

    assert result["cash_capacity_eur"] == 260.00
    assert result["deployable_capacity_eur"] == 260.00
    assert result["remaining_weekly_windows"] == 3
    assert result["weekly_budget_eur"] == 86.67
    assert result["protected_cash"] == {"checking_buffer_eur": 300.0, "food_eur": 200.0, "unpaid_bills_eur": 0.0, "emergency_shortfall_eur": 0.0}


def test_existing_300_buffer_is_not_added_again_each_month() -> None:
    result = calculate_cashflow_authority(
        policy=POLICY,
        snapshot={"closing_balance_eur": 500, "statement_end_date": "2026-08-11", "quality_status": "reconciled"},
        month_summary={"income_total": 3006.84, "expenses_total": 950, "invested_total": 0, "emergency_fund_total": 0, "by_category": {"Food & Groceries": {"total": 200}}},
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=False,
    )

    assert result["cash_capacity_eur"] == 200.00


def test_emergency_shortfall_is_reserved_before_investing() -> None:
    policy = {**POLICY, "emergency_fund_balance_eur": 4800}
    result = calculate_cashflow_authority(
        policy=policy,
        snapshot={"closing_balance_eur": 760, "statement_end_date": "2026-08-11", "quality_status": "reconciled"},
        month_summary={"income_total": 3006.84, "expenses_total": 950, "invested_total": 0, "emergency_fund_total": 0, "by_category": {"Food & Groceries": {"total": 200}}},
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=False,
    )

    assert result["protected_cash"]["emergency_shortfall_eur"] == 200.00
    assert result["cash_capacity_eur"] == 60.00
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `python -m pytest jarvis/domains/finance/tests/test_cashflow_authority.py -q`

Expected: collection fails with `ModuleNotFoundError: No module named 'jarvis.domains.finance.cashflow_authority'`.

- [ ] **Step 3: Implement the minimal pure calculator**

```python
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP


def _cents(value: object) -> int:
    return int((Decimal(str(value or 0)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _euros(value: int) -> float:
    return float((Decimal(value) / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _next_income_date(today: date, cutoff: int) -> date:
    if today.day <= cutoff:
        return date(today.year, today.month, cutoff)
    first_next = (today.replace(day=28) + timedelta(days=4)).replace(day=1)
    return date(first_next.year, first_next.month, min(cutoff, 28))


def remaining_weekly_windows(today: date, cutoff: int, week_closed: bool) -> int:
    end = _next_income_date(today, cutoff)
    labels = set()
    cursor = today
    while cursor <= end:
        labels.add(cursor.isocalendar()[:2])
        cursor += timedelta(days=1)
    if week_closed:
        labels.discard(today.isocalendar()[:2])
    return max(1, len(labels))


def calculate_cashflow_authority(*, policy: dict, snapshot: dict, month_summary: dict, unpaid_bills_eur: float, today: date, week_closed: bool) -> dict:
    blockers: list[str] = []
    if snapshot.get("quality_status") != "reconciled":
        blockers.append("Checking-account statement is not reconciled.")
    try:
        statement_date = date.fromisoformat(str(snapshot.get("statement_end_date")))
    except ValueError:
        statement_date = None
        blockers.append("Checking-account statement date is missing or invalid.")
    if statement_date and (today - statement_date).days > 7:
        blockers.append("Checking-account statement is older than seven days.")
    required = ("emergency_fund_floor_eur", "emergency_fund_balance_eur", "checking_buffer_eur", "food_budget_eur", "essential_spending_ceiling_eur", "salary_day_cutoff")
    for key in required:
        if policy.get(key) is None:
            blockers.append(f"Cash-flow policy is missing {key}.")
    if blockers:
        return {"data_ready": False, "blockers": blockers, "weekly_budget_eur": 0.0}

    balance = _cents(snapshot["closing_balance_eur"])
    buffer_cents = _cents(policy["checking_buffer_eur"])
    food_spent = _cents((month_summary.get("by_category") or {}).get("Food & Groceries", {}).get("total", 0))
    food_remaining = max(0, _cents(policy["food_budget_eur"]) - food_spent)
    bills = _cents(unpaid_bills_eur)
    emergency_shortfall = max(0, _cents(policy["emergency_fund_floor_eur"]) - _cents(policy["emergency_fund_balance_eur"]))
    cash_capacity = max(0, balance - buffer_cents - food_remaining - bills - emergency_shortfall)
    projected_spending = _cents(month_summary.get("expenses_total")) + bills + food_remaining
    spending_guardrail = max(_cents(policy["essential_spending_ceiling_eur"]), projected_spending)
    sustainable = max(0, _cents(month_summary.get("income_total")) - spending_guardrail - _cents(month_summary.get("emergency_fund_total")) - _cents(month_summary.get("invested_total")) - emergency_shortfall)
    deployable = min(cash_capacity, sustainable)
    windows = remaining_weekly_windows(today, int(policy["salary_day_cutoff"]), week_closed)
    weekly = int((Decimal(deployable) / windows).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return {
        "data_ready": deployable > 0,
        "blockers": [] if deployable > 0 else ["No deployable cash remains after protected reserves."],
        "cash_capacity_eur": _euros(cash_capacity),
        "sustainable_capacity_eur": _euros(sustainable),
        "deployable_capacity_eur": _euros(deployable),
        "weekly_budget_eur": _euros(weekly),
        "remaining_weekly_windows": windows,
        "protected_cash": {"checking_buffer_eur": _euros(buffer_cents), "food_eur": _euros(food_remaining), "unpaid_bills_eur": _euros(bills), "emergency_shortfall_eur": _euros(emergency_shortfall)},
    }
```

- [ ] **Step 4: Add stale-snapshot, spending-cap, and closed-week tests**

```python
def test_statement_older_than_seven_days_blocks() -> None:
    result = calculate_cashflow_authority(
        policy=POLICY,
        snapshot={"closing_balance_eur": 760, "statement_end_date": "2026-08-03", "quality_status": "reconciled"},
        month_summary={"income_total": 3006.84, "expenses_total": 622.32, "invested_total": 0, "emergency_fund_total": 1392, "by_category": {}},
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=False,
    )
    assert result["data_ready"] is False
    assert "older than seven days" in result["blockers"][0]


def test_actual_spending_above_ceiling_lowers_sustainable_capacity() -> None:
    result = calculate_cashflow_authority(
        policy=POLICY,
        snapshot={"closing_balance_eur": 2000, "statement_end_date": "2026-08-11", "quality_status": "reconciled"},
        month_summary={"income_total": 3000, "expenses_total": 1200, "invested_total": 0, "emergency_fund_total": 0, "by_category": {"Food & Groceries": {"total": 200}}},
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=False,
    )
    assert result["sustainable_capacity_eur"] == 1800.00


def test_closed_current_week_counts_only_future_windows() -> None:
    result = calculate_cashflow_authority(
        policy=POLICY,
        snapshot={"closing_balance_eur": 760, "statement_end_date": "2026-08-11", "quality_status": "reconciled"},
        month_summary={"income_total": 3006.84, "expenses_total": 622.32, "invested_total": 0, "emergency_fund_total": 1392, "by_category": {}},
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=True,
    )
    assert result["remaining_weekly_windows"] == 2
    assert result["weekly_budget_eur"] == 130.00
```

- [ ] **Step 5: Run calculator tests and commit**

Run: `python -m pytest jarvis/domains/finance/tests/test_cashflow_authority.py -q`

Expected: all tests pass.

```powershell
git add jarvis/domains/finance/cashflow_authority.py jarvis/domains/finance/tests/test_cashflow_authority.py
git commit -m "feat(finance): calculate verified deployable cash"
```

---

### Task 2: Persist Reconciled Statement Snapshots

**Files:**
- Modify: `jarvis/data/database.py`
- Modify: `jarvis/api/routers/budget.py`
- Modify: `jarvis/api/tests/test_budget_routes.py`

**Interfaces:**
- Produces: `database.save_budget_statement_snapshot(snapshot: dict) -> dict` and `database.get_latest_reconciled_budget_statement() -> dict | None`.
- Extends: `POST /budget/save` to accept optional `statement` metadata alongside transactions.

- [ ] **Step 1: Write failing persistence and route tests**

```python
def test_save_reconciled_pdf_persists_authoritative_balance(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "cashflow.db")
    database.init_db()
    payload = {
        "transactions": [],
        "statement": {
            "filename": "account.pdf",
            "parser": "lhv_pdf",
            "quality": {
                "status": "reconciled",
                "statement_rows": 258,
                "parsed_rows": 258,
                "opening_balance_eur": 1363.38,
                "closing_balance_eur": 760.00,
                "balance_difference_eur": 0.0,
                "statement_end_date": "2026-08-11",
            },
        },
    }

    response = client.post("/budget/save", json=payload)

    assert response.status_code == 200
    snapshot = database.get_latest_reconciled_budget_statement()
    assert snapshot["closing_balance_eur"] == 760.00
    assert snapshot["statement_end_date"] == "2026-08-11"
    assert snapshot["filename_hash"]


def test_save_rejects_unreconciled_statement_metadata() -> None:
    response = client.post("/budget/save", json={"transactions": [], "statement": {"filename": "bad.pdf", "parser": "lhv_pdf", "quality": {"status": "review_required", "balance_difference_eur": 10}}})
    assert response.status_code == 422
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `python -m pytest jarvis/api/tests/test_budget_routes.py -k "persists_authoritative_balance or rejects_unreconciled_statement_metadata" -q`

Expected: FAIL because `SaveRequest` ignores statement metadata and no snapshot helper exists.

- [ ] **Step 3: Add the snapshot table and helpers**

Add this table to `_SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS budget_statement_snapshots (
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
);

CREATE INDEX IF NOT EXISTS idx_budget_statement_snapshots_end
ON budget_statement_snapshots(statement_end_date, imported_at);
```

Implement the helpers with the following validation and ordering:

```python
def save_budget_statement_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    if snapshot.get("quality_status") != "reconciled":
        raise ValueError("Only reconciled statements can become authoritative")
    if abs(float(snapshot.get("balance_difference_eur") or 0)) > 0.005:
        raise ValueError("Statement balance difference must be zero")
    payload = {**snapshot, "imported_at": _utc_now()}
    connection = get_db()
    try:
        cursor = connection.execute(
            """INSERT INTO budget_statement_snapshots
               (imported_at, statement_end_date, opening_balance_eur, closing_balance_eur,
                parser, quality_status, statement_rows, parsed_rows,
                balance_difference_eur, filename_hash, metadata_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (payload["imported_at"], payload["statement_end_date"], payload.get("opening_balance_eur"),
             payload["closing_balance_eur"], payload["parser"], payload["quality_status"],
             payload.get("statement_rows"), payload.get("parsed_rows"), payload["balance_difference_eur"],
             payload["filename_hash"], json.dumps(payload, sort_keys=True)),
        )
        connection.commit()
        return dict(connection.execute("SELECT * FROM budget_statement_snapshots WHERE id=?", (cursor.lastrowid,)).fetchone())
    finally:
        connection.close()


def get_latest_reconciled_budget_statement() -> dict[str, Any] | None:
    connection = get_db()
    try:
        row = connection.execute(
            """SELECT * FROM budget_statement_snapshots
               WHERE quality_status='reconciled' AND ABS(balance_difference_eur) <= 0.005
               ORDER BY statement_end_date DESC, imported_at DESC, id DESC LIMIT 1"""
        ).fetchone()
        return _row_to_dict(row)
    finally:
        connection.close()
```

- [ ] **Step 4: Extend PDF quality and the save contract**

Add `statement_end_date` to `_lhv_statement_quality` by extracting the date attached to `Final balance`. Define Pydantic models:

```python
class StatementSavePayload(BaseModel):
    filename: str
    parser: str
    quality: dict


class SaveRequest(BaseModel):
    transactions: list[dict]
    statement: StatementSavePayload | None = None
```

In `save_transactions`, persist the snapshot only after transaction saving succeeds. Hash the normalized filename with SHA-256 and store only the digest.

- [ ] **Step 5: Run Budget tests and commit**

Run: `python -m pytest jarvis/api/tests/test_budget_routes.py -q`

Expected: all Budget tests pass.

```powershell
git add jarvis/data/database.py jarvis/api/routers/budget.py jarvis/api/tests/test_budget_routes.py
git commit -m "feat(budget): persist reconciled cash snapshots"
```

---

### Task 3: Assemble the Authoritative Budget Decision

**Files:**
- Modify: `jarvis/api/routers/budget.py`
- Modify: `jarvis/api/tests/test_budget_routes.py`

**Interfaces:**
- Produces: `_build_cashflow_authority(month: str, week_closed: bool = False) -> dict`.
- Produces: `GET /budget/investment-capacity` returning the calculator result plus policy and snapshot provenance.

- [ ] **Step 1: Write failing endpoint tests**

```python
def test_investment_capacity_uses_approved_policy_and_snapshot(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "authority.db")
    database.init_db()
    database.save_budget_memory_profile({
        "version": 2,
        "emergency_fund_floor_eur": 5000,
        "emergency_fund_balance_eur": 5000,
        "checking_buffer_eur": 300,
        "food_budget_eur": 200,
        "essential_spending_ceiling_eur": 950,
        "salary_day_cutoff": 25,
        "merchant_rules": [],
    })
    database.save_budget_statement_snapshot({
        "statement_end_date": "2026-08-11", "closing_balance_eur": 760,
        "opening_balance_eur": 1000, "parser": "lhv_pdf", "quality_status": "reconciled",
        "statement_rows": 1, "parsed_rows": 1, "balance_difference_eur": 0, "filename_hash": "abc",
    })
    with patch("jarvis.api.routers.budget.clock.today", return_value=date(2026, 8, 11)):
        response = client.get("/budget/investment-capacity?month=2026-08")

    assert response.status_code == 200
    data = response.json()
    assert data["cash_capacity_eur"] == 260.00
    assert data["source"]["statement_end_date"] == "2026-08-11"
    assert data["policy_version"] == 2
```

- [ ] **Step 2: Run the test and verify RED**

Run: `python -m pytest jarvis/api/tests/test_budget_routes.py -k investment_capacity -q`

Expected: FAIL with HTTP 404.

- [ ] **Step 3: Extend default memory and build the endpoint**

Extend `DEFAULT_BUDGET_MEMORY` with the approved values and `recurring_obligations: []`. Implement obligation matching and authority assembly:

```python
def _unpaid_recurring_bills(profile: dict, transactions: list[dict]) -> float:
    searchable = [f"{row.get('merchant', '')} {row.get('description', '')}".lower() for row in transactions]
    total = 0.0
    for obligation in profile.get("recurring_obligations", []):
        tokens = [str(token).lower() for token in obligation.get("contains", []) if str(token).strip()]
        if not tokens or not any(any(token in row for token in tokens) for row in searchable):
            total += float(obligation.get("amount_eur") or 0)
    return round(total, 2)


def _build_cashflow_authority(month: str, week_closed: bool = False) -> dict:
    profile = _budget_memory_profile()
    snapshot = database.get_latest_reconciled_budget_statement()
    if snapshot is None:
        return {"data_ready": False, "blockers": ["No reconciled checking-account statement is available."], "weekly_budget_eur": 0.0}
    summary = database.get_budget_summary(month)
    transactions = database.get_budget_transactions(month)
    result = calculate_cashflow_authority(
        policy=profile,
        snapshot=snapshot,
        month_summary=summary,
        unpaid_bills_eur=_unpaid_recurring_bills(profile, transactions),
        today=clock.today(),
        week_closed=week_closed,
    )
    source = {"statement_end_date": snapshot["statement_end_date"], "quality_status": snapshot["quality_status"], "parser": snapshot["parser"]}
    fingerprint = json.dumps({"policy": profile, "source": source, "summary": summary, "today": clock.today().isoformat(), "week_closed": week_closed}, sort_keys=True)
    return {**result, "source": source, "policy_version": profile.get("version"), "input_hash": hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()}
```

```python
@router.get("/investment-capacity")
def budget_investment_capacity(month: str = "") -> dict:
    target_month = month or clock.today().strftime("%Y-%m")
    return _build_cashflow_authority(target_month)
```

Include a deterministic SHA-256 `input_hash` over sorted policy, snapshot, summary, unpaid bills, date, and week status.

- [ ] **Step 4: Add fail-closed API tests**

```python
def test_investment_capacity_blocks_without_reconciled_snapshot(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "missing.db")
    database.init_db()
    response = client.get("/budget/investment-capacity?month=2026-08")
    assert response.json()["data_ready"] is False
    assert "No reconciled" in response.json()["blockers"][0]


def test_unpaid_recurring_bill_reduces_cash_capacity() -> None:
    profile = {"recurring_obligations": [{"name": "utilities", "amount_eur": 120, "contains": ["utilities", "alexela"]}]}
    assert _unpaid_recurring_bills(profile, []) == 120.0
    assert _unpaid_recurring_bills(profile, [{"merchant": "Alexela", "description": "electricity"}]) == 0.0
```

```python
@pytest.mark.parametrize(
    ("policy_patch", "snapshot_patch", "expected"),
    [
        ({}, {"statement_end_date": "2026-08-01"}, "older than seven days"),
        ({"emergency_fund_balance_eur": None}, {}, "emergency_fund_balance_eur"),
    ],
)
def test_authority_blocks_unverified_inputs(policy_patch: dict, snapshot_patch: dict, expected: str) -> None:
    result = calculate_cashflow_authority(
        policy={**POLICY, **policy_patch},
        snapshot={"closing_balance_eur": 760, "statement_end_date": "2026-08-11", "quality_status": "reconciled", **snapshot_patch},
        month_summary={"income_total": 3006.84, "expenses_total": 622.32, "invested_total": 0, "emergency_fund_total": 1392, "by_category": {}},
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=False,
    )
    assert result["data_ready"] is False
    assert result["weekly_budget_eur"] == 0.0
    assert any(expected in blocker for blocker in result["blockers"])


def test_exact_300_checking_floor_has_no_deployable_cash() -> None:
    result = calculate_cashflow_authority(
        policy=POLICY,
        snapshot={"closing_balance_eur": 300, "statement_end_date": "2026-08-11", "quality_status": "reconciled"},
        month_summary={"income_total": 3006.84, "expenses_total": 950, "invested_total": 0, "emergency_fund_total": 0, "by_category": {"Food & Groceries": {"total": 200}}},
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=False,
    )
    assert result["data_ready"] is False
    assert result["weekly_budget_eur"] == 0.0
```

- [ ] **Step 5: Run tests and commit**

Run: `python -m pytest jarvis/api/tests/test_budget_routes.py jarvis/domains/finance/tests/test_cashflow_authority.py -q`

Expected: all tests pass.

```powershell
git add jarvis/api/routers/budget.py jarvis/api/tests/test_budget_routes.py
git commit -m "feat(budget): expose investment cash authority"
```

---

### Task 4: Make Finance Consume the Authority

**Files:**
- Modify: `jarvis/api/routers/finance.py`
- Modify: `jarvis/api/tests/test_finance_routes.py`
- Modify: `jarvis/api/tests/test_finance_manual_buy_checklist.py`

**Interfaces:**
- Consumes: `budget._build_cashflow_authority(month, week_closed)`.
- Produces: recommendation field `cashflow_authority` and uses `weekly_budget_eur` for every allocation surface.

- [ ] **Step 1: Write failing Finance integration tests**

```python
def test_recommendation_replaces_fixed_budget_with_cashflow_authority() -> None:
    authority = {"data_ready": True, "blockers": [], "weekly_budget_eur": 86.67, "deployable_capacity_eur": 260.0, "input_hash": "cash-123"}
    with patch("jarvis.api.routers.finance.budget_router._build_cashflow_authority", return_value=authority):
        data = client.get("/finance/recommendation").json()

    assert data["week_budget"] == 86.67
    assert round(sum(item["amount"] for item in data["recommendations"]), 2) == 86.67
    assert data["cashflow_authority"]["input_hash"] == "cash-123"


def test_recommendation_blocks_instead_of_using_legacy_fixed_budget() -> None:
    authority = {"data_ready": False, "blockers": ["Checking-account statement is stale."], "weekly_budget_eur": 0.0}
    with patch("jarvis.api.routers.finance.budget_router._build_cashflow_authority", return_value=authority):
        data = client.get("/finance/recommendation").json()

    assert data["data_ready"] is False
    assert data["recommendations"] == []
    assert data["week_budget"] == 0.0
    assert "stale" in data["warnings"][0].lower()
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `python -m pytest jarvis/api/tests/test_finance_routes.py -k "cashflow_authority or legacy_fixed_budget" -q`

Expected: FAIL because Finance still reads `portfolio_state["weekly_investment_budget"]`.

- [ ] **Step 3: Add the authority gate and in-memory injection**

At the start of `_build_finance_recommendation`, after the already-executed-week check, load the authority for the current month. If blocked, call `_paused_finance_recommendation` with a copied state whose weekly budget is zero and attach `cashflow_authority` to the response.

For a ready authority:

```python
authority = budget_router._build_cashflow_authority(clock.today().strftime("%Y-%m"))
if not authority.get("data_ready"):
    paused_state = {**portfolio_state, "weekly_investment_budget": 0.0}
    response = _paused_finance_recommendation(paused_state, week_label, authority.get("blockers") or ["Cash-flow authority is unavailable."], regime=None)
    response["cashflow_authority"] = authority
    return response

authoritative_state = copy.deepcopy(portfolio_state)
authoritative_state["weekly_investment_budget"] = authority["weekly_budget_eur"]
portfolio_state = authoritative_state
```

Attach the same authority object to successful, week-done, week-approved, brief, and manual-checklist responses. Remove route-level calls that allocate from the unmodified portfolio state.

- [ ] **Step 4: Prove checklist and brief consistency**

Add a test that patches one authority payload, calls `/finance/recommendation`, `/finance/manual-buy-checklist`, and `/finance/brief`, and asserts that all three expose or describe EUR 86.67. Assert the original portfolio-state dependency object remains unchanged at EUR 115.38.

- [ ] **Step 5: Run Finance tests and commit**

Run: `python -m pytest jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_brief_route.py -q`

Expected: all tests pass.

```powershell
git add jarvis/api/routers/finance.py jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_brief_route.py
git commit -m "feat(finance): authorize weekly budget from cash flow"
```

---

### Task 5: Save Snapshot Metadata and Expose Policy in Budget UI

**Files:**
- Modify: `pwa/src/api/client.js`
- Modify: `pwa/src/components/holo/subs/BudgetContent.jsx`
- Modify: `pwa/src/components/holo/financeControlRoomContract.test.js`

**Interfaces:**
- Changes: `saveBudgetTransactions(transactions, statement = null)`.
- Adds: `getBudgetInvestmentCapacity(month)`.

- [ ] **Step 1: Add failing frontend contract assertions**

```javascript
test('budget saves reconciled statement provenance and displays cash authority', async () => {
  const client = await src('../../api/client.js')
  const budget = await src('./subs/BudgetContent.jsx')
  assert.match(client, /statement/)
  assert.match(client, /getBudgetInvestmentCapacity/)
  assert.match(budget, /CASH AUTHORITY/)
  assert.match(budget, /STATEMENT RECONCILED/)
  assert.match(budget, /checking_buffer_eur/)
  assert.match(budget, /food_budget_eur/)
  assert.match(budget, /emergency_fund_floor_eur/)
})
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `cd pwa; node --test src/components/holo/financeControlRoomContract.test.js`

Expected: FAIL because the authority API and labels are absent.

- [ ] **Step 3: Send statement metadata during save**

Keep `filename`, `parser`, and `quality` from the PDF parse response in `UploadStage`, then call:

```javascript
export async function saveBudgetTransactions(transactions, statement = null) {
  return apiFetch('/budget/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions, statement }),
  })
}

export async function getBudgetInvestmentCapacity(month) {
  return apiFetch(`/budget/investment-capacity?month=${encodeURIComponent(month)}`)
}
```

Text imports pass `null` and cannot create authoritative snapshots.

- [ ] **Step 4: Add policy controls and authority telemetry**

Extend `MemoryStage` with the five approved numeric fields using its existing `update` helper. In Budget view render this un-nested, line-separated block:

```jsx
{authority && (
  <section style={{ marginTop: 16, borderTop: `1px solid ${a(ACC, '30')}`, paddingTop: 12 }}>
    <div style={financeLabel({ color: authority.data_ready ? G : Y })}>CASH AUTHORITY · {authority.data_ready ? 'VERIFIED' : 'BLOCKED'}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 10 }}>
      <StatTile label="DEPLOYABLE" value={euro(authority.deployable_capacity_eur)} color={ACC} />
      <StatTile label="WEEKLY" value={euro(authority.weekly_budget_eur)} color={authority.data_ready ? G : Y} />
      <StatTile label="WINDOWS" value={String(authority.remaining_weekly_windows || 0)} color={W} />
    </div>
    <div style={financeMicro({ marginTop: 9, color: a(ACC, '99') })}>
      STATEMENT {authority.source?.statement_end_date || 'UNKNOWN'} · PROTECTED {euro(Object.values(authority.protected_cash || {}).reduce((sum, value) => sum + Number(value || 0), 0))}
    </div>
    {!authority.data_ready && <div style={financeBody({ marginTop: 8, color: Y })}>{(authority.blockers || []).join(' ')}</div>}
  </section>
)}
```

- [ ] **Step 5: Run frontend tests and commit**

Run: `cd pwa; node --test src/components/holo/financeControlRoomContract.test.js`

Expected: all contract tests pass.

```powershell
git add pwa/src/api/client.js pwa/src/components/holo/subs/BudgetContent.jsx pwa/src/components/holo/financeControlRoomContract.test.js
git commit -m "feat(budget-ui): surface verified investment capacity"
```

---

### Task 6: Surface Cash Authority in Finance Brief

**Files:**
- Modify: `pwa/src/components/holo/subs/FinanceSubs.jsx`
- Modify: `pwa/src/components/holo/financeControlRoomContract.test.js`

**Interfaces:**
- Consumes: `recommendation.cashflow_authority`.
- Produces: compact Cash Authority summary in the existing Signal/Brief presentation.

- [ ] **Step 1: Write the failing source-contract test**

```javascript
test('finance brief identifies the authoritative cash-flow budget', async () => {
  const subs = await src('./subs/FinanceSubs.jsx')
  assert.match(subs, /cashflow_authority/)
  assert.match(subs, /CASH AUTHORITY/)
  assert.match(subs, /PROTECTED/)
  assert.match(subs, /REMAINING WEEKLY WINDOWS/)
})
```

- [ ] **Step 2: Run and verify RED**

Run: `cd pwa; node --test src/components/holo/financeControlRoomContract.test.js`

Expected: FAIL because `FinanceSubs.jsx` does not read authority provenance.

- [ ] **Step 3: Extend the brief formatter**

Add these lines after `WEEK BUDGET` when authority exists:

```javascript
const authority = data.cashflow_authority || {}
const protectedTotal = Object.values(authority.protected_cash || {}).reduce((sum, value) => sum + Number(value || 0), 0)
const authorityLines = authority.data_ready
  ? [`CASH AUTHORITY — VERIFIED`, `PROTECTED — ${briefEur(protectedTotal)}`, `DEPLOYABLE — ${briefEur(authority.deployable_capacity_eur)}`, `REMAINING WEEKLY WINDOWS — ${authority.remaining_weekly_windows}`]
  : [`CASH AUTHORITY — BLOCKED`, ...(authority.blockers || []).map(item => `▸ ${item}`)]
```

Insert `authorityLines` into `formatRecommendationBrief` without creating a new panel or top-level tab.

- [ ] **Step 4: Run all PWA tests and build**

Run: `cd pwa; npm test`

Expected: all tests pass.

Run: `cd pwa; npm run build`

Expected: production build succeeds; the existing chunk-size warning is acceptable.

- [ ] **Step 5: Commit**

```powershell
git add pwa/src/components/holo/subs/FinanceSubs.jsx pwa/src/components/holo/financeControlRoomContract.test.js
git commit -m "feat(finance-ui): explain cash authority provenance"
```

---

### Task 7: Production Gate and End-to-End Verification

**Files:**
- Modify: `jarvis/domains/finance/production_smoke_gate.py`
- Modify: `jarvis/domains/finance/tests/test_production_smoke_gate.py`

**Interfaces:**
- Extends: `evaluate_production_smoke(coverage, checklist, recommendation)` to require a ready, reconciled cash authority and equal budgets across recommendation and checklist.

- [ ] **Step 1: Write a failing smoke-gate test**

```python
def test_smoke_gate_rejects_mismatched_cashflow_budget(valid_state: tuple[dict, dict]) -> None:
    coverage, checklist = copy.deepcopy(valid_state)
    recommendation = {
        "week_budget": 86.67,
        "cashflow_authority": {
            "data_ready": True,
            "weekly_budget_eur": 86.67,
            "source": {"quality_status": "reconciled"},
        },
    }
    recommendation["cashflow_authority"] = {"data_ready": True, "weekly_budget_eur": 86.67, "source": {"quality_status": "reconciled"}}
    checklist["week_budget"] = 115.38

    errors = evaluate_production_smoke(coverage, checklist, recommendation)

    assert any("cash-flow authority" in error.lower() for error in errors)
```

- [ ] **Step 2: Run and verify RED**

Run: `python -m pytest jarvis/domains/finance/tests/test_production_smoke_gate.py -q`

Expected: FAIL because the current gate ignores cash authority.

- [ ] **Step 3: Extend the gate**

Change the function signature and add these checks after existing checklist safety checks:

```python
def evaluate_production_smoke(coverage: dict[str, Any], checklist: dict[str, Any], recommendation: dict[str, Any]) -> list[str]:
    errors = list(evaluate_finance_acceptance(coverage))
    # Preserve the existing ETF, checklist, and safety checks above this block.
    authority = recommendation.get("cashflow_authority") or {}
    if authority.get("data_ready") is not True:
        errors.append("cash-flow authority must be ready")
    if (authority.get("source") or {}).get("quality_status") != "reconciled":
        errors.append("cash-flow authority source must be reconciled")
    if recommendation.get("week_budget") != authority.get("weekly_budget_eur"):
        errors.append("recommendation budget must equal cash-flow authority budget")
    if checklist.get("week_budget") != recommendation.get("week_budget"):
        errors.append("manual checklist budget must equal cash-flow authority recommendation budget")
    return errors
```

Update local and live runners to request `/finance/recommendation` and pass it to the gate. Extend the live URL assertion to exactly:

```python
assert requested_urls == [
    "https://example.test/finance/data-coverage",
    "https://example.test/finance/manual-buy-checklist",
    "https://example.test/finance/recommendation",
]
```

- [ ] **Step 4: Run complete verification**

Run: `python -m pytest jarvis/domains/finance/tests jarvis/api/tests/test_budget_routes.py jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_brief_route.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_data_coverage.py -q`

Expected: all selected backend tests pass.

Run: `cd pwa; npm test; npm run build`

Expected: all PWA tests pass and production build succeeds.

Run: `git diff --check; git status --short`

Expected: no whitespace errors; only planned files plus the pre-existing `jarvis/domains/finance/portfolio_state.json` modification appear.

- [ ] **Step 5: Commit the gate**

```powershell
git add jarvis/domains/finance/production_smoke_gate.py jarvis/domains/finance/tests/test_production_smoke_gate.py
git commit -m "test(finance): gate production on cash authority"
```

- [ ] **Step 6: Deploy and verify production**

Deploy Railway and Vercel using the repository's existing deployment workflow. Upload a fresh reconciled LHV statement through Budget, verify the approved policy values, then assert:

```powershell
$base='https://phoenix-production-1fb2.up.railway.app'
$budget=Invoke-RestMethod "$base/budget/investment-capacity?month=2026-08"
$finance=Invoke-RestMethod "$base/finance/recommendation"
$checklist=Invoke-RestMethod "$base/finance/manual-buy-checklist"
[pscustomobject]@{
  budget_ready=$budget.data_ready
  reconciled=$budget.source.quality_status
  authority_weekly=$budget.weekly_budget_eur
  recommendation_weekly=$finance.week_budget
  checklist_weekly=$checklist.week_budget
  no_automatic_execution=($checklist.safety.trades_executed -eq $false)
} | ConvertTo-Json
```

Expected: `budget_ready` is true, `reconciled` is `reconciled`, all three weekly amounts are identical, and `no_automatic_execution` is true.
