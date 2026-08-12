# Task 4 Report: Finance Cash-Flow Authority

Status: DONE

## RED

Command:

```powershell
python -m pytest jarvis/api/tests/test_finance_routes.py -k "cashflow_authority or legacy_fixed_budget" -q
```

Result: 2 failed. A ready `86.67` authority still returned the legacy `115.38`
budget, and blocked authority still returned `data_ready=True`.

Command:

```powershell
python -m pytest jarvis/api/tests/test_finance_routes.py -k "data_coverage_exposes_the_recommendation_authority" -q
```

Result: 1 failed with `KeyError: 'cashflow_authority'`; the data-coverage surface
dropped the recommendation authority.

## GREEN

Command:

```powershell
python -m pytest jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_brief_route.py -q
```

Result: `52 passed in 5.91s`.

## Changed Files

- `jarvis/api/routers/finance.py`
- `jarvis/api/tests/test_finance_routes.py`
- `jarvis/api/tests/test_finance_manual_buy_checklist.py`
- `jarvis/api/tests/test_finance_brief_route.py`

## Commit

`13694f8b3d098255eb84b236c924398b9b0c88f1` - `feat(finance): authorize weekly budget from cash flow`

## Self-Review

- Finance obtains one current-month cash-flow authority per recommendation-derived route path.
- Ready authority is injected only into a deep-copied in-memory portfolio state.
- Blocked, malformed, and infrastructure-failed authority produces a zero-budget paused response.
- Recommendation, week-done, week-approved, checklist, brief, and data-coverage responses retain the authority.
- The brief now derives allocation text from the authorized recommendation path instead of allocating from the raw state.
- Existing manual-only execution and risk/constitution gates remain in the shared allocation engine path.
- `portfolio_state.json` was not modified.

## Concerns

No implementation concerns. The pre-existing modification to `.superpowers/sdd/task-1-report.md` was left uncommitted and untouched.

## Review Follow-Up

### RED

```powershell
python -m pytest jarvis/api/tests/test_finance_cashflow_authority_review.py jarvis/api/tests/test_finance_brief_route.py -k "authority or legacy_budget" -q
```

Result: `14 failed`. The failures proved that malformed authority payloads were echoed,
research and chat allocated from `115.38`, blocked research still allocated, and an AI
brief containing the legacy `€115.38` was accepted.

```powershell
python -m pytest jarvis/api/tests/test_finance_cashflow_authority_review.py -k "state_is_unavailable" -q
```

Result: `1 failed`. Chat returned a two-item context tuple on unavailable Finance state
despite the authority-aware caller requiring the three-item form.

### GREEN

```powershell
python -m pytest jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_brief_route.py -q
```

Result: `54 passed in 6.90s`.

```powershell
$researchTests = rg --files jarvis/api/tests | Where-Object { $_ -match 'test_finance_(research|autopilot)' }
python -m pytest $researchTests jarvis/api/tests/test_finance_cashflow_authority_review.py -q
```

Result: `193 passed in 53.43s`. `rg --files` found no standalone chat test file;
the added `test_finance_cashflow_authority_review.py` covers Finance chat context.

### Follow-Up Scope

- Added `jarvis/api/finance_authority.py` to validate, sanitize, and overlay authority.
- Routed Finance recommendations, memo evidence, research autopilot, and chat through it.
- Added route-level malformed payload, memo/autopilot/chat overlay, closed lifecycle, and stale-AI amount regression coverage.
- Confirmed `portfolio_state.json` remained unchanged.

## Final Gate Follow-Up

### RED

```powershell
python -m pytest jarvis/api/tests/test_finance_cashflow_authority_review.py jarvis/api/tests/test_finance_brief_route.py -q
```

Result: `13 failed`. The new regression cases showed that ready payloads with
non-hex or missing provenance remained trusted, Finance chat still accepted the
model path, and an approved brief was paused instead of being closed when the
current authority was blocked.

### GREEN

```powershell
python -m pytest jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_brief_route.py -q
```

Result: `55 passed in 6.34s`.

```powershell
$researchTests = rg --files jarvis/api/tests | Where-Object { $_ -match 'test_finance_(research|autopilot)' }
python -m pytest $researchTests jarvis/api/tests/test_finance_cashflow_authority_review.py -q
```

Result: `205 passed in 50.26s`. This is the exact expanded set previously used
for the 193-test run; it includes the added Finance/chat authority regression
file. `rg --files` found no standalone chat test file.

```powershell
python -m pytest jarvis/api/tests/test_finance_cashflow_authority_review.py jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_brief_route.py jarvis/api/tests/test_budget_routes.py -q
```

Result: `278 passed in 39.25s`.

### Changed Files

- `jarvis/api/finance_authority.py`
- `jarvis/api/routers/finance.py`
- `jarvis/api/routers/chat.py`
- `jarvis/api/tests/test_finance_cashflow_authority_review.py`
- Finance route, brief, checklist, research, and autopilot test fixtures

### Self-Review

- Ready authority now requires exact Task 3 provenance: empty blockers, a
  lowercase SHA-256 input hash, policy version 2, reconciled LHV PDF source,
  verified receipt, exact-zero balance difference, canonical statement date,
  valid statement filename hash, and consistent finite capacities.
- Invalid authority is replaced with a deterministic zero-budget blocked object.
- Executed and approved weeks are projected closed before authority blocking;
  they retain the current authority but never reopen allocation.
- Briefs and Finance allocation-intent chat use deterministic authority-derived
  text and never call the AI gateway.
- Blocked authority is explicit in checklist and data coverage. All allocation
  engine calls use the deep-copied authority overlay.
- `portfolio_state.json` was not modified.

### Commit

`cde9cf6cef63c9e1736992cd2bdd0db1cb08eb61` -
`feat(finance): authorize weekly budget from cash flow`

### Concerns

No implementation concerns. The pre-existing modification to
`.superpowers/sdd/task-1-report.md` remains untouched and uncommitted.

## Final Review: Producer Inputs and Structured Chat

### RED

```powershell
python -m pytest jarvis/domains/finance/tests/test_cashflow_authority.py jarvis/api/tests/test_budget_routes.py jarvis/api/tests/test_finance_cashflow_authority_review.py -q
```

Result: `20 failed, 320 passed`. The failures showed sub-cent source inputs
were silently rounded, the Budget endpoint accepted a sub-cent policy value,
new financial intent language reached the general AI path, stock-media text
could enter Finance, and Finance chat lacked structured lifecycle fields and
a single captured decision date.

### GREEN

```powershell
python -m pytest jarvis/domains/finance/tests/test_cashflow_authority.py jarvis/api/tests/test_budget_routes.py jarvis/api/tests/test_finance_cashflow_authority_review.py -q
```

Result: `340 passed in 56.37s`.

```powershell
python -m pytest jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_brief_route.py -q
```

Result: `55 passed in 7.03s`.

```powershell
$researchTests = rg --files jarvis/api/tests | Where-Object { $_ -match 'test_finance_(research|autopilot)' }
python -m pytest $researchTests jarvis/api/tests/test_finance_cashflow_authority_review.py -q
```

Result: `273 passed in 70.94s`. Chat coverage remains in
`test_finance_cashflow_authority_review.py`; there is no standalone chat test
file.

```powershell
python -m pytest jarvis/api/tests/test_finance_cashflow_authority_review.py jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_brief_route.py jarvis/api/tests/test_budget_routes.py -q
```

Result: `344 passed in 51.81s`.

```powershell
python -m pytest jarvis/domains/finance/tests -q
```

Result: `102 passed in 5.68s`.

### Changed Files

- `jarvis/domains/finance/cashflow_authority.py`
- `jarvis/api/routers/chat.py`
- Budget, Finance authority/chat, and domain cash-flow authority tests

### Self-Review

- Every producer monetary input used by cash-flow calculation now must already
  be an exact cent: policy, recurring obligations, statement balance, unpaid
  bills, summary totals, and food-category totals. Computed results retain
  Decimal `ROUND_HALF_UP` cent semantics.
- Home Finance intent handles planning, scheduling, moving money, purchases,
  buy/sell/hold/review/rebalance/advice with concrete financial assets. Stock
  media is explicitly non-financial, while a financial asset plus `table` is
  still recognized.
- Deterministic Finance chat responses consistently expose `week_closed`,
  `week_budget`, `recommendations`, `cashflow_authority`, and captured `as_of`.
- One chat decision date is captured at route entry and reused by Finance,
  training, nutrition, budget context, and response summary; the midnight
  side-effect test confirms one logical Finance date.
- `jarvis/domains/finance/portfolio_state.json` was not modified.

### Commit

`29e3a74ff7215da4964f720d2421c2381f45b623` -
`feat(finance): authorize weekly budget from cash flow`

### Concerns

No implementation concerns. The pre-existing modification to
`.superpowers/sdd/task-1-report.md` remains untouched and uncommitted.

## Final Gate: Intent, Exact Cents, and Closed Research

### RED

```powershell
python -m pytest jarvis/api/tests/test_finance_cashflow_authority_review.py jarvis/domains/finance/tests/test_cashflow_authority.py jarvis/domains/finance/tests/test_weekly_authority.py -q
```

Result: `12 failed, 121 passed`. The failures demonstrated that the sanitizer
accepted sub-cent authority evidence, a positive deployable balance could
produce a zero-cent weekly authority marked ready, closed research responses
lacked explicit zero-allocation fields, intent morphology missed ordinary asset
management language, and `engine.self_check()` still loaded legacy raw state.

### GREEN

```powershell
python -m pytest jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_brief_route.py -q
```

Result: `55 passed in 8.83s`.

```powershell
$researchTests = rg --files jarvis/api/tests | Where-Object { $_ -match 'test_finance_(research|autopilot)' }
python -m pytest $researchTests jarvis/api/tests/test_finance_cashflow_authority_review.py -q
```

Result: `265 passed in 81.48s`. There is no standalone chat test file; chat
authority and intent coverage is in `test_finance_cashflow_authority_review.py`.

```powershell
python -m pytest jarvis/api/tests/test_finance_cashflow_authority_review.py jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_brief_route.py jarvis/api/tests/test_budget_routes.py -q
```

Result: `335 passed in 67.84s`.

```powershell
python -m pytest jarvis/domains/finance/tests -q
```

Result: `96 passed in 10.05s`.

### Changed Files

- `jarvis/domains/finance/cashflow_authority.py`
- `jarvis/domains/finance/engine.py`
- `jarvis/api/finance_authority.py`
- `jarvis/api/routers/chat.py`
- `jarvis/api/routers/finance.py`
- Budget, Finance, chat, research/autopilot, and domain authority tests

### Self-Review

- The sanitizer rejects all sub-cent EUR evidence, normalizes accepted EUR
  values to two-decimal JSON floats, and deep-copies accepted authority data.
- A positive deployable balance that rounds to zero per weekly window is now
  explicitly blocked by both the calculator and the Budget endpoint.
- Closed lifecycle calls still build authority once with `week_closed=True`,
  but API projections expose a zero, non-ready authority and no new allocation.
- Finance research, memo autopilot, and evidence generation reuse one captured
  decision date through nested helpers; the closed recommendation next-window
  label uses that same date.
- Home intent recognizes realistic buy/sell/hold/review/rebalance/advice asset
  requests while excluding stock media, design portfolios, dinner, furniture,
  and shopping language.
- `engine.self_check()` now exercises the authority-required public builder
  with explicit synthetic proof rather than raw-state allocation.
- `jarvis/domains/finance/portfolio_state.json` was not modified.

### Commit

`bd0bf7040c82f1634781396977ee223378fa8b37` -
`feat(finance): authorize weekly budget from cash flow`

### Concerns

No implementation concerns. The pre-existing modification to
`.superpowers/sdd/task-1-report.md` remains untouched and uncommitted.

## P1 Follow-Up: Arithmetic and Shared Closure

### RED

```powershell
python -m pytest jarvis/api/tests/test_finance_cashflow_authority_review.py -q
```

Result: `7 failed, 57 passed`. The ready-authority sanitizer accepted an
impossible weekly amount (`€260` from `€260 / 3`), incorrect deployable
capacity, boolean/zero window counts, missed sell/hold stock intent, and
misclassified a dinner-table purchase as Finance.

```powershell
python -m pytest jarvis/api/tests/test_finance_cashflow_authority_review.py -q
```

Result: `6 failed, 65 passed` after lifecycle tests were added. Chat and
research/autopilot passed `week_closed=False` despite applied, approved, or
executed current-week state.

### GREEN

```powershell
python -m pytest jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_brief_route.py -q
```

Result: `55 passed in 6.27s`.

```powershell
$researchTests = rg --files jarvis/api/tests | Where-Object { $_ -match 'test_finance_(research|autopilot)' }
python -m pytest $researchTests jarvis/api/tests/test_finance_cashflow_authority_review.py -q
```

Result: `250 passed in 81.57s`. `rg --files` found no standalone chat test;
chat authority coverage is in `test_finance_cashflow_authority_review.py`.

```powershell
python -m pytest jarvis/api/tests/test_finance_cashflow_authority_review.py jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_brief_route.py jarvis/api/tests/test_budget_routes.py -q
```

Result: `319 passed in 52.50s`.

```powershell
python -m pytest jarvis/domains/finance/tests -q
```

Result: `94 passed in 6.00s`.

### Changed Files

- `jarvis/domains/finance/cashflow_authority.py`
- `jarvis/api/finance_lifecycle.py`
- `jarvis/api/routers/finance.py`
- `jarvis/api/routers/chat.py`
- Finance authority, brief, checklist, research, autopilot, and domain weekly
  authority tests

### Self-Review

- Ready authority verifies integer `remaining_weekly_windows >= 1`, cent-level
  deployable minimum, and Decimal `ROUND_HALF_UP` weekly arithmetic.
- One lifecycle snapshot determines closure from applied transactions or
  approved/executed briefs for recommendation, chat, research autopilot, memo
  autopilot, and evidence generation. Nested paths reuse the captured
  authority/lifecycle rather than rebuilding either.
- Closed chat returns deterministic non-actionable text without an open-week
  euro amount; research allocation paths return no new legs and do not invoke
  the allocation engine.
- Home intent recognizes concrete asset-management questions while excluding
  design/site, dinner, furniture, and shopping language. Bare `portfolio` is
  not a financial trigger.
- `portfolio_state.json` was not modified.

### Commit

`b816bf082c5f125be493a8e682bcb59b7219c82e` -
`fix(finance): validate authority arithmetic and closure`

### Concerns

No implementation concerns. The pre-existing modification to
`.superpowers/sdd/task-1-report.md` remains untouched and uncommitted.

## Final Gate: Domain Authority and Intent Isolation

### RED

```powershell
python -m pytest jarvis/domains/finance/tests/test_weekly_authority.py jarvis/api/tests/test_finance_cashflow_authority_review.py -q
```

Result: `12 failed, 42 passed`. The failures proved public domain weekly
reports still allocated from raw portfolio state, the sanitizer accepted stale
and capacity-inconsistent ready data, and ordinary home investment requests
were not consistently authority-gated.

```powershell
python -m pytest jarvis/domains/finance/tests -q
```

Result: `2 failed, 75 passed, 17 errors`. The deterministic acceptance and
smoke harnesses were invoking Finance without a validated synthetic authority,
so their intended transparent fixtures correctly failed closed.

### GREEN

```powershell
python -m pytest jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_brief_route.py -q
```

Result: `55 passed in 6.51s`.

```powershell
$researchTests = rg --files jarvis/api/tests | Where-Object { $_ -match 'test_finance_(research|autopilot)' }
python -m pytest $researchTests jarvis/api/tests/test_finance_cashflow_authority_review.py -q
```

Result: `229 passed in 50.95s`. `rg --files` found no standalone chat test;
chat authority coverage is in `test_finance_cashflow_authority_review.py`.

```powershell
python -m pytest jarvis/api/tests/test_finance_cashflow_authority_review.py jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_brief_route.py jarvis/api/tests/test_budget_routes.py -q
```

Result: `302 passed in 40.49s`.

```powershell
python -m pytest jarvis/domains/finance/tests -q
```

Result: `94 passed in 6.09s`.

### Changed Files

- `jarvis/domains/finance/cashflow_authority.py`
- `jarvis/domains/finance/engine.py`
- `jarvis/domains/finance/acceptance_gate.py`
- `jarvis/domains/finance/production_smoke_gate.py`
- `jarvis/domains/finance/tests/test_weekly_authority.py`
- `jarvis/api/finance_authority.py`
- `jarvis/api/routers/finance.py`
- `jarvis/api/routers/chat.py`
- Finance authority, route, brief, checklist, research, and autopilot tests
- `docs/CLAUDE_CODE_HANDOFF.md`

### Self-Review

- Public domain weekly result/report functions require validated authority and
  return zero-budget, ticket-free blocked projections otherwise.
- Validation is domain-owned, enforces literal receipt provenance, canonical
  seven-day statement dates, finite capacity fields, and weekly-capacity
  consistency. API builders pass one captured date to both Budget and
  validation.
- All Finance/chat/research allocations deep-copy the authority overlay. The
  research helpers also revalidate supplied authority before allocating.
- Home chat recognizes financial action plus financial asset context without
  treating generic shopping or a design portfolio as Finance; no prompt retains
  the legacy fixed allocation example.
- Lifecycle closure is determined before the authority call and propagates
  `week_closed=True`; closed projections expose no current open-week budget.
- Deterministic local acceptance/smoke fixtures now use complete mocked Task 3
  authority rather than any raw-state fallback.
- `portfolio_state.json` was not modified.

### Commit

`b734dfa3fded3b47599805a79f7d4e48706e451d` (superseded by the report-only
amendment SHA below).

### Concerns

No implementation concerns. The pre-existing modification to
`.superpowers/sdd/task-1-report.md` remains untouched and uncommitted.

## P1 Re-Review Follow-Up

### RED

```powershell
python -m pytest jarvis/api/tests/test_finance_cashflow_authority_review.py jarvis/api/tests/test_budget_routes.py -q
```

Result: `8 failed`. The failures reproduced a nutrition-domain
`UnboundLocalError`, generic home shopping loading blocked Finance authority,
integer `1` accepted by the Finance sanitizer, Budget exposing SQLite's integer
receipt flag, and coverage reporting `BLOCKED` before lifecycle closure.

### GREEN

```powershell
python -m pytest jarvis/api/tests/test_finance_cashflow_authority_review.py jarvis/api/tests/test_budget_routes.py -q
```

Result: `228 passed in 41.35s`.

```powershell
python -m pytest jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_brief_route.py -q
```

Result: `55 passed in 6.75s`.

```powershell
$researchTests = rg --files jarvis/api/tests | Where-Object { $_ -match 'test_finance_(research|autopilot)' }
python -m pytest $researchTests jarvis/api/tests/test_finance_cashflow_authority_review.py -q
```

Result: `210 passed in 59.68s`.

```powershell
python -m pytest jarvis/api/tests/test_finance_cashflow_authority_review.py jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_brief_route.py jarvis/api/tests/test_budget_routes.py -q
```

Result: `283 passed in 53.94s`.

### Changed Files

- `jarvis/api/routers/chat.py`
- `jarvis/api/routers/budget.py`
- `jarvis/api/finance_authority.py`
- `jarvis/api/routers/finance.py`
- Budget, Finance, chat, coverage, research, and autopilot tests

### Self-Review

- Home only loads Finance context for unambiguous investment intent; generic
  shopping and nutrition/training/calendar traffic never enters the Finance
  safety path.
- Budget converts only a trusted SQLite integer `receipt_verified == 1` into
  literal `True` on its returned source copy. The shared sanitizer accepts only
  `True` by identity.
- Coverage now returns `WEEK_CLOSED` before authority state, `AUTHORITY_BLOCKED`
  for open authority failures, and retains `BLOCKED` for other blockers.
- No `portfolio_state.json` changes were made.

### Commit

Final re-review implementation SHA is recorded in the delivery response.

### Concerns

No implementation concerns. The pre-existing modification to
`.superpowers/sdd/task-1-report.md` remains untouched and uncommitted.
