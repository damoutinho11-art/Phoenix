# Backend Foundation Review 2

## Scope

Reviewed the backend-integrity foundation for maintainability, performance, duplicate configuration, SQLite lifecycle, hidden network work, import-time side effects, critical-write exception handling, and cockpit contract consistency.

## Maintainability findings

- **Fixed — duplicated ETF-leg discovery:** acceptance and smoke gates independently implemented the same current-ETF lookup. Consolidated this into `acceptance_gate.current_etf_asset()` and reused it from smoke evaluation and compact output.
- **Fixed — tracked scratch artifact:** `.superpowers/sdd/task-5-report.md` was accidentally committed despite `.superpowers/` being ignored. Removed it from version control; SDD reports remain local scratch state.
- **Not applicable — path/time configuration:** database and portfolio JSON paths each have one production default plus explicit environment overrides. API and persistence wall-clock reads use `jarvis.core.clock`.
- **Not applicable — cockpit model naming:** enum and field names match the approved cross-domain contract and serialize predictably through Pydantic.

## Performance findings

- **Not applicable — test runtime overhead:** the isolated runtime adds one temporary directory, one fixture copy, and one SQLite file per pytest session. The full 692-test suite completes in roughly 2.5 minutes without touching tracked state.
- **Not applicable — gate fixture cost:** local acceptance creates deterministic evidence only in temporary SQLite. Live gate modes remain explicit, read-only opt-ins.
- **Deferred — suite duration:** the full suite is healthy but slow. Parallelization or test grouping belongs in a dedicated CI plan because changing execution strategy is unrelated to cockpit data correctness.

## Resource and side-effect findings

- **Not applicable — SQLite lifecycle:** reviewed persistence helpers close connections in `finally` blocks; changed helpers retain that pattern.
- **Not applicable — background network activity:** pytest disables background jobs before application import. Live market/news/calendar calls remain adapter-bound or explicit live-gate opt-ins.
- **Deferred — import-time `init_db()`:** `jarvis.api.main` initializes SQLite at import time for legacy module-level `TestClient` usage. Removing it safely requires migrating many tests and callers to lifespan-managed clients. The new pytest runtime makes this side effect repository-safe; a later API-architecture slice should remove it deliberately.
- **Not applicable — critical writes:** no reviewed change introduced swallowed failures in critical write paths. The pre-existing JSON backup remains best-effort after the canonical SQLite commit.

## Compatibility and safety findings

- **Not applicable — Finance behavior:** recommendation amounts, scoring, allocation, broker boundaries, ledger/apply semantics, and false safety flags remain unchanged.
- **Not applicable — dynamic gates:** current ETF validation is centralized, requires exactly one ETF leg and a non-empty selected instrument, and preserves backward-compatible `quality_*` compact aliases.
- **Not applicable — truthful charts:** shared series models reject non-finite values and do not create or interpolate points.

## Fixes applied

1. Centralized current ETF-leg discovery in the acceptance module.
2. Reused the helper in smoke validation and compact result generation.
3. Removed the accidentally tracked SDD report.

## Deferred findings and reasons

1. Import-time database initialization: defer to an API application-factory/lifespan migration with dedicated compatibility tests.
2. Full-suite performance optimization: defer to CI/tooling work after domain cockpit contracts are stable.
