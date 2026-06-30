# PHOENIX Backend Integrity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PHOENIX backend tests deterministic and repository-safe, establish explicit time/state boundaries, and produce a trustworthy baseline for additive cockpit read models.

**Architecture:** A root pytest bootstrap redirects SQLite and portfolio JSON writes before application modules import. Persistence paths and background jobs become explicit configuration boundaries, while a small shared clock removes hidden wall-clock coupling from API/persistence code. Existing production defaults and all public API behavior remain unchanged.

**Tech Stack:** Python 3.11, FastAPI, Pydantic, SQLite, pytest, React 18/Vite verification only

## Global Constraints

- Preserve every existing API path and response contract.
- Use only backward-compatible SQLite changes; this phase requires no schema migration.
- Never mutate `jarvis/data/jarvis.db` or `jarvis/domains/finance/portfolio_state.json` during tests.
- Do not change Finance recommendation amounts, allocation, ETF resolution, evidence, approval, ledger, apply, acceptance-gate, or smoke-gate semantics.
- Do not add broker APIs, orders, trades, automatic buying/selling/apply, food auto-logging, Plaan writes, or Google writes.
- Preserve Anthropic as the default AI provider.
- Do not change Home or Finance design.
- Do not stage `pwa/dev-dist/sw.js` or the existing Finance diff artifacts.

---

### Task 1: Install a repository-safe pytest runtime

**Files:**
- Create: `conftest.py`
- Create: `jarvis/api/tests/fixtures/portfolio_state.json`
- Create: `jarvis/api/tests/test_test_runtime_isolation.py`

**Interfaces:**
- Consumes: pytest root-conftest loading before test module collection.
- Produces: `JARVIS_DB_PATH`, `PHOENIX_PORTFOLIO_STATE_PATH`, and `PHOENIX_BACKGROUND_JOBS_ENABLED` test environment variables pointing to a session-temporary runtime.

- [ ] **Step 1: Add the deterministic portfolio fixture**

Create `jarvis/api/tests/fixtures/portfolio_state.json` with a stable, explicit test state rather than reading the mutable production file:

```json
{
  "as_of": "2026-06-29",
  "currency": "EUR",
  "emergency_fund": {"amount": 3600.07, "excluded_from_allocation": true},
  "holdings": {
    "btc": 64.96,
    "discovery": 0.0,
    "global_core_etf": 0.0,
    "growth_nasdaq_etf": 0.0,
    "hype": 0.0,
    "quality_etf": 69.68,
    "tactical_reserve": 4.9,
    "tao": 0.0
  },
  "legacy_holdings": {
    "lhv_growth_cash_pending_settlement": 0.0,
    "lhv_growth_euro_bond": 0.15,
    "lhv_growth_iemm": 364.46,
    "lhv_growth_sxr8": 627.86,
    "lhv_growth_world_equities": 1.51,
    "lhv_growth_xcha": 125.75
  },
  "units": {
    "btc": 0.00123038,
    "discovery": 0,
    "global_core_etf": 0,
    "growth_nasdaq_etf": 0,
    "hype": 0,
    "quality_etf": 0.912001053,
    "tactical_reserve": null,
    "tao": 0,
    "lhv_growth_cash_pending_settlement": 0,
    "lhv_growth_euro_bond": 0.00116,
    "lhv_growth_iemm": 6.225,
    "lhv_growth_sxr8": 0.9054,
    "lhv_growth_world_equities": 0.0335,
    "lhv_growth_xcha": 6.581
  },
  "monthly_investment_budget": 500.0,
  "weekly_investment_budget": 115.38,
  "platform_status": {
    "kraken_ready": false,
    "lhv_crypto_ready": true,
    "lightyear_ready": true,
    "trade_republic_ready": true
  },
  "prices_refreshed_at": "2026-06-29T20:21:17.655998+00:00"
}
```

- [ ] **Step 2: Write isolation contract tests**

Create `jarvis/api/tests/test_test_runtime_isolation.py`:

```python
import os
from pathlib import Path

from jarvis.data import database


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_pytest_database_is_outside_repository() -> None:
    assert REPO_ROOT not in database.DB_PATH.resolve().parents
    assert database.DB_PATH.name == "jarvis-test.db"


def test_pytest_portfolio_state_is_outside_repository() -> None:
    configured = Path(os.environ["PHOENIX_PORTFOLIO_STATE_PATH"]).resolve()
    assert REPO_ROOT not in configured.parents
    assert configured.exists()


def test_background_jobs_are_disabled_for_tests() -> None:
    assert os.environ["PHOENIX_BACKGROUND_JOBS_ENABLED"] == "false"
```

- [ ] **Step 3: Run the isolation tests and verify they fail**

Run:

```powershell
python -m pytest jarvis/api/tests/test_test_runtime_isolation.py -q
```

Expected: FAIL because the root test runtime does not yet redirect persistence.

- [ ] **Step 4: Add the root pytest bootstrap and mutation guard**

Create `conftest.py`:

```python
from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
import warnings
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent
TEST_RUNTIME = Path(tempfile.mkdtemp(prefix="phoenix-pytest-"))
TEST_DB = TEST_RUNTIME / "jarvis-test.db"
TEST_PORTFOLIO = TEST_RUNTIME / "portfolio_state.json"
PORTFOLIO_FIXTURE = REPO_ROOT / "jarvis" / "api" / "tests" / "fixtures" / "portfolio_state.json"
PROTECTED_FILES = (
    REPO_ROOT / "jarvis" / "data" / "jarvis.db",
    REPO_ROOT / "jarvis" / "domains" / "finance" / "portfolio_state.json",
    REPO_ROOT / "pwa" / "dev-dist" / "sw.js",
)


def _digest(path: Path) -> str | None:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


_START_DIGESTS = {path: _digest(path) for path in PROTECTED_FILES}
shutil.copyfile(PORTFOLIO_FIXTURE, TEST_PORTFOLIO)
os.environ["JARVIS_DB_PATH"] = str(TEST_DB)
os.environ["PHOENIX_PORTFOLIO_STATE_PATH"] = str(TEST_PORTFOLIO)
os.environ["PHOENIX_BACKGROUND_JOBS_ENABLED"] = "false"


def pytest_sessionfinish(session, exitstatus) -> None:
    changed = [path for path, digest in _START_DIGESTS.items() if _digest(path) != digest]
    if changed:
        warnings.warn(
            "Tests mutated protected repository files: " + ", ".join(map(str, changed)),
            RuntimeWarning,
        )
        session.exitstatus = 1


def pytest_unconfigure(config) -> None:
    shutil.rmtree(TEST_RUNTIME, ignore_errors=True)
```

- [ ] **Step 5: Run the isolation tests and verify they pass**

Run:

```powershell
python -m pytest jarvis/api/tests/test_test_runtime_isolation.py -q
```

Expected: `3 passed` and no repository file hash changes.

- [ ] **Step 6: Commit the test-runtime boundary**

```powershell
git add conftest.py jarvis/api/tests/fixtures/portfolio_state.json jarvis/api/tests/test_test_runtime_isolation.py
git commit -m "test: isolate PHOENIX runtime state"
```

---

### Task 2: Make portfolio JSON fallback explicitly configurable

**Files:**
- Modify: `jarvis/data/database.py:15-20, 369-385, 1220-1250`
- Modify: `jarvis/api/tests/test_db_path_config.py`
- Modify: `jarvis/api/tests/test_finance_ledger_routes.py:35-60`

**Interfaces:**
- Consumes: `PHOENIX_PORTFOLIO_STATE_PATH` set by Task 1.
- Produces: `database.PORTFOLIO_STATE_JSON_PATH: Path`, used for seed, fallback reads, and backup writes.

- [ ] **Step 1: Write failing persistence-path tests**

Append to `jarvis/api/tests/test_db_path_config.py`:

```python
import json


def test_portfolio_state_seed_uses_configured_json_path(tmp_path, monkeypatch) -> None:
    db = tmp_path / "jarvis.db"
    state_path = tmp_path / "portfolio.json"
    state_path.write_text(json.dumps({"as_of": "2026-06-29", "holdings": {}}), encoding="utf-8")
    _patch_db(monkeypatch, db, "env:JARVIS_DB_PATH")
    monkeypatch.setattr(database, "PORTFOLIO_STATE_JSON_PATH", state_path)

    database.init_db()

    assert database.load_portfolio_state()["as_of"] == "2026-06-29"


def test_portfolio_state_backup_writes_only_configured_path(tmp_path, monkeypatch) -> None:
    db = tmp_path / "jarvis.db"
    state_path = tmp_path / "portfolio.json"
    _patch_db(monkeypatch, db, "env:JARVIS_DB_PATH")
    monkeypatch.setattr(database, "PORTFOLIO_STATE_JSON_PATH", state_path)
    database.init_db()

    database.save_portfolio_state({"as_of": "2026-06-30", "holdings": {"btc": 1.0}})

    assert json.loads(state_path.read_text(encoding="utf-8"))["holdings"]["btc"] == 1.0
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```powershell
python -m pytest jarvis/api/tests/test_db_path_config.py -q
```

Expected: FAIL because `PORTFOLIO_STATE_JSON_PATH` does not exist.

- [ ] **Step 3: Add the configurable state path**

In `jarvis/data/database.py`, define the path once:

```python
_DEFAULT_PORTFOLIO_STATE_JSON_PATH = (
    Path(__file__).resolve().parent.parent / "domains" / "finance" / "portfolio_state.json"
)
PORTFOLIO_STATE_JSON_PATH = Path(
    os.environ.get("PHOENIX_PORTFOLIO_STATE_PATH", _DEFAULT_PORTFOLIO_STATE_JSON_PATH)
)
```

Replace each inline portfolio JSON path in `_migrate_portfolio_state_store`, `load_portfolio_state`, and `save_portfolio_state` with `PORTFOLIO_STATE_JSON_PATH`. Keep SQLite as the preferred source and JSON as fallback/backup.

- [ ] **Step 4: Align the ledger apply fixture**

In `apply_env` in `jarvis/api/tests/test_finance_ledger_routes.py`, patch both engine and database paths:

```python
monkeypatch.setattr(engine, "DEFAULT_PORTFOLIO_STATE_PATH", state_path)
monkeypatch.setattr(database, "PORTFOLIO_STATE_JSON_PATH", state_path)
```

- [ ] **Step 5: Run persistence and ledger tests**

Run:

```powershell
python -m pytest jarvis/api/tests/test_db_path_config.py jarvis/api/tests/test_finance_ledger_routes.py -q
```

Expected: all selected tests pass; protected repository hashes remain unchanged.

- [ ] **Step 6: Commit the configurable state boundary**

```powershell
git add jarvis/data/database.py jarvis/api/tests/test_db_path_config.py jarvis/api/tests/test_finance_ledger_routes.py
git commit -m "fix: isolate portfolio state persistence"
```

---

### Task 3: Disable production background jobs deterministically in tests

**Files:**
- Modify: `jarvis/api/main.py:22-80`
- Create: `jarvis/api/tests/test_app_lifespan.py`
- Modify: `jarvis/api/routers/chat.py:327-352`

**Interfaces:**
- Consumes: `PHOENIX_BACKGROUND_JOBS_ENABLED`.
- Produces: `background_jobs_enabled() -> bool` and `background_job_descriptions() -> list[dict[str, str]]`.

- [ ] **Step 1: Write failing background-job tests**

Create `jarvis/api/tests/test_app_lifespan.py`:

```python
from unittest.mock import patch

from fastapi.testclient import TestClient

from jarvis.api import main


def test_background_jobs_disabled_from_test_environment() -> None:
    assert main.background_jobs_enabled() is False


def test_lifespan_does_not_schedule_jobs_when_disabled() -> None:
    with patch("jarvis.api.main.asyncio.create_task") as create_task:
        with TestClient(main.app):
            pass
    create_task.assert_not_called()


def test_activity_reports_only_enabled_background_jobs() -> None:
    with TestClient(main.app) as client:
        data = client.get("/jarvis/activity").json()
    assert data["background_jobs"] == []
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```powershell
python -m pytest jarvis/api/tests/test_app_lifespan.py -q
```

Expected: FAIL because startup always schedules three tasks and activity always lists them.

- [ ] **Step 3: Implement the explicit job boundary**

Add to `jarvis/api/main.py`:

```python
def background_jobs_enabled() -> bool:
    return os.getenv("PHOENIX_BACKGROUND_JOBS_ENABLED", "true").strip().lower() not in {
        "0", "false", "off", "no"
    }


def background_job_descriptions() -> list[dict[str, str]]:
    if not background_jobs_enabled():
        return []
    return [
        {"name": "keepalive", "cadence": "10 minutes", "effect": "pings /health"},
        {"name": "finance_price_refresh", "cadence": "4 hours", "effect": "refreshes stored market values"},
        {"name": "finance_research_autopilot", "cadence": "24 hours", "effect": "refreshes research evidence"},
    ]
```

Update `lifespan` to initialize the database, schedule tasks only when enabled, and cancel/await all scheduled tasks in `finally` using `asyncio.gather(..., return_exceptions=True)`.

Update `/jarvis/activity` to consume `background_job_descriptions()` rather than maintaining a second hardcoded list. Import `background_job_descriptions` inside the route function to avoid circular import during app construction.

- [ ] **Step 4: Run lifespan and AI/news route tests**

Run:

```powershell
python -m pytest jarvis/api/tests/test_app_lifespan.py jarvis/api/tests/test_ai_news_routes.py -q
```

Expected: all selected tests pass with no network calls or scheduled background jobs.

- [ ] **Step 5: Commit the startup boundary**

```powershell
git add jarvis/api/main.py jarvis/api/routers/chat.py jarvis/api/tests/test_app_lifespan.py
git commit -m "fix: make background jobs explicit"
```

---

### Task 4: Introduce a shared clock for API and persistence code

**Files:**
- Create: `jarvis/core/clock.py`
- Create: `jarvis/core/tests/test_clock.py`
- Modify: `jarvis/data/database.py`
- Modify: `jarvis/api/routers/budget.py`
- Modify: `jarvis/api/routers/chat.py`
- Modify: `jarvis/api/routers/crossdomain.py`
- Modify: `jarvis/api/routers/finance.py`
- Modify: `jarvis/api/routers/health.py`
- Modify: `jarvis/api/routers/nutrition.py`
- Modify: `jarvis/api/routers/training.py`
- Modify: `jarvis/api/main.py`
- Create: `jarvis/api/tests/test_budget_routes.py`

**Interfaces:**
- Produces: `clock.today() -> date`, `clock.utc_now() -> datetime`, and `clock.utc_now_iso() -> str`.
- Consumers import the module (`from jarvis.core import clock`) so tests can patch one boundary.

- [ ] **Step 1: Write clock tests**

Create `jarvis/core/tests/test_clock.py`:

```python
from datetime import date, datetime, timezone
from unittest.mock import patch

from jarvis.core import clock


def test_today_returns_date() -> None:
    assert isinstance(clock.today(), date)


def test_utc_now_is_timezone_aware() -> None:
    assert clock.utc_now().tzinfo == timezone.utc


def test_utc_now_iso_uses_utc_now_boundary() -> None:
    frozen = datetime(2026, 6, 30, 8, 15, tzinfo=timezone.utc)
    with patch("jarvis.core.clock.utc_now", return_value=frozen):
        assert clock.utc_now_iso() == "2026-06-30T08:15:00+00:00"
```

- [ ] **Step 2: Run the clock tests and verify they fail**

Run:

```powershell
python -m pytest jarvis/core/tests/test_clock.py -q
```

Expected: FAIL because `jarvis.core.clock` does not exist.

- [ ] **Step 3: Implement the clock module**

Create `jarvis/core/clock.py`:

```python
from datetime import date, datetime, timezone


def today() -> date:
    return date.today()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat()
```

- [ ] **Step 4: Route wall-clock reads through the module**

In the listed API and persistence files:

- replace `date.today()` with `clock.today()`;
- replace `datetime.now(timezone.utc)` with `clock.utc_now()`;
- replace direct UTC ISO construction with `clock.utc_now_iso()`;
- retain explicit dates passed into pure domain engine functions;
- do not replace timestamp parsing, date constructors, or tests’ explicit fixture dates.

Use module imports, not function imports:

```python
from jarvis.core import clock
```

- [ ] **Step 5: Prove a date-sensitive route is controllable**

Create `jarvis/api/tests/test_budget_routes.py`:

```python
from datetime import date
from unittest.mock import patch

from fastapi.testclient import TestClient


from jarvis.api.main import app


client = TestClient(app)


def test_default_transaction_month_uses_shared_clock() -> None:
    with patch("jarvis.core.clock.today", return_value=date(2030, 1, 2)):
        data = client.get("/budget/transactions").json()
    assert data["month"] == "2030-01"
```

- [ ] **Step 6: Run clock and affected route tests**

Run:

```powershell
python -m pytest jarvis/core/tests/test_clock.py jarvis/api/tests/test_budget_routes.py jarvis/api/tests/test_step6_routes.py jarvis/api/tests/test_training_routes.py jarvis/api/tests/test_nutrition_routes.py jarvis/api/tests/test_finance_routes.py -q
```

Expected: all selected tests pass.

- [ ] **Step 7: Verify no hidden API/persistence wall-clock calls remain**

Run:

```powershell
rg -n "date\.today\(\)|datetime\.now\(timezone\.utc\)" jarvis/api jarvis/data -g "*.py"
```

Expected: only `jarvis/core/clock.py` and explicitly documented adapter code appear.

- [ ] **Step 8: Commit the clock boundary**

```powershell
git add jarvis/core/clock.py jarvis/core/tests/test_clock.py jarvis/data/database.py jarvis/api
git commit -m "refactor: centralize PHOENIX wall clock"
```

Before committing, inspect `git diff --cached --name-only` and unstage any generated database, portfolio state, service worker, or unrelated artifact.

---

### Task 5: Reconcile stale tests with current canonical constitutions and fixtures

**Files:**
- Modify: `jarvis/domains/training/tests/test_training_engine.py`
- Modify: `jarvis/domains/training/tests/test_cross_domain_alerts.py`
- Modify: `jarvis/api/tests/test_finance_routes.py`

**Interfaces:**
- Consumes: the dedicated portfolio fixture and current tracked domain constitutions.
- Produces: tests that assert current contracts without weakening production logic.

- [ ] **Step 1: Run the complete isolated backend suite and capture failures**

Run:

```powershell
python -m pytest -q
```

Expected at this step: failures may remain, but protected file hashes must not change. Save the failure list in the implementation notes; do not edit production logic merely to satisfy stale assertions.

- [ ] **Step 2: Correct known Training date fixtures**

Update tests to match `jarvis/domains/training/constitution.json`:

```text
month_1 start: 2026-06-29
month_2 start: 2026-07-27
peak start: 2026-08-24
attempt start: 2026-08-31
month_1 week 4 start: 2026-07-20
dunk attempt Saturday: 2026-09-05
```

Keep the expected phase/session behavior unchanged; change only stale dates and comments.

- [ ] **Step 3: Correct the Finance canonical fixture assertion**

In `jarvis/api/tests/test_finance_routes.py`, rename `test_summary_as_of_is_2026_06_22` to `test_summary_as_of_matches_canonical_fixture` and assert:

```python
self.assertEqual(data["as_of"], "2026-06-29")
```

Change route tests that implicitly depend on repository SQLite rows to create the required rows in the isolated database or assert the explicit empty state. Do not copy production database rows.

- [ ] **Step 4: Classify every remaining failure before changing code**

For each failure, record one classification in the implementation notes:

```text
STALE_TEST
TEST_ISOLATION
REAL_LOGIC_REGRESSION
NETWORK_NOT_MOCKED
NONDETERMINISTIC_TIME
```

Fix `STALE_TEST`, `TEST_ISOLATION`, `NETWORK_NOT_MOCKED`, and `NONDETERMINISTIC_TIME` at their test/configuration boundary. For `REAL_LOGIC_REGRESSION`, write a focused failing regression test before changing implementation.

If a failure outside the three files listed for this task requires a code or assertion change, stop this task and amend the plan with that exact file, failing assertion, root-cause classification, and focused verification command before editing it.

- [ ] **Step 5: Run focused suites after each classification group**

Run:

```powershell
python -m pytest jarvis/domains/training/tests jarvis/api/tests/test_training_routes.py -q
python -m pytest jarvis/domains/finance/tests jarvis/api/tests/test_finance_routes.py -q
python -m pytest jarvis/domains/nutrition/tests jarvis/api/tests/test_nutrition_routes.py -q
python -m pytest jarvis/domains/calendar/tests jarvis/api/tests/test_calendar_routes.py -q
```

Expected: each focused suite passes before proceeding.

- [ ] **Step 6: Commit fixture reconciliation**

```powershell
git add jarvis/domains/training/tests jarvis/api/tests
git commit -m "test: align fixtures with current PHOENIX contracts"
```

Use `git diff --cached --name-only` to ensure production logic is absent unless a focused red-green regression required a real fix.

---

### Task 6: Add contract metadata primitives for later cockpit slices

**Files:**
- Create: `jarvis/api/models/cockpit.py`
- Create: `jarvis/api/tests/test_cockpit_models.py`

**Interfaces:**
- Produces: `Freshness`, `HistoryStatus`, `Confidence`, `CockpitMeta`, `SeriesPoint`, and `MetricSeries` Pydantic models.
- Later domain plans consume these types without changing current endpoints in this task.

- [ ] **Step 1: Write failing model tests**

Create `jarvis/api/tests/test_cockpit_models.py`:

```python
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from jarvis.api.models.cockpit import CockpitMeta, MetricSeries, SeriesPoint


def test_meta_serializes_truthful_history_status() -> None:
    meta = CockpitMeta(
        as_of="2026-06-30",
        generated_at=datetime(2026, 6, 30, 8, 0, tzinfo=timezone.utc),
        source="real_sqlite",
        freshness="fresh",
        confidence="high",
        history_status="INSUFFICIENT_HISTORY",
    )
    assert meta.model_dump(mode="json")["history_status"] == "INSUFFICIENT_HISTORY"


def test_series_accepts_only_real_explicit_points() -> None:
    series = MetricSeries(
        key="portfolio_total",
        label="Portfolio total",
        unit="EUR",
        points=[SeriesPoint(at="2026-06-30T08:00:00Z", value=1248.32, source="real_sqlite")],
    )
    assert series.points[0].value == 1248.32


def test_series_rejects_non_finite_values() -> None:
    with pytest.raises(ValidationError):
        SeriesPoint(at="2026-06-30", value=float("nan"), source="test")
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```powershell
python -m pytest jarvis/api/tests/test_cockpit_models.py -q
```

Expected: FAIL because the model module does not exist.

- [ ] **Step 3: Implement the shared models**

Create `jarvis/api/models/cockpit.py` with string enums and finite-number validation:

```python
from datetime import datetime
from enum import Enum
from math import isfinite

from pydantic import BaseModel, field_validator


class Freshness(str, Enum):
    FRESH = "fresh"
    STALE = "stale"
    UNKNOWN = "unknown"


class Confidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNKNOWN = "unknown"


class HistoryStatus(str, Enum):
    READY = "READY"
    INSUFFICIENT_HISTORY = "INSUFFICIENT_HISTORY"
    EMPTY = "EMPTY"


class CockpitMeta(BaseModel):
    as_of: str
    generated_at: datetime
    source: str
    freshness: Freshness
    confidence: Confidence
    history_status: HistoryStatus


class SeriesPoint(BaseModel):
    at: str
    value: float
    source: str

    @field_validator("value")
    @classmethod
    def value_must_be_finite(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("series values must be finite")
        return value


class MetricSeries(BaseModel):
    key: str
    label: str
    unit: str
    points: list[SeriesPoint]
```

- [ ] **Step 4: Run model tests**

Run:

```powershell
python -m pytest jarvis/api/tests/test_cockpit_models.py -q
```

Expected: `3 passed`.

- [ ] **Step 5: Commit shared cockpit contracts**

```powershell
git add jarvis/api/models/cockpit.py jarvis/api/tests/test_cockpit_models.py
git commit -m "feat: add typed cockpit metadata models"
```

---

### Task 7: First self-review and corrective pass

**Files:**
- Review all files changed in Tasks 1–6.
- Modify only files needed to address findings.
- Create: `docs/reviews/2026-06-30-backend-foundation-review-1.md`

**Interfaces:**
- Produces: a recorded review with every finding marked `fixed`, `deferred with reason`, or `not applicable`.

- [ ] **Step 1: Review correctness and safety**

Inspect:

```powershell
git log --oneline --reverse ae8c2dd..HEAD
git diff ae8c2dd..HEAD -- jarvis conftest.py
```

Check specifically:

- production defaults remain unchanged;
- tests cannot touch production DB/JSON;
- background jobs remain enabled by default in production;
- test cleanup cannot delete outside its generated temp directory;
- shared clock returns aware UTC datetimes;
- no Finance safety constant or allocation path changed;
- cockpit models reject non-finite graph values.

- [ ] **Step 2: Record and fix findings**

Create `docs/reviews/2026-06-30-backend-foundation-review-1.md` with sections:

```markdown
# Backend Foundation Review 1

## Scope
## Correctness findings
## Safety findings
## Test-isolation findings
## Fixes applied
## Deferred findings and reasons
```

Apply fixes one at a time and rerun the nearest focused test after each fix.

- [ ] **Step 3: Run the full backend suite**

```powershell
python -m pytest -q
```

Expected: all collected backend tests pass and no protected file hash changes occur.

- [ ] **Step 4: Commit the first review pass**

```powershell
git add docs/reviews/2026-06-30-backend-foundation-review-1.md
git add -u jarvis conftest.py
git commit -m "review: harden backend integrity foundation"
```

---

### Task 8: Second self-review, performance pass, and final verification

**Files:**
- Review all Phase 1 changes.
- Modify only files needed to address findings.
- Create: `docs/reviews/2026-06-30-backend-foundation-review-2.md`

**Interfaces:**
- Produces: verified foundation ready for the Finance vertical-slice plan.

- [ ] **Step 1: Review maintainability and performance**

Check:

- duplicate path/time configuration;
- SQLite connections always close;
- test runtime startup cost;
- hidden network activity;
- import-time side effects;
- broad exceptions in touched critical write paths;
- model naming/type consistency;
- comments that contradict current behavior.

- [ ] **Step 2: Record and fix findings**

Create `docs/reviews/2026-06-30-backend-foundation-review-2.md` with the same fixed/deferred discipline as Review 1. Apply focused fixes and tests.

- [ ] **Step 3: Run final backend verification**

```powershell
python -m pytest -q
python -m compileall -q jarvis
git diff --check ae8c2dd..HEAD
```

Expected: zero pytest failures, compileall exit code 0, and no diff-check errors.

- [ ] **Step 4: Run unchanged frontend verification**

```powershell
Set-Location pwa
npm run build
Set-Location ..
```

Expected: Vite production build exits 0. Chunk-size warnings are reported but are not build failures.

- [ ] **Step 5: Verify protected and unrelated files remain unstaged**

```powershell
git status -sb
git diff --name-only ae8c2dd..HEAD
```

Expected: no commit includes `jarvis/data/jarvis.db`, `jarvis/domains/finance/portfolio_state.json`, `pwa/dev-dist/sw.js`, or the Finance diff artifacts.

- [ ] **Step 6: Commit the second review pass**

```powershell
git add docs/reviews/2026-06-30-backend-foundation-review-2.md
git add -u jarvis conftest.py
git commit -m "review: verify backend foundation"
```

## Phase Completion Gate

Do not begin the Finance vertical-slice plan until:

- full pytest is green;
- repository production state hashes are unchanged by tests;
- compileall and Vite build pass;
- both review documents exist;
- all unrelated dirty files remain uncommitted;
- the user receives the exact validation output and changed-file list.
