# Finance Authority Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make policy migration, recurring-bill reserves, statement reconciliation, and authority activation fully usable inside Finance -> Budget while preserving immutable bank evidence and fail-closed recommendations.

**Architecture:** The backend remains the authority boundary: it validates and canonicalizes policy version 2, calculates enabled recurring-bill reserves, issues receipts only for exact statement reconciliation, and exposes complete diagnostics. The PWA uses pure model helpers for policy and bill editing, while `BudgetContent` presents structured controls and a locked-bank-facts review surface. Existing Finance recommendation, brief, and checklist routes continue consuming the shared authority validator.

**Tech Stack:** Python 3, FastAPI, Pydantic, SQLite, pytest, React 18, Vite, Node test runner.

## Global Constraints

- Phoenix never connects to a broker, creates an order, executes a trade, or changes portfolio state from this workflow.
- Bank identity fields are immutable: date, merchant, description, amount, and source.
- Category, inflow/outflow classification, and budget month remain editable before receipt consumption.
- Authority requires an exact zero-cent reconciliation and a valid one-time server receipt.
- Policy version 2 is persisted only after an explicit validated Cash Policy save.
- Legacy profiles with no bills display an enabled Utilities reserve ceiling of EUR 150.
- Historical reserve suggestions remain outside this implementation.
- Preserve the existing Finance visual system and orange Budget accent at desktop and 390 px widths.

---

## File Structure

- `jarvis/domains/finance/cashflow_authority.py`: canonical recurring-bill validation and unpaid-reserve calculation rules.
- `jarvis/api/routers/budget.py`: policy editor payload, server-side save validation, legacy migration presentation, and statement reconciliation diagnostics.
- `jarvis/api/tests/test_budget_routes.py`: route-level migration, validation, diagnostics, and receipt tests.
- `jarvis/domains/finance/tests/test_cashflow_authority.py`: pure bill-reserve calculation tests.
- `pwa/src/components/holo/subs/budgetAuthorityModel.js`: pure frontend policy migration, bill-row editing validation, and reconciliation view-model helpers.
- `pwa/src/components/holo/subs/budgetAuthorityModel.test.js`: frontend model unit tests.
- `pwa/src/components/holo/subs/BudgetContent.jsx`: Cash Policy controls and statement review UI.
- `pwa/src/components/holo/financeControlRoomContract.test.js`: UI contract coverage for labels, controls, and prohibited override behavior.
- `jarvis/domains/finance/production_smoke_gate.py`: unchanged production equality gate, rerun for final verification.

---

### Task 1: Canonical Policy Version 2 Save

**Files:**
- Modify: `jarvis/api/routers/budget.py:38-122, 796-807`
- Test: `jarvis/api/tests/test_budget_routes.py:54-90`

**Interfaces:**
- Produces: `GET /budget/memory -> {profile: dict, migration_required: bool}`.
- Produces: `POST /budget/memory` stores a canonical version 2 profile or returns HTTP 422 without changing stored data.
- Consumes: existing `DEFAULT_BUDGET_MEMORY` and `valid_recurring_obligations`.

- [ ] **Step 1: Write failing migration and rejection tests**

Add tests that save a raw version 1 profile, assert GET returns `migration_required: true` with a display profile containing version 2 and the Utilities default, then POST that profile and assert raw storage now contains version 2. Add parameterized invalid saves for blank money, fractional cents, invalid cutoff, malformed bills, and non-object profiles; assert HTTP 422 and unchanged raw storage.

```python
def test_budget_memory_explicit_save_upgrades_legacy_policy(monkeypatch, tmp_path):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "policy.db")
    database.init_db()
    legacy = {**budget_router.DEFAULT_BUDGET_MEMORY, "version": 1, "recurring_obligations": []}
    database.save_budget_memory_profile(legacy)

    editor = client.get("/budget/memory").json()
    assert editor["migration_required"] is True
    assert editor["profile"]["version"] == 2
    assert editor["profile"]["recurring_obligations"] == [{
        "name": "Utilities",
        "amount_eur": 150.0,
        "contains": ["utility", "electric", "water"],
        "enabled": True,
    }]

    saved = client.post("/budget/memory", json={"profile": editor["profile"]})
    assert saved.status_code == 200
    assert saved.json()["profile"]["version"] == 2
    assert json.loads(database._get_budget_memory_profile_raw())["version"] == 2
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `python -m pytest jarvis/api/tests/test_budget_routes.py -k "memory and (upgrade or invalid)" -q`

Expected: FAIL because GET does not expose `migration_required`, does not seed Utilities, and POST accepts invalid policy data.

- [ ] **Step 3: Implement editor projection and strict save validation**

In `budget.py`, add constants and helpers with these contracts:

```python
APPROVED_CASH_POLICY_VERSION = 2
DEFAULT_UTILITY_OBLIGATION = {
    "name": "Utilities",
    "amount_eur": 150.0,
    "contains": ["utility", "electric", "water"],
    "enabled": True,
}

def _budget_memory_editor_payload() -> dict:
    """Return display-safe version 2 values plus explicit migration status."""

def _validated_budget_memory_for_save(profile: object) -> dict:
    """Return canonical version 2 memory or raise ValueError with a stable field message."""
```

Validate every authority money field as a finite non-negative exact-cent JSON number, cutoff as an integer from 1 through 31, recurring obligations canonically, and known list/dict category fields by type. Always set version 2 after validation. Catch `ValueError` in `save_budget_memory` and return HTTP 422 using its message. Do not alter `_cashflow_authority_policy`; legacy raw policy must remain blocked until explicit save.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `python -m pytest jarvis/api/tests/test_budget_routes.py -k "memory" -q`

Expected: all memory tests pass.

- [ ] **Step 5: Commit Task 1**

```powershell
git add jarvis/api/routers/budget.py jarvis/api/tests/test_budget_routes.py
git commit -m "feat(budget): validate and upgrade cash policy"
```

---

### Task 2: Enabled Recurring-Bill Reserve Semantics

**Files:**
- Modify: `jarvis/domains/finance/cashflow_authority.py:10-16, 264-321`
- Modify: `jarvis/api/routers/budget.py:137-176`
- Test: `jarvis/domains/finance/tests/test_cashflow_authority.py`
- Test: `jarvis/api/tests/test_budget_routes.py`

**Interfaces:**
- Produces: `valid_recurring_obligations(value: object) -> bool` for canonical bill rows.
- Produces: `_unpaid_recurring_bills(profile: dict, transactions: object) -> float | None` where disabled bills reserve zero and any matching term marks an enabled bill paid.
- Consumes: canonical rows from Task 1.

- [ ] **Step 1: Write failing pure and route tests**

Cover: an enabled unmatched Utilities bill reserves EUR 150; a merchant or description match releases it; matching is case-insensitive; a disabled bill reserves zero; invalid `name`, `enabled`, amount, or matching terms blocks authority.

```python
def test_enabled_unmatched_bill_is_protected_until_matching_transaction():
    profile = {"recurring_obligations": [{
        "name": "Utilities", "amount_eur": 150.0,
        "contains": ["electric", "water"], "enabled": True,
    }]}
    assert budget_router._unpaid_recurring_bills(profile, []) == 150.0
    assert budget_router._unpaid_recurring_bills(profile, [{
        "merchant": "Electric Company", "description": "August bill"
    }]) == 0.0
```

- [ ] **Step 2: Run tests and verify RED**

Run: `python -m pytest jarvis/domains/finance/tests/test_cashflow_authority.py jarvis/api/tests/test_budget_routes.py -k "recurring or unpaid_bill" -q`

Expected: FAIL because current validation ignores `name`/`enabled` and disabled rows still reserve cash.

- [ ] **Step 3: Implement canonical validation and enabled matching**

Require `name` as non-empty text, `enabled` as an exact boolean, `amount_eur` as non-negative exact-cent money, and `contains` as a non-empty string list. Update `_unpaid_recurring_bills` to skip disabled rows and preserve case-insensitive any-term matching over merchant plus description.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `python -m pytest jarvis/domains/finance/tests/test_cashflow_authority.py jarvis/api/tests/test_budget_routes.py -k "recurring or unpaid_bill" -q`

Expected: all selected tests pass.

- [ ] **Step 5: Commit Task 2**

```powershell
git add jarvis/domains/finance/cashflow_authority.py jarvis/domains/finance/tests/test_cashflow_authority.py jarvis/api/routers/budget.py jarvis/api/tests/test_budget_routes.py
git commit -m "feat(finance): protect enabled recurring bill reserves"
```

---

### Task 3: Complete Statement Reconciliation Diagnostics

**Files:**
- Modify: `jarvis/api/routers/budget.py:372-444, 815-860`
- Test: `jarvis/api/tests/test_budget_routes.py:200-300`

**Interfaces:**
- Produces: `_lhv_statement_quality(raw_text: str, parsed_rows: int) -> dict` with `unmatched_rows` on every result.
- Produces: `POST /budget/parse-pdf` responses with a complete reconciliation object and no receipt for review-required parses.
- Preserves: existing one-time receipt identity hash and atomic save behavior.

- [ ] **Step 1: Write failing diagnostics tests**

Assert a reconciled parse returns `unmatched_rows: []` and every required metric. Assert a partial parse returns sanitized unmatched row previews, `review_required`, a non-empty warning, and no `receipt_id`. Assert previews are capped at 25 rows and 240 characters each.

```python
def test_pdf_review_required_reports_unmatched_rows_without_receipt():
    raw = """05.05.2026 Starting balance 100.00
05.05.2026 row that cannot match
05.05.2026 Final balance 100.00"""
    with patch("jarvis.api.routers.budget._extract_pdf_text", return_value=raw):
        response = client.post(
            "/budget/parse-pdf",
            files={"file": ("account.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )
    payload = response.json()
    assert payload["quality"]["status"] == "review_required"
    assert payload["quality"]["unmatched_rows"] == ["05.05.2026 row that cannot match"]
    assert "receipt_id" not in payload
```

- [ ] **Step 2: Run tests and verify RED**

Run: `python -m pytest jarvis/api/tests/test_budget_routes.py -k "unmatched_rows or reconciliation" -q`

Expected: FAIL because `unmatched_rows` is absent.

- [ ] **Step 3: Implement bounded unmatched-row diagnostics**

Compute unmatched rows from transaction rows without `_LHV_TAIL_RE` matches. Normalize whitespace, truncate each preview to 240 characters, retain at most 25 previews, and always include the key. Keep receipt issuance unchanged: only `quality.status == "reconciled"` may mint a receipt.

- [ ] **Step 4: Run route and receipt tests and verify GREEN**

Run: `python -m pytest jarvis/api/tests/test_budget_routes.py -k "pdf or statement_receipt or reconciliation" -q`

Expected: all selected tests pass.

- [ ] **Step 5: Commit Task 3**

```powershell
git add jarvis/api/routers/budget.py jarvis/api/tests/test_budget_routes.py
git commit -m "feat(budget): expose reconciliation diagnostics"
```

---

### Task 4: Frontend Policy And Bill Model

**Files:**
- Modify: `pwa/src/components/holo/subs/budgetAuthorityModel.js`
- Test: `pwa/src/components/holo/subs/budgetAuthorityModel.test.js`

**Interfaces:**
- Produces: `createDefaultUtilityBill() -> canonical bill row`.
- Produces: `preparePolicyEditor(profile, migrationRequired) -> editor model`.
- Produces: `validateAuthorityPolicyDraft(profile, rawFields, bills) -> {ok, profile?, error?}`.
- Produces: `reconciliationView(quality, receiptId) -> stable display and activation state`.

- [ ] **Step 1: Write failing model tests**

Test legacy editor preparation, canonical EUR 150 Utilities creation, enabled/disabled bill validation, row-specific errors, forced output version 2, and reconciliation activation only with `status: reconciled`, zero difference, and a receipt.

```javascript
test('legacy policy prepares a version 2 Utilities reserve without persisting implicitly', () => {
  const editor = preparePolicyEditor({ version: 1, recurring_obligations: [] }, true)
  assert.equal(editor.migrationRequired, true)
  assert.deepEqual(editor.bills, [{
    name: 'Utilities', amount_eur: '150.00',
    contains: 'utility, electric, water', enabled: true,
  }])
})
```

- [ ] **Step 2: Run model tests and verify RED**

Run: `node --test src/components/holo/subs/budgetAuthorityModel.test.js`

Expected: FAIL because the new helpers do not exist.

- [ ] **Step 3: Implement pure editor and reconciliation helpers**

Keep all input parsing outside React. Use canonical two-decimal strings for monetary drafts. Convert comma-separated matching terms into trimmed non-empty arrays. Return errors such as `Bill 1 name is required`, `Utilities reserve requires an exact-cent EUR amount`, and `Utilities needs at least one matching term`. Set `profile.version = 2` only in a successful validation result.

`reconciliationView` returns `{reconciled, canActivate, metrics, warnings, unmatchedRows}` and treats missing, malformed, nonzero-difference, or receipt-less data as non-activatable.

- [ ] **Step 4: Run model tests and verify GREEN**

Run: `node --test src/components/holo/subs/budgetAuthorityModel.test.js`

Expected: all model tests pass.

- [ ] **Step 5: Commit Task 4**

```powershell
git add pwa/src/components/holo/subs/budgetAuthorityModel.js pwa/src/components/holo/subs/budgetAuthorityModel.test.js
git commit -m "feat(budget-ui): model cash policy workflow"
```

---

### Task 5: Cash Policy And Locked Statement Review UI

**Files:**
- Modify: `pwa/src/components/holo/subs/BudgetContent.jsx:105-575`
- Modify: `pwa/src/components/holo/financeControlRoomContract.test.js:240-310`

**Interfaces:**
- Consumes: Task 4 editor and reconciliation helpers.
- Consumes: existing `getBudgetMemory`, `saveBudgetMemory`, `parseBudgetPdf`, `saveBudgetTransactions`, and `getBudgetInvestmentCapacity` clients.
- Produces: complete app-only authority setup and activation workflow.

- [ ] **Step 1: Write failing UI contract tests**

Assert the source contains `CASH POLICY`, `SAVE & UPGRADE POLICY`, structured bill controls, `ADD BILL`, `BANK FACTS LOCKED`, `SAVE & ACTIVATE AUTHORITY`, reconciliation metric labels, `RE-PARSE PDF`, and unmatched-row rendering. Assert it contains no `OVERRIDE RECONCILIATION` command and no authority flow that depends on editing recurring-obligations JSON.

- [ ] **Step 2: Run contract tests and verify RED**

Run: `node --test src/components/holo/financeControlRoomContract.test.js`

Expected: FAIL because the current UI uses MEMORY, raw recurring JSON, and generic SAVE ALL copy.

- [ ] **Step 3: Implement Cash Policy screen**

Rename the command and heading to Cash Policy. Read `migration_required` from the memory response. Render authority numeric controls plus structured bill rows with a checkbox toggle, name input, amount input, matching-terms input, remove icon button, and `ADD BILL`. Preserve category lanes and advanced non-authority memory. Use `SAVE & UPGRADE POLICY` for legacy state and `SAVE CASH POLICY` otherwise.

- [ ] **Step 4: Implement locked statement review**

Make Upload PDF the first input mode and label Paste Text as `LEDGER ONLY`. Render reconciliation metrics and warnings through `reconciliationView`. Label date, merchant, description, and amount as locked bank facts; keep only category, flow, and month interactive. Show unmatched rows in a bounded diagnostic list. Enable `SAVE & ACTIVATE AUTHORITY` only when `canActivate` is true. For text imports retain a separate `SAVE LEDGER TRANSACTIONS` command that cannot create authority.

- [ ] **Step 5: Run frontend focused tests and verify GREEN**

Run: `node --test src/components/holo/subs/budgetAuthorityModel.test.js src/components/holo/financeControlRoomContract.test.js`

Expected: all focused tests pass.

- [ ] **Step 6: Commit Task 5**

```powershell
git add pwa/src/components/holo/subs/BudgetContent.jsx pwa/src/components/holo/financeControlRoomContract.test.js
git commit -m "feat(budget-ui): complete cash authority workflow"
```

---

### Task 6: Cross-Surface Verification And Visual QA

**Files:**
- Modify only if a verified regression requires a narrow correction.
- Verify: `jarvis/api/tests/test_budget_routes.py`
- Verify: `jarvis/api/tests/test_finance_routes.py`
- Verify: `jarvis/api/tests/test_finance_brief_route.py`
- Verify: `jarvis/api/tests/test_finance_manual_buy_checklist.py`
- Verify: `jarvis/domains/finance/tests/test_production_smoke_gate.py`
- Verify: all `pwa/src/**/*.test.js`

**Interfaces:**
- Confirms Budget authority, recommendation, checklist, and brief expose the same exact weekly budget.
- Confirms responsive presentation and no unsafe override path.

- [ ] **Step 1: Run full Finance backend verification**

Run:

```powershell
python -m pytest jarvis/domains/finance/tests jarvis/api/tests/test_budget_routes.py jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_brief_route.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_data_coverage.py -q
```

Expected: zero failures.

- [ ] **Step 2: Run complete PWA tests and production build**

Run:

```powershell
Set-Location pwa
npm test
npm run build
```

Expected: zero test failures and successful Vite/PWA output. The existing chunk-size warning is acceptable; new errors are not.

- [ ] **Step 3: Run the standalone authority smoke gate**

Run: `python -m jarvis.domains.finance.production_smoke_gate`

Expected: `accepted: true`; authority, recommendation, and checklist budgets are exactly equal; every trading safety flag remains false.

- [ ] **Step 4: Perform desktop and mobile browser QA**

Start a local backend against a temporary database and a Vite preview configured to it. Seed a legacy profile and exercise both a reconciled fixture and a review-required fixture. At 1440 x 900 and 390 x 844 verify:

- Cash Policy controls are readable and do not overflow.
- Utilities displays EUR 150 and can be enabled, edited, and removed.
- Reconciliation metrics remain aligned.
- Unmatched rows wrap without overlapping actions.
- The activation command is absent or disabled on failure and enabled only for a valid receipt.
- The orange Budget accent remains subordinate to Finance blue chrome.

- [ ] **Step 5: Verify repository integrity**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and only intentional workflow changes.

- [ ] **Step 6: Commit any verified QA correction**

If Step 4 required a narrow correction, stage only those files and commit:

```powershell
git commit -m "fix(budget-ui): polish authority workflow"
```

If no correction was required, do not create an empty commit.

