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

Final commit SHA is recorded in the delivery response.

### Concerns

No implementation concerns. The pre-existing modification to
`.superpowers/sdd/task-1-report.md` remains untouched and uncommitted.
