# PHOENIX Autonomous Weekly Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic Monday finance optimizer that owns the weekly allocation decision, fails closed on weak inputs, persists reproducible receipts, and presents one Finance-native PHOENIX PICK that the user either executes exactly or defers in full.

**Architecture:** Keep `engine.allocate_weekly_budget()` as the legacy baseline and add a pure `optimizer.py` subsystem that accepts a versioned input snapshot, generates bounded integer-cent candidates, validates hard rules, scores valid candidates, and returns one winner plus read-only audit alternatives. A `weekly_decision.py` orchestration layer builds quality-gated snapshots, persists immutable receipts in SQLite, and exposes shadow/live behavior through the existing FastAPI finance router; the PWA renders the live receipt in `BRIEF -> SIGNAL`, routes only the winner to `BUY SEQUENCE`, and keeps prior receipts under `DECISIONS`.

**Tech Stack:** Python 3.12, dataclasses, `decimal.Decimal`, `hashlib`, SQLite, FastAPI/Pydantic, pytest, React 18, Vite, Node test runner, existing PHOENIX Finance tokens and readability helpers.

## Global Constraints

- PHOENIX has decision autonomy; the user may execute PHOENIX PICK exactly or defer the entire cycle.
- The language model may explain structured output but cannot generate, score, select, edit, or override allocations.
- No broker connection, order placement, automatic sale, leverage, options, futures, or emergency-fund use.
- BTC target is 21%; BTC operating band is 15-25%; BTC hard ceiling is 25%.
- Total crypto hard ceiling is 30%; speculative crypto combined ceiling is 5%; one speculative token ceiling is 3%.
- A 20% total-portfolio drawdown suspends speculative-token buys, but does not suspend broad ETF or BTC contributions.
- The decision cycle is Monday in `Europe/Tallinn` after the expected Sunday deposit.
- A decision expires after 24 hours or any deposit, transaction, portfolio mutation, constitution change, material source change, or freshness failure.
- Missing, stale, conflicting, incomplete, or expired inputs produce no executable recommendation.
- Alternatives are read-only audit evidence and cannot be promoted.
- All allocation and fee arithmetic uses integer cents or `Decimal`; never binary floating point.
- No new runtime dependency is added for exchange calendars: market-session state and latest session timestamps come from source adapters and are validated as data.
- New optimizer behavior ships behind `PHOENIX_FINANCE_OPTIMIZER_MODE=shadow|live`, defaulting to `shadow`.
- The production visual must reuse existing Finance tokens, clipped geometry, projected glass, text helpers, reduced-motion behavior, and responsive shell.

---

## File Map

### New Backend Files

- `jarvis/domains/finance/optimizer.py`: immutable optimizer types, bounded candidate generation, hard-rule validation, deterministic score calculation, role assignment, and tie-breaking.
- `jarvis/domains/finance/weekly_decision.py`: input snapshot, quality gate, canonical hashing, cycle timing, legacy comparison, receipt construction, expiry, and shadow/live orchestration.
- `jarvis/domains/finance/tests/test_optimizer.py`: pure constitution, generation, scoring, determinism, and property-style invariants.
- `jarvis/domains/finance/tests/test_weekly_decision.py`: input quality, cycle timing, expiry, hashing, source disagreement, and shadow comparison tests.
- `jarvis/api/tests/test_finance_weekly_decision_routes.py`: endpoint, persistence, deferral, buy-sequence, no-override, and lifecycle tests.
- `pwa/src/components/holo/subs/FinanceDecisionStack.jsx`: Finance-native winner, audit alternatives, blocker state, expiry state, and continue-to-buy-sequence command.
- `pwa/src/components/holo/subs/FinanceDecisionHistory.jsx`: immutable receipt history and detail projection.

### Modified Backend Files

- `jarvis/domains/finance/constitution.json`: one authoritative optimizer policy and removal of contradictory crypto/drawdown limits from active policy paths.
- `jarvis/domains/finance/engine.py`: use normalized optimizer policy for existing crypto room calculations while preserving legacy response shape.
- `jarvis/domains/finance/market_data.py`: emit source/session metadata required by the quality gate.
- `jarvis/data/database.py`: receipt table, transaction link column, lifecycle queries, and migrations.
- `jarvis/api/routers/finance.py`: weekly-decision endpoints, shadow/live switching, winner-backed manual checklist, deterministic explanation fallback, and deferral.
- `jarvis/api/main.py`: idempotent Monday optimizer background check and job description.
- `jarvis/api/tests/test_finance_manual_buy_checklist.py`: checklist must use the unexpired winner in live mode.
- `jarvis/api/tests/test_finance_recommendation_receipt.py`: compatibility and optimizer receipt provenance.
- `jarvis/data/tests/test_database.py`: receipt migration and persistence tests.

### Modified Frontend Files

- `pwa/src/api/client.js`: decision, defer, decision history, and receipt detail API functions.
- `pwa/src/components/holo/subs/FinanceControlRoom.jsx`: keep four top-level lanes, replace `APPROVE` with `BUY SEQUENCE`, route Signal to the stack, and Decisions to receipt history.
- `pwa/src/components/holo/subs/FinanceSubs.jsx`: keep holdings, move legacy brief fallback behind the stack, and convert `ApproveContent` to winner-only `BuySequenceContent`.
- `pwa/src/components/holo/subs/LedgerContent.jsx`: carry `decision_receipt_id` into manual transaction records and show reconciliation state.
- `pwa/src/components/holo/financeControlRoomContract.test.js`: Decision Stack placement, read-only alternatives, whole-cycle deferral, and no editable allocation contract.

---

### Task 1: Normalize the Aggressive Constitution

**Files:**
- Modify: `jarvis/domains/finance/constitution.json`
- Modify: `jarvis/domains/finance/engine.py:300-380`
- Test: `jarvis/domains/finance/tests/test_optimizer.py`
- Test: `jarvis/domains/finance/tests/test_engine_dual_lane_mandate.py`

**Interfaces:**
- Produces: `engine.optimizer_policy(constitution: dict[str, Any]) -> dict[str, Any]`
- Produces constitution key: `optimizer_policy` with version, cycle, crypto, drawdown, generation, scoring, and quality settings.
- Consumes: existing `validate_constitution()`, `crypto_risk_rules`, `target_weights`, and `sleeve_bands`.

- [ ] **Step 1: Write failing policy consistency tests**

```python
def test_optimizer_policy_has_one_consistent_aggressive_crypto_contract():
    constitution = engine.load_json(engine.DEFAULT_CONSTITUTION_PATH)
    policy = engine.optimizer_policy(constitution)
    assert policy["version"] == "aggressive-v1"
    assert policy["btc_target"] == 0.21
    assert policy["btc_min"] == 0.15
    assert policy["btc_max"] == 0.25
    assert policy["total_crypto_max"] == 0.30
    assert policy["speculative_crypto_combined_max"] == 0.05
    assert policy["single_speculative_crypto_max"] == 0.03
    assert policy["speculative_drawdown_suspend_at"] == 0.20
    assert constitution["sleeve_bands"]["btc"] == {
        "min_weight": 0.15,
        "max_weight": 0.25,
    }


def test_optimizer_policy_rejects_the_old_fifteen_percent_btc_conflict():
    constitution = engine.load_json(engine.DEFAULT_CONSTITUTION_PATH)
    constitution["risk_rules"]["max_single_crypto_pct"] = 15
    with pytest.raises(ValueError, match="conflicts with optimizer_policy.btc_max"):
        engine.validate_constitution(constitution)
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pytest -q jarvis/domains/finance/tests/test_optimizer.py jarvis/domains/finance/tests/test_engine_dual_lane_mandate.py`

Expected: FAIL because `optimizer_policy()` and the authoritative JSON policy do not exist.

- [ ] **Step 3: Add the authoritative policy and validation**

Add this active policy to `constitution.json`:

```json
"optimizer_policy": {
  "version": "aggressive-v1",
  "cycle_timezone": "Europe/Tallinn",
  "deposit_weekday": 6,
  "decision_weekday": 0,
  "expires_after_hours": 24,
  "btc_target": 0.21,
  "btc_min": 0.15,
  "btc_max": 0.25,
  "total_crypto_max": 0.30,
  "speculative_assets": ["hype", "tao"],
  "speculative_crypto_combined_max": 0.05,
  "single_speculative_crypto_max": 0.03,
  "speculative_drawdown_suspend_at": 0.20,
  "candidate_step_eur": 5,
  "max_candidate_count": 50000,
  "minimum_decision_score": 60,
  "source_price_tolerance_pct": 1.0,
  "crypto_price_max_age_minutes": 30,
  "open_market_price_max_age_minutes": 30,
  "closed_market_latest_session_required": true,
  "score_weights": {
    "drift_repair": 0.32,
    "instrument_quality": 0.18,
    "aggressive_mandate_fit": 0.16,
    "concentration_improvement": 0.10,
    "market_regime_fit": 0.08,
    "execution_cost": 0.07,
    "order_simplicity": 0.04,
    "source_confidence": 0.04,
    "budget_utilization": 0.01
  }
}
```

Update the active duplicate fields to agree: `crypto_risk_rules.total_crypto_hard_max=0.30`, `crypto_risk_rules.hype_tao_combined_max=0.05`, `risk_rules.max_single_crypto_pct=25`, `risk_rules.drawdown_threshold_pct=20`, and speculative sleeve maxima to 3% each. Keep descriptive legacy sections for display, but validate that any active duplicate equals `optimizer_policy`.

Add:

```python
def optimizer_policy(constitution: dict[str, Any]) -> dict[str, Any]:
    policy = dict(constitution.get("optimizer_policy") or {})
    required = {
        "version", "cycle_timezone", "btc_target", "btc_min", "btc_max",
        "total_crypto_max", "speculative_assets",
        "speculative_crypto_combined_max", "single_speculative_crypto_max",
        "speculative_drawdown_suspend_at", "candidate_step_eur",
        "max_candidate_count", "minimum_decision_score", "score_weights",
    }
    missing = sorted(required - policy.keys())
    if missing:
        raise ValueError(f"optimizer_policy missing: {', '.join(missing)}")
    if not 0 <= policy["btc_min"] <= policy["btc_target"] <= policy["btc_max"]:
        raise ValueError("optimizer_policy BTC min/target/max are inconsistent")
    if policy["btc_max"] > policy["total_crypto_max"]:
        raise ValueError("optimizer_policy BTC max exceeds total crypto max")
    if abs(sum(policy["score_weights"].values()) - 1.0) > 1e-9:
        raise ValueError("optimizer_policy score weights must sum to 1")
    return policy
```

- [ ] **Step 4: Run the focused and legacy engine suites**

Run: `pytest -q jarvis/domains/finance/tests/test_optimizer.py jarvis/domains/finance/tests/test_engine_dual_lane_mandate.py jarvis/domains/finance/tests/test_portfolio_state_staleness.py`

Expected: PASS; existing weekly response fields remain intact.

- [ ] **Step 5: Commit the normalized policy**

```bash
git add jarvis/domains/finance/constitution.json jarvis/domains/finance/engine.py jarvis/domains/finance/tests/test_optimizer.py jarvis/domains/finance/tests/test_engine_dual_lane_mandate.py
git commit -m "feat(finance): normalize aggressive optimizer policy"
```

---

### Task 2: Build the Pure Deterministic Optimizer

**Files:**
- Create: `jarvis/domains/finance/optimizer.py`
- Modify: `jarvis/domains/finance/tests/test_optimizer.py`

**Interfaces:**
- Produces: `ExecutionCost`, `OptimizerInput`, `Scenario`, `OptimizerResult` frozen dataclasses.
- Produces: `optimize_weekly_allocation(data: OptimizerInput) -> OptimizerResult`.
- Consumes: normalized policy from Task 1 and pre-validated source data; performs no file, database, network, clock, or AI calls.

- [ ] **Step 1: Write failing candidate, constraint, and determinism tests**

```python
def test_optimizer_returns_one_winner_and_read_only_role_alternatives():
    result = optimize_weekly_allocation(optimizer_fixture())
    assert result.selected.role == "phoenix_pick"
    assert result.selected.valid is True
    assert {row.role for row in result.alternatives} <= {
        "max_drift_repair", "lowest_cost", "defensive_alternative"
    }
    assert all(row.scenario_id != result.selected.scenario_id for row in result.alternatives)


def test_no_selected_scenario_can_break_crypto_or_budget_caps():
    for btc_cents in range(0, 160_00, 1_000):
        data = optimizer_fixture(budget_cents=15_000)
        data = replace(data, holdings_cents={**data.holdings_cents, "btc": btc_cents})
        result = optimize_weekly_allocation(data)
        if result.selected is None:
            continue
        assert sum(result.selected.allocation_cents.values()) <= data.budget_cents
        assert result.selected.projected_weights["btc"] <= Decimal("0.25")
        assert result.selected.projected_total_crypto_weight <= Decimal("0.30")


def test_optimizer_is_byte_stable_for_the_same_input():
    first = optimize_weekly_allocation(optimizer_fixture()).to_canonical_dict()
    second = optimize_weekly_allocation(optimizer_fixture()).to_canonical_dict()
    assert json.dumps(first, sort_keys=True, separators=(",", ":")) == json.dumps(
        second, sort_keys=True, separators=(",", ":")
    )
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pytest -q jarvis/domains/finance/tests/test_optimizer.py`

Expected: FAIL importing `jarvis.domains.finance.optimizer`.

- [ ] **Step 3: Implement immutable types and bounded generation**

Use frozen dataclasses and integer cents:

```python
@dataclass(frozen=True)
class ExecutionCost:
    fixed_fee_cents: int = 0
    fee_bps: int = 0
    fx_bps: int = 0
    tax_bps: int = 0
    minimum_order_cents: int = 0


@dataclass(frozen=True)
class OptimizerInput:
    policy_version: str
    holdings_cents: Mapping[str, int]
    target_weights: Mapping[str, Decimal]
    eligible_assets: tuple[str, ...]
    crypto_assets: frozenset[str]
    speculative_assets: frozenset[str]
    budget_cents: int
    peak_value_cents: int
    current_value_cents: int
    execution_costs: Mapping[str, ExecutionCost]
    instrument_scores: Mapping[str, Decimal]
    source_confidence: Mapping[str, Decimal]
    regime_scores: Mapping[str, Decimal]
    baseline_allocation_cents: Mapping[str, int]
    candidate_step_cents: int
    max_candidate_count: int
    minimum_decision_score: Decimal
    score_weights: Mapping[str, Decimal]


def _allocation_vectors(assets: tuple[str, ...], budget: int, step: int):
    def walk(index: int, remaining: int, current: dict[str, int]):
        if index == len(assets) - 1:
            yield {**current, assets[index]: remaining}
            return
        for amount in range(0, remaining + 1, step):
            yield from walk(index + 1, remaining - amount, {**current, assets[index]: amount})
    if assets and budget >= 0 and step > 0:
        yield from walk(0, budget, {})
```

Restrict `assets` to deterministic eligible sleeves with positive target gaps plus baseline allocation sleeves, sorted by name, and stop with a blocked result if generation would exceed `max_candidate_count` instead of silently truncating.

- [ ] **Step 4: Implement hard rules and scoring**

```python
def _validate_candidate(data: OptimizerInput, allocation: Mapping[str, int]) -> tuple[RuleResult, ...]:
    projected = _projected_weights(data.holdings_cents, allocation)
    total_crypto = sum(projected.get(asset, Decimal(0)) for asset in data.crypto_assets)
    speculative_total = sum(projected.get(asset, Decimal(0)) for asset in data.speculative_assets)
    drawdown = _drawdown(data.current_value_cents, data.peak_value_cents)
    return (
        RuleResult("budget", sum(allocation.values()) <= data.budget_cents),
        RuleResult("btc_max", projected.get("btc", Decimal(0)) <= Decimal("0.25")),
        RuleResult("total_crypto_max", total_crypto <= Decimal("0.30")),
        RuleResult("speculative_combined_max", speculative_total <= Decimal("0.05")),
        RuleResult("single_speculative_max", all(projected.get(a, Decimal(0)) <= Decimal("0.03") for a in data.speculative_assets)),
        RuleResult("drawdown_speculative_suspend", drawdown < Decimal("0.20") or all(allocation.get(a, 0) == 0 for a in data.speculative_assets)),
        RuleResult("minimum_orders", _orders_meet_minimums(data, allocation)),
    )


def _weighted_score(components: Mapping[str, Decimal], weights: Mapping[str, Decimal]) -> Decimal:
    return sum((components[name] * weights[name] for name in sorted(weights)), Decimal(0)).quantize(Decimal("0.01"))
```

Tie-break valid scenarios by `(-score, total_cost_cents, order_count, canonical_allocation_tuple)`. Never use set iteration or current time in the pure optimizer.

- [ ] **Step 5: Run pure optimizer tests**

Run: `pytest -q jarvis/domains/finance/tests/test_optimizer.py`

Expected: PASS, including property-style loops and canonical determinism.

- [ ] **Step 6: Commit the optimizer core**

```bash
git add jarvis/domains/finance/optimizer.py jarvis/domains/finance/tests/test_optimizer.py
git commit -m "feat(finance): add deterministic scenario optimizer"
```

---

### Task 3: Build the Market-Aware Decision Quality Gate

**Files:**
- Create: `jarvis/domains/finance/weekly_decision.py`
- Create: `jarvis/domains/finance/tests/test_weekly_decision.py`
- Modify: `jarvis/domains/finance/market_data.py`

**Interfaces:**
- Produces: `PriceEvidence`, `DecisionSnapshot`, and `QualityGateResult` frozen dataclasses.
- Produces: `quality_gate(snapshot: DecisionSnapshot, policy: Mapping[str, Any], now: datetime) -> QualityGateResult`.
- Produces: `canonical_hash(value: Mapping[str, Any]) -> str`.
- Consumes source adapters that provide `observed_at`, `session_state`, `session_date`, `provider`, `price_eur`, and `confidence`.

- [ ] **Step 1: Write failing quality tests**

```python
def test_open_market_quote_older_than_thirty_minutes_blocks():
    snapshot = decision_snapshot_fixture(
        evidence=(price_evidence("CNDX.L", age_minutes=31, session_state="open"),)
    )
    gate = quality_gate(snapshot, snapshot.policy, NOW)
    assert gate.ready is False
    assert "CNDX.L primary quote is 31 minutes old while market is open" in gate.blockers


def test_closed_market_accepts_latest_completed_session():
    snapshot = decision_snapshot_fixture(
        evidence=(price_evidence("CNDX.L", age_minutes=800, session_state="closed", session_date=date(2026, 7, 14)),)
    )
    assert quality_gate(snapshot, snapshot.policy, NOW).ready is True


def test_crypto_requires_two_prices_within_one_percent():
    snapshot = decision_snapshot_fixture(evidence=(
        price_evidence("BTC-EUR", provider="yfinance", price="51000"),
        price_evidence("BTC-EUR", provider="coingecko", price="52050"),
    ))
    gate = quality_gate(snapshot, snapshot.policy, NOW)
    assert gate.ready is False
    assert any("BTC-EUR source disagreement" in item for item in gate.blockers)


def test_missing_weekly_funding_source_never_assumes_a_budget():
    snapshot = replace(decision_snapshot_fixture(), funding_status="missing", budget_cents=0)
    gate = quality_gate(snapshot, snapshot.policy, NOW)
    assert gate.ready is False
    assert "Weekly funding source is missing" in gate.blockers
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pytest -q jarvis/domains/finance/tests/test_weekly_decision.py`

Expected: FAIL because snapshot and quality-gate types do not exist.

- [ ] **Step 3: Extend market-data metadata without inventing session state**

Make each price refresh record structured evidence:

```python
{
    "instrument": "CNDX.L",
    "provider": "yfinance",
    "price_eur": "75.64",
    "observed_at": "2026-07-15T09:36:29+00:00",
    "session_state": "open",
    "session_date": "2026-07-15",
    "confidence": "primary",
}
```

For BTC add a keyless CoinGecko spot adapter as the independent source. For ETF instruments where no independent automated quote is available, set `execution_price_confirmation_required=true`; optimization may rank the scenario, but live buy-sequence readiness remains false until the current broker quote is confirmed against the primary quote within the configured 1% tolerance. `scheduled_budget` comes from Railway's versioned `weekly_investment_budget` and is displayed as scheduled, not deposited; `verified_funding` requires a source-backed cash event. The buy sequence always includes a broker-cash availability check because PHOENIX has no broker balance connection.

- [ ] **Step 4: Implement canonical hashing and fail-closed quality**

```python
def canonical_hash(value: Mapping[str, Any]) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    return hashlib.sha256(encoded).hexdigest()


def quality_gate(snapshot: DecisionSnapshot, policy: Mapping[str, Any], now: datetime) -> QualityGateResult:
    blockers = list(snapshot.freshness_blockers)
    if snapshot.funding_status not in {"verified_funding", "scheduled_budget"}:
        blockers.append("Weekly funding source is missing")
    if snapshot.regime == "unknown":
        blockers.append("Market regime is unknown")
    blockers.extend(_price_evidence_blockers(snapshot.price_evidence, policy, now))
    blockers.extend(_instrument_blockers(snapshot.instrument_evidence))
    return QualityGateResult(ready=not blockers, blockers=tuple(sorted(set(blockers))))
```

- [ ] **Step 5: Run quality and current freshness tests**

Run: `pytest -q jarvis/domains/finance/tests/test_weekly_decision.py jarvis/domains/finance/tests/test_market_data_universe.py jarvis/domains/finance/tests/test_portfolio_state_staleness.py`

Expected: PASS.

- [ ] **Step 6: Commit the decision quality gate**

```bash
git add jarvis/domains/finance/weekly_decision.py jarvis/domains/finance/market_data.py jarvis/domains/finance/tests/test_weekly_decision.py
git commit -m "feat(finance): gate optimizer on verified market inputs"
```

---

### Task 4: Orchestrate Monday Cycles and Immutable Receipts

**Files:**
- Modify: `jarvis/domains/finance/weekly_decision.py`
- Modify: `jarvis/domains/finance/tests/test_weekly_decision.py`

**Interfaces:**
- Produces: `cycle_id(now: datetime, timezone_name: str) -> str`.
- Produces: `build_weekly_decision(constitution, portfolio_state, evidence, legacy_result, now) -> dict[str, Any]`.
- Produces: `decision_is_expired(receipt, current_snapshot_hash, now) -> bool`.
- Consumes: `optimizer.optimize_weekly_allocation()` and `engine.allocate_weekly_budget()`.

- [ ] **Step 1: Write failing lifecycle and receipt tests**

```python
def test_cycle_uses_tallinn_monday():
    sunday_utc = datetime(2026, 7, 19, 21, 30, tzinfo=timezone.utc)
    assert cycle_id(sunday_utc, "Europe/Tallinn") == "2026-W30"


def test_receipt_contains_versions_hashes_scores_and_legacy_comparison():
    receipt = build_weekly_decision(**weekly_decision_fixture())
    assert receipt["receipt_version"] == 1
    assert len(receipt["input_snapshot_hash"]) == 64
    assert receipt["optimizer_version"] == "optimizer-v1"
    assert receipt["constitution_version"] == "aggressive-v1"
    assert receipt["selected"]["role"] == "phoenix_pick"
    assert receipt["legacy_comparison"]["same_allocation"] in {True, False}
    assert receipt["safety"]["trades_executed"] is False


def test_portfolio_mutation_expires_the_receipt():
    receipt = build_weekly_decision(**weekly_decision_fixture())
    assert decision_is_expired(receipt, "different-snapshot-hash", NOW) is True
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pytest -q jarvis/domains/finance/tests/test_weekly_decision.py`

Expected: FAIL for missing orchestration functions.

- [ ] **Step 3: Build idempotent receipt orchestration**

```python
def cycle_id(now: datetime, timezone_name: str) -> str:
    local = now.astimezone(ZoneInfo(timezone_name))
    year, week, _ = local.isocalendar()
    return f"{year}-W{week:02d}"


def build_weekly_decision(*, constitution, portfolio_state, evidence, legacy_result, now):
    snapshot = build_decision_snapshot(constitution, portfolio_state, evidence, now)
    gate = quality_gate(snapshot, snapshot.policy, now)
    input_hash = canonical_hash(snapshot.to_canonical_dict())
    if not gate.ready:
        return blocked_receipt(snapshot, gate, input_hash, now)
    optimized = optimize_weekly_allocation(snapshot.to_optimizer_input(legacy_result))
    return receipt_from_result(snapshot, optimized, legacy_result, input_hash, now)
```

Receipt IDs are deterministic UUIDv5 values derived from cycle ID, input hash, optimizer version, and constitution version. Creation and expiry timestamps are supplied by orchestration and excluded from optimizer scoring.

- [ ] **Step 4: Add expiry triggers**

`decision_is_expired()` returns true for time expiry, changed snapshot hash, changed constitution version, changed optimizer version, stale current evidence, or non-active lifecycle status. A changed input creates a new receipt and marks the previous active receipt `superseded`.

- [ ] **Step 5: Run orchestration tests**

Run: `pytest -q jarvis/domains/finance/tests/test_weekly_decision.py jarvis/domains/finance/tests/test_optimizer.py`

Expected: PASS.

- [ ] **Step 6: Commit cycle orchestration**

```bash
git add jarvis/domains/finance/weekly_decision.py jarvis/domains/finance/tests/test_weekly_decision.py
git commit -m "feat(finance): build reproducible weekly decision receipts"
```

---

### Task 5: Persist Receipt Lifecycle and Link Manual Transactions

**Files:**
- Modify: `jarvis/data/database.py:182-250, 380-450, 1220-1520`
- Modify: `jarvis/data/tests/test_database.py`

**Interfaces:**
- Produces: `save_finance_decision_receipt(receipt: dict) -> str`.
- Produces: `get_finance_decision_receipt(receipt_id: str) -> dict | None`.
- Produces: `get_active_finance_decision(cycle_id: str, mode: str) -> dict | None`.
- Produces: `list_finance_decision_receipts(limit: int = 50) -> list[dict]`.
- Produces: `set_finance_decision_status(receipt_id: str, status: str, reason: str | None) -> bool`.
- Produces: `save_finance_execution_evidence(receipt_id: str, evidence: dict) -> int`.
- Extends manual transaction payload with `decision_receipt_id: str | None`.

- [ ] **Step 1: Write failing database tests**

```python
def test_decision_receipt_round_trips_and_preserves_json(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "optimizer.db")
    database.init_db()
    receipt = receipt_fixture(receipt_id="receipt-1", status="shadow")
    assert database.save_finance_decision_receipt(receipt) == "receipt-1"
    stored = database.get_finance_decision_receipt("receipt-1")
    assert stored["payload"]["selected"] == receipt["selected"]


def test_only_whole_cycle_deferral_changes_decision_status(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "optimizer.db")
    database.init_db()
    database.save_finance_decision_receipt(receipt_fixture(receipt_id="receipt-1", status="active"))
    assert database.set_finance_decision_status("receipt-1", "deferred", "User deferred cycle") is True
    assert database.get_finance_decision_receipt("receipt-1")["status"] == "deferred"


def test_manual_transaction_links_to_receipt_without_marking_trade_automatic(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "optimizer.db")
    database.init_db()
    transaction_id = database.save_finance_transaction(transaction_fixture(decision_receipt_id="receipt-1"))
    row = database.get_finance_transaction(transaction_id)
    assert row["decision_receipt_id"] == "receipt-1"
    assert row["manual_record_only"] == 1
    assert row["trades_executed"] == 0
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pytest -q jarvis/data/tests/test_database.py -k "decision_receipt or transaction_links"`

Expected: FAIL because schema and methods do not exist.

- [ ] **Step 3: Add schema and migration**

```sql
CREATE TABLE IF NOT EXISTS finance_decision_receipts (
    receipt_id TEXT PRIMARY KEY,
    cycle_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('shadow', 'live')),
    status TEXT NOT NULL CHECK (status IN ('blocked', 'shadow', 'active', 'deferred', 'expired', 'superseded', 'partial', 'executed')),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    input_snapshot_hash TEXT NOT NULL,
    constitution_version TEXT NOT NULL,
    optimizer_version TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status_reason TEXT,
    status_changed_at TEXT,
    superseded_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_finance_decisions_cycle ON finance_decision_receipts(cycle_id, created_at);

CREATE TABLE IF NOT EXISTS finance_decision_execution_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    evidence_type TEXT NOT NULL CHECK (evidence_type IN ('broker_quote', 'broker_cash_check')),
    instrument TEXT,
    observed_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_finance_execution_evidence_receipt
ON finance_decision_execution_evidence(receipt_id, created_at);
```

Use the existing `PRAGMA table_info` migration pattern to add `decision_receipt_id TEXT` to `finance_transaction_ledger`.

- [ ] **Step 4: Implement lifecycle queries with explicit transition validation**

Allow transitions: `shadow -> superseded`, `active -> deferred|expired|superseded|partial|executed`, and `partial -> executed`. Reject all other transitions with `ValueError`.

- [ ] **Step 5: Run database tests**

Run: `pytest -q jarvis/data/tests/test_database.py`

Expected: PASS.

- [ ] **Step 6: Commit persistence**

```bash
git add jarvis/data/database.py jarvis/data/tests/test_database.py
git commit -m "feat(finance): persist optimizer decision lifecycle"
```

---

### Task 6: Expose Shadow/Live Weekly Decision APIs

**Files:**
- Modify: `jarvis/api/routers/finance.py:436-680, 1143-1260, 1700-1740`
- Modify: `jarvis/api/main.py:35-120`
- Create: `jarvis/api/tests/test_finance_weekly_decision_routes.py`
- Modify: `jarvis/api/tests/test_finance_manual_buy_checklist.py`
- Modify: `jarvis/api/tests/test_finance_recommendation_receipt.py`

**Interfaces:**
- Produces: `GET /finance/weekly-decision`.
- Produces: `GET /finance/weekly-decisions?limit=50`.
- Produces: `GET /finance/weekly-decisions/{receipt_id}`.
- Produces: `POST /finance/weekly-decisions/{receipt_id}/defer`.
- Produces: `POST /finance/weekly-decisions/{receipt_id}/confirm-execution-quote`.
- Changes: `GET /finance/manual-buy-checklist` uses the active unexpired winner only when mode is `live`.
- Produces: `_run_weekly_optimizer_internal(now: datetime | None = None) -> dict`.

- [ ] **Step 1: Write failing route and autonomy tests**

```python
def test_shadow_mode_persists_comparison_but_keeps_legacy_authoritative(monkeypatch):
    monkeypatch.setenv("PHOENIX_FINANCE_OPTIMIZER_MODE", "shadow")
    decision = client.get("/finance/weekly-decision").json()
    recommendation = client.get("/finance/recommendation").json()
    assert decision["mode"] == "shadow"
    assert decision["authoritative"] is False
    assert recommendation["recommendations"] == decision["legacy_comparison"]["recommendations"]


def test_live_mode_exposes_one_winner_and_read_only_alternatives(monkeypatch):
    monkeypatch.setenv("PHOENIX_FINANCE_OPTIMIZER_MODE", "live")
    data = client.get("/finance/weekly-decision").json()
    assert data["authoritative"] is True
    assert data["selected"]["role"] == "phoenix_pick"
    assert all(item["read_only"] is True for item in data["alternatives"])
    assert "select" not in json.dumps(data["alternatives"]).lower()


def test_only_active_unexpired_winner_reaches_buy_sequence(monkeypatch):
    monkeypatch.setenv("PHOENIX_FINANCE_OPTIMIZER_MODE", "live")
    decision = client.get("/finance/weekly-decision").json()
    checklist = client.get("/finance/manual-buy-checklist").json()
    assert checklist["decision_receipt_id"] == decision["receipt_id"]
    assert checklist["checklist_items"] == decision["selected"]["buy_sequence"]


def test_defer_is_whole_cycle_and_disables_buy_sequence(monkeypatch):
    monkeypatch.setenv("PHOENIX_FINANCE_OPTIMIZER_MODE", "live")
    receipt_id = client.get("/finance/weekly-decision").json()["receipt_id"]
    response = client.post(f"/finance/weekly-decisions/{receipt_id}/defer", json={"reason": "Not buying this week"})
    assert response.json()["status"] == "deferred"
    blocked = client.get("/finance/manual-buy-checklist")
    assert blocked.status_code == 409
    assert "deferred" in blocked.json()["detail"].lower()


def test_broker_quote_confirmation_expires_a_materially_changed_decision(monkeypatch):
    monkeypatch.setenv("PHOENIX_FINANCE_OPTIMIZER_MODE", "live")
    decision = client.get("/finance/weekly-decision").json()
    response = client.post(
        f"/finance/weekly-decisions/{decision['receipt_id']}/confirm-execution-quote",
        json={"instrument": "CNDX.L", "broker_price_eur": 80.00, "observed_at": "2026-07-15T10:00:00Z"},
    )
    assert response.status_code == 409
    assert response.json()["status"] == "expired"
    assert "exceeds 1.0%" in response.json()["detail"]


def test_partial_execution_blocks_reuse_until_ledger_reconciliation(monkeypatch):
    monkeypatch.setenv("PHOENIX_FINANCE_OPTIMIZER_MODE", "live")
    decision = client.get("/finance/weekly-decision").json()
    first_leg = decision["selected"]["buy_sequence"][0]
    transaction_id = database.save_finance_transaction(transaction_for(first_leg, decision["receipt_id"]))
    database.mark_finance_transaction_applied(transaction_id)
    _reconcile_decision_execution(decision["receipt_id"])
    assert database.get_finance_decision_receipt(decision["receipt_id"])["status"] == "partial"
    assert client.get("/finance/manual-buy-checklist").status_code == 409
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pytest -q jarvis/api/tests/test_finance_weekly_decision_routes.py`

Expected: FAIL with 404 routes.

- [ ] **Step 3: Add mode, orchestration, and API projections**

```python
def _optimizer_mode() -> str:
    value = os.getenv("PHOENIX_FINANCE_OPTIMIZER_MODE", "shadow").strip().lower()
    if value not in {"shadow", "live"}:
        raise RuntimeError("PHOENIX_FINANCE_OPTIMIZER_MODE must be shadow or live")
    return value


@router.get("/weekly-decision")
def finance_weekly_decision() -> dict:
    return _run_weekly_optimizer_internal()


@router.post("/weekly-decisions/{receipt_id}/defer")
def defer_finance_decision(receipt_id: str, payload: DeferDecisionRequest) -> dict:
    receipt = database.get_finance_decision_receipt(receipt_id)
    if not receipt or receipt["status"] != "active":
        raise HTTPException(status_code=409, detail="Only the active weekly decision can be deferred")
    database.set_finance_decision_status(receipt_id, "deferred", payload.reason or "User deferred entire cycle")
    return {"receipt_id": receipt_id, "status": "deferred", "whole_cycle": True}
```

`confirm-execution-quote` accepts only a current broker-displayed quote for the winner's resolved instrument. It appends execution evidence without mutating the immutable receipt payload; if the price differs from the primary source by more than the configured tolerance, it expires the whole receipt and requires a fresh optimizer run. Applying a linked ledger transaction calls `_reconcile_decision_execution(receipt_id)`: zero legs remain `active`, some legs become `partial`, and all exact prescribed legs become `executed`.

The endpoint returns structured deterministic reasons even when AI is unavailable. Existing `/finance/recommendation` remains compatible; in live mode it projects the winner into its current response shape rather than running a second allocation.

- [ ] **Step 4: Add idempotent Monday background check**

Add `_auto_weekly_optimizer()` to `main.py`. Every hour it checks local `Europe/Tallinn` time; on Monday it calls `_run_weekly_optimizer_internal()`, which returns the already-persisted current receipt when the snapshot hash and versions are unchanged.

```python
async def _auto_weekly_optimizer():
    await asyncio.sleep(360)
    while True:
        try:
            result = finance._run_weekly_optimizer_internal()
            _log.info("Weekly optimizer: %s %s", result.get("cycle_id"), result.get("status"))
        except Exception:
            _log.exception("Weekly optimizer check failed")
        await asyncio.sleep(60 * 60)
```

- [ ] **Step 5: Run route, receipt, checklist, and startup tests**

Run: `pytest -q jarvis/api/tests/test_finance_weekly_decision_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_recommendation_receipt.py jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_brief_route.py`

Expected: PASS.

- [ ] **Step 6: Commit API integration**

```bash
git add jarvis/api/routers/finance.py jarvis/api/main.py jarvis/api/tests/test_finance_weekly_decision_routes.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_recommendation_receipt.py
git commit -m "feat(finance): expose autonomous weekly decision API"
```

---

### Task 7: Build the Finance-Native Decision Stack

**Files:**
- Create: `pwa/src/components/holo/subs/FinanceDecisionStack.jsx`
- Create: `pwa/src/components/holo/subs/FinanceDecisionHistory.jsx`
- Modify: `pwa/src/api/client.js:23-39, 226-242`
- Modify: `pwa/src/components/holo/subs/FinanceControlRoom.jsx:1-260`
- Modify: `pwa/src/components/holo/subs/FinanceSubs.jsx:1-360`
- Modify: `pwa/src/components/holo/subs/LedgerContent.jsx:1-220`
- Modify: `pwa/src/components/holo/financeControlRoomContract.test.js`

**Interfaces:**
- Produces: `getFinanceWeeklyDecision()`, `getFinanceDecisionHistory(limit)`, `getFinanceDecision(receiptId)`, `confirmFinanceExecutionQuote(receiptId, payload)`, and `deferFinanceDecision(receiptId, reason)`.
- Produces: `<FinanceDecisionStack onContinue={() => setBriefSub('BUY SEQUENCE')} />`.
- Produces: `<BuySequenceContent decisionReceiptId />` and `<FinanceDecisionHistory />`.
- Consumes the API contract from Task 6.

- [ ] **Step 1: Write failing frontend contracts**

```js
test('Signal is the autonomous Decision Stack and alternatives are read-only', async () => {
  const room = await src('./subs/FinanceControlRoom.jsx')
  const stack = await src('./subs/FinanceDecisionStack.jsx')
  assert.match(room, /'SIGNAL', 'BUY SEQUENCE', 'LEDGER', 'DECISIONS'/)
  assert.match(room, /FinanceDecisionStack/)
  assert.match(stack, /PHOENIX PICK/)
  assert.match(stack, /WHY IT LOST/)
  assert.match(stack, /DEFER ENTIRE CYCLE/)
  assert.doesNotMatch(stack, /USE THIS SCENARIO|SELECT SCENARIO|amount.*input/is)
})


test('Buy Sequence consumes only the active receipt winner', async () => {
  const subs = await src('./subs/FinanceSubs.jsx')
  assert.match(subs, /export function BuySequenceContent/)
  assert.match(subs, /getFinanceManualBuyChecklist/)
  assert.match(subs, /decision_receipt_id/)
  assert.doesNotMatch(subs, /setAmount|allocation override/i)
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd pwa && node --test src/components/holo/financeControlRoomContract.test.js`

Expected: FAIL because new components and tab labels do not exist.

- [ ] **Step 3: Add API functions**

```javascript
export async function getFinanceWeeklyDecision() {
  return apiFetch('/finance/weekly-decision')
}

export async function getFinanceDecisionHistory(limit = 50) {
  return apiFetch(`/finance/weekly-decisions?limit=${encodeURIComponent(limit)}`)
}

export async function getFinanceDecision(receiptId) {
  return apiFetch(`/finance/weekly-decisions/${encodeURIComponent(receiptId)}`)
}

export async function deferFinanceDecision(receiptId, reason = '') {
  return apiFetch(`/finance/weekly-decisions/${encodeURIComponent(receiptId)}/defer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
}

export async function confirmFinanceExecutionQuote(receiptId, payload) {
  return apiFetch(`/finance/weekly-decisions/${encodeURIComponent(receiptId)}/confirm-execution-quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
```

- [ ] **Step 4: Implement Decision Stack using existing Finance primitives**

The component owns `loading`, `error`, `decision`, `expandedScenarioId`, and `deferring` state. The winner is an open unframed instrument band; alternatives are line-separated buttons that only expand audit details. The only decision command is whole-cycle deferral.

```jsx
export function FinanceDecisionStack({ onContinue }) {
  const [decision, setDecision] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    getFinanceWeeklyDecision().then(value => alive && setDecision(value)).catch(err => alive && setError(err.message))
    return () => { alive = false }
  }, [])
  if (error) return <DecisionOffline message={error} />
  if (!decision) return <DecisionLoading />
  if (!decision.data_ready || !decision.selected) return <DecisionBlocked blockers={decision.blockers || []} />
  return <DecisionInstrument decision={decision} onContinue={onContinue} />
}
```

Use `financeLabel`, `financeMicro`, `financeBody`, `financeValue`, `financeButton`, `ACC`, `G`, `Y`, `R`, `W`, `a`, `mix`, and `deep`. Do not add generic nested cards or a second modal.

- [ ] **Step 5: Convert Approve to winner-only Buy Sequence and link Ledger**

Rename UI copy and export, preserve manual-only safety, and include `decision_receipt_id` in each ledger payload. When the API marks a leg `execution_price_confirmation_required`, the Buy Sequence provides one broker-quote field and calls `confirmFinanceExecutionQuote()` before enabling that leg; the field verifies executability and never changes the prescribed amount. A deferred, expired, superseded, or partial receipt disables sequence controls and forces a refresh.

- [ ] **Step 6: Implement receipt history**

Render status, cycle, score, selected allocation, expiry, constitution version, blocker summary, and linked transaction outcome. Receipt rows may expand but cannot be deleted or mutated; retain legacy brief history separately only for pre-optimizer records.

- [ ] **Step 7: Run frontend contracts and build**

Run: `cd pwa && npm test`

Expected: all tests PASS.

Run: `cd pwa && $env:VITE_API_URL='https://phoenix-production-1fb2.up.railway.app'; npm run build`

Expected: Vite production build PASS; no localhost production fallback.

- [ ] **Step 8: Commit the Control Room integration**

```bash
git add pwa/src/api/client.js pwa/src/components/holo/subs/FinanceDecisionStack.jsx pwa/src/components/holo/subs/FinanceDecisionHistory.jsx pwa/src/components/holo/subs/FinanceControlRoom.jsx pwa/src/components/holo/subs/FinanceSubs.jsx pwa/src/components/holo/subs/LedgerContent.jsx pwa/src/components/holo/financeControlRoomContract.test.js
git commit -m "feat(finance): add autonomous Decision Stack"
```

---

### Task 8: Add Shadow Replay and Production Promotion Gates

**Files:**
- Modify: `jarvis/domains/finance/production_smoke_gate.py`
- Modify: `jarvis/domains/finance/tests/test_production_smoke_gate.py`
- Modify: `jarvis/domains/finance/acceptance_gate.py`
- Modify: `jarvis/domains/finance/tests/test_acceptance_gate.py`
- Create: `jarvis/domains/finance/tests/fixtures/optimizer_replays.json`
- Modify: `jarvis/api/tests/test_finance_weekly_decision_routes.py`

**Interfaces:**
- Produces: `evaluate_optimizer_shadow_receipts(receipts: Sequence[dict]) -> dict`.
- Produces smoke sections: `optimizer_determinism`, `optimizer_constitution`, `optimizer_data_quality`, `optimizer_shadow_comparison`, and `optimizer_manual_execution_only`.
- Blocks live mode when the acceptance gate is not accepted.

- [ ] **Step 1: Write failing promotion-gate tests**

```python
def test_live_mode_is_blocked_without_accepted_optimizer_gate(monkeypatch):
    monkeypatch.setenv("PHOENIX_FINANCE_OPTIMIZER_MODE", "live")
    with patch("jarvis.api.routers.finance.optimizer_acceptance_status", return_value={"accepted": False}):
        response = client.get("/finance/weekly-decision")
    assert response.status_code == 503
    assert "optimizer acceptance gate" in response.json()["detail"].lower()


def test_replay_gate_requires_determinism_and_zero_hard_rule_violations():
    result = evaluate_optimizer_shadow_receipts(load_replay_receipts())
    assert result["deterministic_replays"] == result["total_replays"]
    assert result["selected_hard_rule_violations"] == 0
    assert result["budget_overruns"] == 0
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pytest -q jarvis/domains/finance/tests/test_production_smoke_gate.py jarvis/domains/finance/tests/test_acceptance_gate.py jarvis/api/tests/test_finance_weekly_decision_routes.py`

Expected: FAIL for missing optimizer sections and live guard.

- [ ] **Step 3: Add replay fixtures and gate calculations**

Include representative snapshots for fresh risk-on, fresh risk-off, 20% drawdown, BTC near 25%, total crypto near 30%, missing deposit, stale ETF quote, stale crypto quote, unavailable broker candidate, source disagreement, minimum-order edge, and partial idle-budget edge. Each fixture includes the expected status and required selected-rule invariants, not a brittle expected market return.

- [ ] **Step 4: Enforce promotion gate in live mode**

`shadow` mode always remains available. `live` mode requires an accepted optimizer gate generated by the current optimizer and constitution versions. A version change automatically returns the deployment to shadow until the new version passes.

- [ ] **Step 5: Run all finance backend tests**

Run: `pytest -q jarvis/domains/finance/tests jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_brief_route.py jarvis/api/tests/test_finance_data_coverage.py jarvis/api/tests/test_finance_recommendation_receipt.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_autopilot.py jarvis/api/tests/test_finance_weekly_decision_routes.py jarvis/data/tests/test_database.py`

Expected: PASS with zero failures.

- [ ] **Step 6: Commit promotion gates**

```bash
git add jarvis/domains/finance/production_smoke_gate.py jarvis/domains/finance/acceptance_gate.py jarvis/domains/finance/tests/test_production_smoke_gate.py jarvis/domains/finance/tests/test_acceptance_gate.py jarvis/domains/finance/tests/fixtures/optimizer_replays.json jarvis/api/tests/test_finance_weekly_decision_routes.py
git commit -m "test(finance): gate autonomous optimizer promotion"
```

---

### Task 9: Deploy Shadow Mode and Verify Production Receipts

**Files:**
- No source changes unless verification finds a defect.

**Interfaces:**
- Consumes Railway production API and Vercel PWA.
- Produces real shadow receipts without changing the authoritative recommendation or user buy sequence.

- [ ] **Step 1: Run complete local verification**

Run backend command from Task 8 and `cd pwa && npm test && npm run build` with the Railway production URL.

Expected: all Python and Node tests PASS; Vite build PASS; `git diff --check` reports no errors.

- [ ] **Step 2: Deploy Railway with shadow mode**

Set `PHOENIX_FINANCE_OPTIMIZER_MODE=shadow`, deploy the verified backend package, and call:

```powershell
Invoke-RestMethod 'https://phoenix-production-1fb2.up.railway.app/finance/weekly-decision'
```

Expected: `mode=shadow`, `authoritative=false`, a persisted receipt, no trades, and a complete legacy comparison.

- [ ] **Step 3: Collect and inspect production shadow evidence**

Verify at least one fresh Monday-cycle receipt and replay it locally from its stored input snapshot. Confirm the same winner, score, alternatives, and input hash. Confirm the existing `/finance/recommendation` and `/finance/manual-buy-checklist` are unchanged in shadow mode.

- [ ] **Step 4: Record acceptance evidence**

Run the production smoke and acceptance gates against the deployed shadow receipt. Do not enable live mode if any blocker, source disagreement, nondeterminism, constraint violation, or checklist mismatch remains.

---

### Task 10: Promote Live Mode, Visual QA, and Reconcile Railway

**Files:**
- Source changes only for defects found during QA.

**Interfaces:**
- Promotes `PHOENIX_FINANCE_OPTIMIZER_MODE=live` only after Task 9 evidence passes.
- Publishes the Decision Stack PWA and winner-backed Buy Sequence.

- [ ] **Step 1: Enable live mode and deploy Railway**

Set `PHOENIX_FINANCE_OPTIMIZER_MODE=live`, deploy, and verify `/finance/weekly-decision` returns `authoritative=true`, an active unexpired receipt, and one PHOENIX PICK.

- [ ] **Step 2: Deploy the verified PWA**

Deploy the clean Vercel package with `VITE_API_URL=https://phoenix-production-1fb2.up.railway.app`. Verify the alias serves the new hashed bundle and service worker refresh migration.

- [ ] **Step 3: Verify Finance Control Room in the in-app browser**

Check desktop and mobile:

- `BRIEF -> SIGNAL` opens the Decision Stack.
- PHOENIX PICK dominates the hierarchy.
- Alternatives expand for audit only and expose no selection control.
- Blocked and stale states hide buy amounts.
- `BUY SEQUENCE` contains exactly the winner's instruments and amounts.
- Deferral disables the entire sequence.
- `DECISIONS` displays the immutable receipt.
- Reduced motion, scrolling, text fit, and clipped geometry remain correct.

- [ ] **Step 4: Reconcile rendered values against Railway**

Compare receipt ID, total budget, each amount, fees, projected weights, timestamps, rule results, and expiry between the rendered DOM and the live Railway JSON. All values must match exactly after formatting.

- [ ] **Step 5: Run final regression verification**

Re-run the complete backend suite, complete PWA suite, production build, `git diff --check`, live smoke gate, and browser reconciliation after the last code change.

Expected: zero test failures, zero smoke blockers, and exact UI/API reconciliation.

---

## Implementation Order and Review Gates

1. Tasks 1-2 establish the pure policy and optimizer; review for financial invariants before integration.
2. Tasks 3-4 establish data quality, reproducibility, and lifecycle; review fail-closed behavior before persistence.
3. Tasks 5-6 establish persistence and APIs in shadow mode; review migration safety and compatibility.
4. Task 7 builds the UI against the stable contract; review autonomy wording and no-override behavior.
5. Task 8 proves promotion requirements; review fixture coverage and version invalidation.
6. Task 9 deploys shadow only; stop if production evidence is incomplete.
7. Task 10 is a separate promotion checkpoint and cannot begin merely because the build passes.

## Spec Coverage Matrix

- Aggressive Growth Constitution: Task 1.
- Weekly Cadence and Monday scheduling: Tasks 4 and 6.
- Input Snapshot and Quality Gate: Tasks 3 and 4.
- Candidate Generator, Constraint Validator, Deterministic Scorer, and Scenario Roles: Task 2.
- Explanation Layer and deterministic fallback: Tasks 4 and 6.
- Decision Receipt and lifecycle: Tasks 4 and 5.
- API Contract and whole-cycle deferral: Task 6.
- Finance Control Room Placement and Visual Direction: Task 7.
- Error and Edge States, including expiry, source disagreement, missing funding, and partial execution: Tasks 3-7.
- Automated Tests, Shadow Mode, and promotion safety: Task 8.
- Production shadow evidence: Task 9.
- Visual Verification, Railway reconciliation, and live acceptance criteria: Task 10.
