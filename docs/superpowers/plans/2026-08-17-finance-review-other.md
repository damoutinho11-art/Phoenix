# Finance Review Other Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an audited post-import Review Other workflow that teaches merchant categories, recomputes every Finance surface consistently, and converts all Finance Budget screens to cyan/blue.

**Architecture:** Immutable verified-statement rows remain the evidence source. Add category-correction and learned-merchant overlay tables, project effective categories through one database boundary, expose revision-checked Budget endpoints, and render a dedicated Review Other subsection through a focused frontend model/component. Recommendation, checklist, and authority continue to consume the same effective verified statement.

**Tech Stack:** Python 3.11, FastAPI, Pydantic, SQLite, React 18, Vite, Node test runner, pytest.

## Global Constraints

- Date, merchant, description, amount, income direction, statement identity, and import ordinal are immutable.
- Category is the only editable transaction field in Review Other.
- `Remember merchant` is optional and enabled by default.
- The known category set is exactly `Housing`, `Food & Groceries`, `Eating Out`, `Transport`, `Subscriptions`, `Health & Sport`, `Shopping`, `Investment`, `Emergency Fund`, `Transfers`, `Income`, `Banking & Fees`, and `Other`.
- Corrections are stored as overlays; never update `budget_statement_import_transactions`.
- Explicit Cash Policy merchant rules outrank learned rules; learned rules outrank built-in classification.
- Receipt-free text rows never enter Review Other and never influence cash authority.
- A correction may change category-based reserves but cannot change total statement income or spending.
- Stale correction revision or replaced source statement returns HTTP 409.
- Malformed category, merchant group, or ordinal returns HTTP 422.
- Every Finance Budget surface uses cyan/blue; no `phx-scope-budget`, orange, or gold Finance chrome remains.
- Phoenix never connects to a broker, creates an order, executes a trade, transfers money, or mutates portfolio state through this workflow.
- Desktop 1440 x 900 and mobile 390 x 844 must have no incoherent overlap or horizontal overflow.

---

## File Structure

- `jarvis/data/database.py`: additive schema, correction transactions, learned rules, effective-category projection, revision calculation.
- `jarvis/api/routers/budget.py`: request validation, category-review endpoints, learned-rule precedence, refreshed response assembly.
- `jarvis/api/tests/test_budget_routes.py`: persistence, API, authority, parser, concurrency, and immutable-evidence regressions.
- `pwa/src/api/client.js`: typed Budget review API calls.
- `pwa/src/components/holo/subs/budgetCategoryReviewModel.js`: pure queue, draft, response, and retry state model.
- `pwa/src/components/holo/subs/budgetCategoryReviewModel.test.js`: focused frontend behavior tests.
- `pwa/src/components/holo/subs/BudgetCategoryReview.jsx`: full Review Other subsection.
- `pwa/src/components/holo/subs/BudgetContent.jsx`: route mode, Review Other entry points, refresh wiring, blue Finance styling.
- `pwa/src/components/holo/financeControlRoomContract.test.js`: source contract and blue-scope assertions.
- `.superpowers/sdd/finance-review-other-task-*.md`: task reports and final QA evidence.

---

### Task 1: Audited Category Overlay Persistence

**Files:**
- Modify: `jarvis/data/database.py:401-470`
- Modify: `jarvis/data/database.py:3484-3595`
- Test: `jarvis/api/tests/test_budget_routes.py`

**Interfaces:**
- Produces: `normalize_budget_merchant(value: str) -> str`
- Produces: `get_budget_category_review_source(month: str) -> dict[str, Any] | None`
- Produces: `get_effective_budget_statement_transactions(statement_import_id: str) -> list[dict[str, Any]]`
- Produces: `get_budget_correction_revision(statement_import_id: str) -> str`
- Produces: `apply_budget_category_correction(statement_import_id: str, expected_revision: str, merchant_key: str, ordinals: list[int], corrected_category: str, remember_merchant: bool) -> dict[str, Any]`
- Produces: `get_active_budget_learned_merchant_rules() -> list[dict[str, Any]]`
- Produces: `deactivate_budget_learned_merchant_rule(rule_id: int) -> bool`

- [ ] **Step 1: Write failing migration and immutability tests**

Add tests that initialize the same temporary database twice and assert both tables and indexes exist exactly once. Save a verified statement with duplicate merchant rows, snapshot the raw import rows, apply a category correction, and assert the raw rows are byte-for-byte unchanged.

```python
before = database.get_budget_statement_import_transactions(import_id)
result = database.apply_budget_category_correction(
    statement_import_id=import_id,
    expected_revision=database.get_budget_correction_revision(import_id),
    merchant_key="vitaminas braga parq",
    ordinals=[1, 4],
    corrected_category="Eating Out",
    remember_merchant=True,
)
after = database.get_budget_statement_import_transactions(import_id)
assert after == before
assert [row["category"] for row in result["effective_transactions"] if row["ordinal"] in {1, 4}] == ["Eating Out", "Eating Out"]
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
python -m pytest jarvis/api/tests/test_budget_routes.py -k "category_correction_schema or category_correction_preserves_import" -q
```

Expected: fail because the correction tables/functions do not exist.

- [ ] **Step 3: Add additive schema and canonical normalization**

Add idempotent table definitions:

```sql
CREATE TABLE IF NOT EXISTS budget_category_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    statement_import_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    transaction_identity_hash TEXT NOT NULL,
    original_category TEXT NOT NULL,
    corrected_category TEXT NOT NULL,
    normalized_merchant TEXT NOT NULL,
    correction_group_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(statement_import_id, ordinal)
);

CREATE TABLE IF NOT EXISTS budget_learned_merchant_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    normalized_merchant TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    source_correction_group_id TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

Implement canonical merchant normalization with NFC normalization, trimmed/collapsed whitespace, and `casefold()`:

```python
def normalize_budget_merchant(value: str) -> str:
    text = unicodedata.normalize("NFC", str(value or "")).strip()
    return " ".join(text.split()).casefold()
```

- [ ] **Step 4: Implement effective projection and deterministic revision**

Load authoritative rows with a left join on `(statement_import_id, ordinal)`. Preserve `category` as the original and expose `effective_category` from the latest correction. Compute revision from stable sorted correction fields:

```python
revision_payload = [
    [row["ordinal"], row["corrected_category"], row["updated_at"]]
    for row in corrections
]
revision = hashlib.sha256(
    json.dumps(revision_payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
).hexdigest()
```

- [ ] **Step 5: Implement one atomic correction transaction**

Inside one `BEGIN IMMEDIATE` transaction:

1. Confirm `expected_revision` matches.
2. Load exact ordinals from the specified import.
3. Confirm every row normalizes to `merchant_key`.
4. Upsert one correction per ordinal while preserving the first original category.
5. When `remember_merchant` is true, upsert and activate the learned merchant rule.
6. Commit, then return refreshed effective rows and revision.

Raise `BudgetCorrectionConflict` for revision mismatch and `ValueError` for malformed ownership/group/category inputs.

- [ ] **Step 6: Add learned-rule deactivate and duplicate-row tests**

Assert duplicate same-day/same-merchant/same-amount rows remain independently addressable by ordinal, learned rules can be deactivated without deleting corrections, and correction rollback leaves both tables unchanged when any ordinal is invalid.

- [ ] **Step 7: Run focused persistence tests and commit**

Run:

```powershell
python -m pytest jarvis/api/tests/test_budget_routes.py -k "category_correction or learned_merchant or duplicate_authoritative" -q
git diff --check
```

Expected: all selected tests pass and diff check is clean.

Commit:

```powershell
git add jarvis/data/database.py jarvis/api/tests/test_budget_routes.py
git commit -m "feat(budget): persist audited category corrections"
```

---

### Task 2: Review API, Effective Authority, And Merchant Learning

**Files:**
- Modify: `jarvis/api/routers/budget.py:90-115`
- Modify: `jarvis/api/routers/budget.py:360-475`
- Modify: `jarvis/api/routers/budget.py:720-910`
- Modify: `jarvis/api/routers/budget.py:980-1110`
- Modify: `jarvis/data/database.py:3484-3595`
- Test: `jarvis/api/tests/test_budget_routes.py`
- Verify: `jarvis/api/tests/test_finance_routes.py`
- Verify: `jarvis/api/tests/test_finance_brief_route.py`
- Verify: `jarvis/api/tests/test_finance_manual_buy_checklist.py`

**Interfaces:**
- Consumes: Task 1 database functions and `BudgetCorrectionConflict`.
- Produces: `GET /budget/category-review?month=YYYY-MM`
- Produces: `POST /budget/category-corrections`
- Produces: `DELETE /budget/learned-merchants/{rule_id}`
- Produces: `_budget_category_review_payload(month: str) -> dict`

- [ ] **Step 1: Write failing endpoint and authority-consistency tests**

Create a verified statement containing two `Other` rows from one merchant and one ledger-only text row. Assert the GET response groups only the verified rows. Apply `Food & Groceries`, then assert:

```python
assert response.status_code == 200
assert response.json()["unresolved_count"] == 0
assert after_summary["income_total"] == before_summary["income_total"]
assert after_summary["expenses_total"] == before_summary["expenses_total"]
assert after_authority["protected_cash"]["food_eur"] < before_authority["protected_cash"]["food_eur"]
assert after_authority["input_hash"] != before_authority["input_hash"]
assert recommendation["week_budget"] == checklist["week_budget"] == after_authority["weekly_budget_eur"]
```

Add 409 tests for stale revision/replaced statement and 422 tests for unknown category, invalid ordinal, mixed merchant group, and attempts to send bank-fact keys.

- [ ] **Step 2: Run route tests and verify RED**

Run:

```powershell
python -m pytest jarvis/api/tests/test_budget_routes.py -k "category_review or correction_endpoint or correction_authority" -q
```

Expected: fail with missing routes/models.

- [ ] **Step 3: Add strict Pydantic request models**

Use extra-field rejection so bank facts cannot be smuggled into correction requests:

```python
class CategoryCorrectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    statement_import_id: str
    expected_revision: str
    merchant_key: str
    ordinals: list[int]
    corrected_category: str
    remember_merchant: bool = True
```

Validate a nonempty canonical merchant key, unique nonnegative ordinals, and a known category. Reject `Income` when immutable `is_income` is `0`, and reject non-`Income` when `is_income` is `1` unless the category is an existing allowed non-spending credit classification.

- [ ] **Step 4: Build one server review projection**

`_budget_category_review_payload(month)` must select only the latest receipt-verified, reconciled PDF source. Group effective `Other` rows by normalized merchant and include exact ordinals plus locked bank facts. Return:

```python
{
    "data_ready": True,
    "blockers": [],
    "statement_import_id": source["statement_import_id"],
    "revision": revision,
    "unresolved_count": len(rows),
    "unresolved_amount_eur": round(sum(abs(row["amount_eur"]) for row in rows), 2),
    "merchant_groups": groups,
    "learned_merchants": learned_rules,
}
```

No verified source returns `data_ready=False`, a clear blocker, and empty groups.

- [ ] **Step 5: Route correction and forget operations**

Map `BudgetCorrectionConflict` to HTTP 409 and validation failures to 422. After a successful correction, return refreshed review payload, verified summary, and authority. DELETE deactivates only the requested rule and returns the active list.

- [ ] **Step 6: Apply overlays to every verified Finance consumer**

Replace direct immutable-row reads inside `_build_cashflow_authority` and verified summary paths with `get_effective_budget_statement_transactions`. Overlay the same corrected category onto the legacy ledger row by immutable transaction identity so category totals update without changing ledger facts. Ensure category correction revision contributes to the authority input hash. Do not change immutable receipt/source validation.

- [ ] **Step 7: Add learned parser precedence**

Update `_budget_memory_rule_for_transaction` to check in this order:

1. explicit Cash Policy rule;
2. active exact normalized learned merchant rule;
3. existing built-in parser heuristics.

Add tests proving an explicit profile rule overrides a conflicting learned rule, forgetting restores built-in behavior, and text parsing may learn categories but remains ledger-only for authority.

- [ ] **Step 8: Run backend integration tests and commit**

Run:

```powershell
python -m pytest jarvis/api/tests/test_budget_routes.py jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_brief_route.py jarvis/api/tests/test_finance_manual_buy_checklist.py -q
git diff --check
```

Expected: zero failures.

Commit:

```powershell
git add jarvis/api/routers/budget.py jarvis/data/database.py jarvis/api/tests/test_budget_routes.py
git commit -m "feat(finance): project corrected budget categories"
```

---

### Task 3: Frontend Review State And API Client

**Files:**
- Create: `pwa/src/components/holo/subs/budgetCategoryReviewModel.js`
- Create: `pwa/src/components/holo/subs/budgetCategoryReviewModel.test.js`
- Modify: `pwa/src/api/client.js:396-435`

**Interfaces:**
- Produces: `getBudgetCategoryReview(month, options = {})`
- Produces: `postBudgetCategoryCorrection(payload)`
- Produces: `deleteBudgetLearnedMerchant(ruleId)`
- Produces: `normalizeCategoryReview(payload) -> ReviewState`
- Produces: `createCategoryReviewDraft(group) -> Draft`
- Produces: `categoryCorrectionOutcome(current, responseOrError) -> Outcome`

- [ ] **Step 1: Write failing pure-model tests**

Test malformed payload fail-closed behavior, exact-cent unresolved totals, merchant/ordinal uniqueness, default `rememberMerchant: true`, forbidden `Income` selection for debit groups, stale 409 refresh state, retryable failure draft retention, and success server-refresh replacement.

```javascript
test('category draft remembers merchant by default and preserves exact ordinals', () => {
  assert.deepEqual(createCategoryReviewDraft({
    merchant_key: 'vitaminas braga parq',
    ordinals: [4, 1],
  }), {
    merchantKey: 'vitaminas braga parq',
    ordinals: [1, 4],
    category: '',
    rememberMerchant: true,
  })
})
```

- [ ] **Step 2: Run model tests and verify RED**

Run:

```powershell
Set-Location pwa
node --test src/components/holo/subs/budgetCategoryReviewModel.test.js
```

Expected: fail because the model module does not exist.

- [ ] **Step 3: Implement strict pure model**

Do not coerce malformed money, ordinals, booleans, or readiness into actionable state. Export one `REVIEW_CATEGORIES` list shared by the UI. Return explicit `loading`, `blocked`, `ready`, `complete`, `stale`, and `error` states.

- [ ] **Step 4: Add API client methods**

```javascript
export async function getBudgetCategoryReview(month, options = {}) {
  return apiFetch(`/budget/category-review?month=${encodeURIComponent(month)}`, options)
}

export async function postBudgetCategoryCorrection(payload) {
  return apiFetch('/budget/category-corrections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function deleteBudgetLearnedMerchant(ruleId) {
  return apiFetch(`/budget/learned-merchants/${encodeURIComponent(ruleId)}`, { method: 'DELETE' })
}
```

- [ ] **Step 5: Run focused model/client tests and commit**

Run:

```powershell
node --test src/components/holo/subs/budgetCategoryReviewModel.test.js src/components/holo/financeControlRoomContract.test.js
```

Expected: all selected tests pass.

Commit:

```powershell
git add pwa/src/api/client.js pwa/src/components/holo/subs/budgetCategoryReviewModel.js pwa/src/components/holo/subs/budgetCategoryReviewModel.test.js
git commit -m "feat(budget-ui): model category review workflow"
```

---

### Task 4: Blue Review Other Experience

**Files:**
- Create: `pwa/src/components/holo/subs/BudgetCategoryReview.jsx`
- Modify: `pwa/src/components/holo/subs/BudgetContent.jsx:1-710`
- Modify: `pwa/src/components/holo/financeControlRoomContract.test.js`
- Test: `pwa/src/components/holo/subs/budgetCategoryReviewModel.test.js`

**Interfaces:**
- Consumes: Task 3 API methods and model functions.
- Produces: `BudgetCategoryReview({ month, onDone, onCancel })`.

- [ ] **Step 1: Write failing source-contract tests**

Assert:

- Budget ledger renders `REVIEW OTHER` only from a positive unresolved count;
- `BudgetCategoryReview` is a full subsection, not a modal;
- bank facts render as text and no amount/date/merchant/description input exists;
- correction uses server statement ID, revision, exact ordinals, category, and remember toggle;
- retryable errors retain the draft and 409 triggers refresh;
- learned rules expose `FORGET`;
- `phx-scope-budget`, orange, and gold are absent from Finance Budget production modules;
- Review Other, upload, ledger, and Cash Policy actions use `ACC` cyan/blue tokens.

- [ ] **Step 2: Run frontend contracts and verify RED**

Run:

```powershell
Set-Location pwa
node --test src/components/holo/financeControlRoomContract.test.js src/components/holo/subs/budgetCategoryReviewModel.test.js
```

Expected: fail on missing Review Other component and remaining Budget scope.

- [ ] **Step 3: Add server-backed Review Other mode**

Extend mode to `view | upload | memory | reviewOther`. Load review metrics with the ledger. Render the command only when `unresolved_count > 0`:

```jsx
{reviewState.status === 'ready' && reviewState.unresolvedCount > 0 && (
  <button onClick={() => setMode('reviewOther')} style={reviewOtherButtonStyle}>
    REVIEW OTHER · {reviewState.unresolvedCount} · {formatReviewMoney(reviewState.unresolvedAmountEur)}
  </button>
)}
```

On `onDone`, reload summary, transactions, review state, and authority from the server.

- [ ] **Step 4: Implement dense merchant queue**

Use stable responsive geometry:

```jsx
<section className="finance-category-review" aria-labelledby="finance-category-review-title">
  <header className="finance-category-review__header">
    <div>
      <p>TRANSACTION CLASSIFICATION</p>
      <h2 id="finance-category-review-title">REVIEW OTHER</h2>
    </div>
    <div aria-label="Review progress">
      {state.unresolvedCount} OPEN · {formatReviewMoney(state.unresolvedAmountEur)}
    </div>
    <button type="button" onClick={onCancel}>RETURN TO LEDGER</button>
  </header>
  <div className="finance-category-review__queue">
    {state.groups.map(group => (
      <MerchantCorrectionRow
        key={group.merchantKey}
        group={group}
        statementImportId={state.statementImportId}
        revision={state.revision}
        onApplied={handleApplied}
      />
    ))}
  </div>
</section>
```

Desktop uses a two-column row with locked evidence left and controls right. At 820 px and below, stack controls beneath evidence. Inputs/buttons use fixed min-heights, wrapping labels, and visible cyan focus. `Apply correction` is disabled until a valid non-current category is selected.

- [ ] **Step 5: Add learned merchant management and complete states**

Render active learned rules below the queue with category and `FORGET`. Empty unresolved state shows `CLASSIFICATION COMPLETE` and a return command. Blocked state explains that a verified statement is required without offering an override.

- [ ] **Step 6: Convert every Finance Budget surface to blue**

Remove all `phx-scope-budget` classes and Budget-orange/gold styling. Use existing Finance-token calls such as `ACC`, `a(ACC, '18')`, `mix(ACC, 30)`, `deep(58)`, and neutral body tokens for normal Finance UI. Keep semantic `G`, `Y`, and `R` only for verified/warning/blocked states, not category identity.

- [ ] **Step 7: Run focused and full PWA verification**

Run:

```powershell
node --test src/components/holo/subs/budgetCategoryReviewModel.test.js src/components/holo/financeControlRoomContract.test.js
npm test
npm run build
```

Expected: zero test failures and successful Vite/PWA build; existing chunk-size warning is acceptable.

- [ ] **Step 8: Commit UI**

```powershell
git add pwa/src/components/holo/subs/BudgetCategoryReview.jsx pwa/src/components/holo/subs/BudgetContent.jsx pwa/src/components/holo/subs/budgetCategoryReviewModel.js pwa/src/components/holo/subs/budgetCategoryReviewModel.test.js pwa/src/components/holo/financeControlRoomContract.test.js
git commit -m "feat(budget-ui): add blue Review Other queue"
```

---

### Task 5: Cross-Surface Verification And Production QA

**Files:**
- Modify only for a regression proven by a failing test or browser reproduction.
- Create: `.superpowers/sdd/finance-review-other-task-5-report.md`

**Interfaces:**
- Confirms all prior task interfaces behave together.

- [ ] **Step 1: Run full Finance backend matrix**

Run:

```powershell
python -m pytest jarvis/domains/finance/tests jarvis/api/tests/test_budget_routes.py jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_brief_route.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_data_coverage.py -q
```

Expected: zero failures.

- [ ] **Step 2: Run complete PWA verification**

Run:

```powershell
Set-Location pwa
npm test
npm run build
```

Expected: zero failures and successful production build.

- [ ] **Step 3: Run isolated Finance smoke gate**

Use a temporary `JARVIS_DB_PATH` and run:

```powershell
python -m jarvis.domains.finance.production_smoke_gate
```

Expected: `accepted: true`, equal authority/recommendation/checklist budgets, and every trading safety flag `false`.

- [ ] **Step 4: Perform desktop and mobile browser QA**

Against a temporary database, seed:

- a verified reconciled statement with repeated `Other` merchants;
- an `Other` food purchase that changes the protected food reserve;
- one ledger-only text row;
- one existing learned rule.

At 1440 x 900 and 390 x 844 verify queue grouping, locked facts, default remember toggle, correction success, stale 409 recovery, forget action, complete state, blue-only Finance chrome, no horizontal overflow, and equal authority/recommendation/checklist budgets. Use the Browser skill and Node browser client, not standalone Playwright.

- [ ] **Step 5: Run whole-branch review and integrity checks**

Generate a diff package from the branch merge base. Review security, immutable evidence, revision races, parser precedence, authority consistency, and responsive UX. Resolve every Critical/Important finding and re-review.

Run:

```powershell
git diff --check
git status --short
```

Expected: clean worktree and no whitespace errors.

- [ ] **Step 6: Merge, deploy, and verify production**

After user approval, fast-forward `main`, push, wait for Railway health and Vercel readiness, then verify:

- `/health` is `ok`;
- production bundle embeds the Railway origin;
- category review returns only verified statement rows;
- live correction updates the ledger and all budget consumers consistently;
- no browser console errors originate from the Phoenix app;
- the user's local `portfolio_state.json` remains untouched.

Do not perform a live category correction without the user's explicit approval of the exact merchant group and category. Production verification may remain read-only when no approved correction is available.
