# Backend Foundation Review 1

## Scope

Reviewed the production and test implementation from Tasks 1–6 (`35c450c` through `25dfcdf`), with emphasis on runtime defaults, persistence isolation, cleanup boundaries, background-job behavior/reporting, shared clock semantics, Finance contract safety, dynamic ETF-leg gates, cockpit numeric validation, and corrected date-sensitive tests.

## Correctness findings

- **Not applicable — production defaults:** `JARVIS_DB_PATH` and `PHOENIX_PORTFOLIO_STATE_PATH` remain opt-in overrides; absent environment variables still resolve to the established repository DB and portfolio JSON. No corrective change required.
- **Not applicable — background jobs:** the production default remains enabled, all three scheduled jobs are created by lifespan when enabled, and `/jarvis/activity` reports the same three jobs only while enabled.
- **Not applicable — clock semantics:** `clock.utc_now()` returns an aware `timezone.utc` datetime, `utc_now_iso()` delegates to it, and local-calendar call sites use `clock.today()` without silently changing their prior semantics.
- **Not applicable — dynamic Finance gates:** acceptance and smoke checks derive the single current ETF sleeve from the current recommendation legs and validate its selected instrument. Focused current-growth and synthetic-quality tests pass.
- **Not applicable — cockpit graph values:** `SeriesPoint.value` rejects `NaN` and both infinities through a finite-value validator.
- **Not applicable — stale date tests:** training expectations now match the constitution's current phase dates and Finance expectations match the current `growth_nasdaq_etf` recommendation.

## Safety findings

- **Fixed — teardown target could be redirected:** `pytest_unconfigure` previously read the mutable `TEST_RUNTIME` global at teardown. Code running during the test session could reassign that name and redirect recursive deletion outside the generated directory.
- **Not applicable — Finance safety/allocation:** no production Finance allocation engine, safety constant, constitution, or tracked portfolio state was changed in Tasks 1–6 or this pass. Gate safety flags remain required to be explicitly false.
- **Not applicable — protected artifacts:** the suite-level digest guard covers the tracked DB, Finance portfolio state, and service worker. This review does not modify those files.

## Test-isolation findings

- **Not applicable — DB/JSON isolation:** root `conftest.py` establishes the temporary DB and copies the portfolio fixture before application modules import persistence configuration. Isolation tests confirm both paths are outside the repository.
- **Fixed — cleanup regression coverage:** added a regression that reassigns `conftest.TEST_RUNTIME` and verifies teardown still targets the originally generated directory.

## Fixes applied

- Captured the generated test-runtime path in the cleanup helper's default argument, so teardown does not follow later mutation of the module global.
- Added `test_pytest_cleanup_cannot_be_redirected_outside_generated_runtime` and observed it fail against the old hook before applying the fix; the focused isolation module then passed (`4 passed`).

## Deferred findings and reasons

- None. No reviewed finding requires a scope-expanding or follow-up production change.
