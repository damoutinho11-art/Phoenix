# AI Berkshire Extraction Audit v1

**Scope:** PHOENIX Research Desk design only  
**Audit date:** 2026-06-27  
**Upstream reviewed:** [xbtlin/ai-berkshire](https://github.com/xbtlin/ai-berkshire)  
**Decision:** Selectively adapt research discipline; do not import the repository as a portfolio or execution engine.

## Verdict

AI Berkshire is useful to PHOENIX as a catalogue of research workflows and validation habits. Its strongest transferable ideas are source-aware financial verification, exact arithmetic, repeatable memo structure, explicit uncertainty, adversarial review, and ongoing thesis tracking. Those ideas belong in a separate, read-only Research Desk.

AI Berkshire must not become an input that can directly allocate money, alter PHOENIX risk bands, mutate `portfolio_state.json`, create orders, or influence the ledger/apply gate. Research may produce a bounded verdict and evidence record. The existing PHOENIX recommendation engine remains the only allocation authority, and manual approval remains mandatory.

The upstream repository includes claimed track records and workflows that generate price bands, buy/sell language, position suggestions, and portfolio changes. PHOENIX should treat those as non-portable. Historical claims are not evidence that a method will work inside PHOENIX, and no claimed return should be copied into product data, tests, UI, or documentation.

## Evidence Reviewed

This audit is based on primary repository materials:

- The [README](https://github.com/xbtlin/ai-berkshire/blob/main/README_EN.md) describes a skills/agents/tools research architecture, multi-perspective analysis, structured workflows, source validation, and claimed performance.
- [`financial_rigor.py`](https://github.com/xbtlin/ai-berkshire/blob/main/tools/financial_rigor.py) implements market-cap reconciliation, valuation calculations, cross-source comparison, exact `Decimal` arithmetic, and scenario calculations.
- [`report_audit.py`](https://github.com/xbtlin/ai-berkshire/blob/main/tools/report_audit.py) extracts financial claims from reports, samples data points, and produces pass/fail audit results after source checking.
- The [investment memo workflow](https://github.com/xbtlin/ai-berkshire/blob/main/codex-skills/investment-memo-craft/SKILL.md) separates business quality, risks, valuation, evidence, and confidence, but also extends into action and price guidance.
- The [earnings review workflow](https://github.com/xbtlin/ai-berkshire/blob/main/codex-skills/earnings-review/SKILL.md) prioritizes primary filings, historical comparisons, management claims, source quality, and post-report audit.
- The [thesis tracker](https://github.com/xbtlin/ai-berkshire/blob/main/codex-skills/thesis-tracker/SKILL.md), [news pulse](https://github.com/xbtlin/ai-berkshire/blob/main/codex-skills/news-pulse/SKILL.md), [quality screen](https://github.com/xbtlin/ai-berkshire/blob/main/codex-skills/quality-screen/SKILL.md), and [portfolio review](https://github.com/xbtlin/ai-berkshire/blob/main/codex-skills/portfolio-review/SKILL.md) provide reusable process ideas with different safety implications.

No source code, prompts, sample companies, return claims, price targets, or portfolio rules should be copied wholesale.

## Useful Components

### 1. Financial rigor tools

| Component | PHOENIX decision | Safe adaptation |
|---|---|---|
| Market-cap verification | Adopt | Recalculate `price × diluted shares` using explicit date, currency, unit, and source identifiers. Record the reported and calculated values plus discrepancy. Never silently reconcile mismatched dates or currencies. |
| Valuation checks | Adopt with limits | Recalculate mechanically verifiable ratios from cited inputs. Keep accounting basis explicit: GAAP/non-GAAP, basic/diluted shares, trailing/forward period, and currency. A computed ratio is evidence, not a buy signal. |
| Cross-source validation | Adopt | Require a primary source where available and at least one independent corroborating source for decision-critical facts. Store disagreement rather than selecting a convenient number. |
| Exact arithmetic | Adopt | Use `Decimal` for currency, ratios, and reconciliation. Store original text, normalized decimal value, unit, currency, and formula so calculations are reproducible. |
| Report audit | Adapt | Validate every decision-critical claim in v1 rather than relying only on random sampling. Later, sampling may be used for low-materiality narrative facts, but never for key valuation or risk claims. |
| Uncertainty labeling | Adopt | Separate source confidence, data completeness, analytical confidence, and verdict. Missing data must produce `INSUFFICIENT_DATA`, not an inferred number. |

Additional PHOENIX guardrails:

- Never use a median of conflicting sources as an automatic truth. Preserve the individual values and resolve the accounting/date/unit difference.
- Never infer a missing price, share count, FX rate, return, P/L, or target.
- Benford-style checks may be an investigation prompt, never evidence of fraud or a verdict by themselves.
- Scenario arithmetic is allowed only when every assumption is labeled as an assumption; it must not flow into the recommendation engine in v1.

### 2. Research workflow ideas

| Workflow | Decision | PHOENIX adaptation |
|---|---|---|
| Investment memo | Adopt first | A compact, source-backed memo with thesis, counter-thesis, risks, uncertainty, confidence, and strict research verdict. No order language or position sizing. |
| Thesis tracker | Adopt second | Append-only observations that test whether a stored thesis is intact, weakened, contradicted, or unresolved. Never trigger an automatic sell. |
| News pulse | Adapt later | A read-only evidence timeline that distinguishes confirmed filings, reputable reporting, commentary, and rumor. “No attributable cause found” must be valid. |
| Earnings review | Adapt later | Prioritize filings and issuer materials; reconcile period-over-period facts; distinguish management statements from verified results; link findings to a memo without changing holdings. |
| Quality screen | Adapt carefully | Use transparent exclusion checks as research flags. Sector-specific accounting differences and missing data must prevent overconfident pass/fail results. Passing a screen does not create a recommendation. |
| Portfolio review | Reject as allocation logic; retain questions | Keep concentration, correlation, and thesis-health questions as read-only review prompts. Do not import target weights, expected-return rankings, rebalance actions, or sell instructions. |
| Anti-bias checklist | Adopt | Require a bear case, disconfirming evidence, source gaps, stale-data warning, consensus-dependence warning, and a statement of the most likely analytical error. |

## Rejected Components

PHOENIX should explicitly reject:

1. **External performance claims.** Do not copy, validate by repetition, display, or use upstream claimed returns as a benchmark, prior, training label, or product promise.
2. **Direct buy/sell logic.** Do not import price bands, entry zones, stop losses, target prices, position sizes, rebalance actions, expected-return rankings, or “replace with cash” rules.
3. **Risk-band bypasses.** No research memo, agent consensus, quality score, news event, or earnings conclusion may override the constitution, phase unlocks, allocation bands, weekly caps, or approval gate.
4. **Execution behavior.** No broker connection, API key, order object, trade submission, automatic selling, or portfolio mutation belongs in Research Desk.
5. **Fake certainty.** Reject uncited claims, source laundering, precise probabilities without methodology, confident causal attribution from timing alone, and narrative that hides data gaps.
6. **Unqualified data.** Reject values without source, observation date, period, currency/unit, accounting basis where relevant, and confidence. Conflicting values remain unresolved until explained.
7. **Agent voting as truth.** Multiple agents can broaden coverage but do not create independent evidence when they reuse the same source. Store evidence provenance, not a synthetic consensus score.
8. **Upstream report persistence patterns.** Do not copy markdown portfolio files or upstream sample reports as operational state. PHOENIX uses SQLite for durable research records and keeps portfolio state separate.

## PHOENIX Research Desk v1 Architecture

### Boundary

Research Desk is a separate evidence system:

```text
sources -> validation records -> research memo -> thesis observations
                                      |
                                      +-> read-only Research Desk API/UI

PHOENIX recommendation engine --------+  no data dependency in v1
ledger / apply / portfolio_state -----+  no mutation path from Research Desk
```

Research memos may mention an asset or sleeve that PHOENIX knows, but they are not recommendations, approvals, transactions, or orders. The recommendation engine must not read Research Desk tables in v1.

### Proposed tables

#### `research_memos`

Purpose: durable, versionable research conclusions.

Suggested fields:

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `asset_key TEXT`
- `sleeve_key TEXT`
- `title TEXT NOT NULL`
- `thesis TEXT NOT NULL`
- `counter_thesis TEXT`
- `risks_json TEXT NOT NULL`
- `uncertainties_json TEXT NOT NULL`
- `source_refs_json TEXT NOT NULL`
- `data_confidence TEXT NOT NULL`
- `verdict TEXT NOT NULL`
- `verdict_reason TEXT NOT NULL`
- `research_as_of TEXT NOT NULL`
- `is_order INTEGER NOT NULL DEFAULT 0 CHECK (is_order = 0)`
- `portfolio_mutation_allowed INTEGER NOT NULL DEFAULT 0 CHECK (portfolio_mutation_allowed = 0)`

Constraints:

- Exactly one of `asset_key` or `sleeve_key` should normally be present.
- `verdict` is limited to `BUY_CANDIDATE`, `WATCH`, `REJECT`, or `INSUFFICIENT_DATA`.
- `data_confidence` should use a small explicit vocabulary such as `HIGH`, `MEDIUM`, `LOW`, or `INSUFFICIENT`.
- `BUY_CANDIDATE` means “eligible for separate PHOENIX consideration,” never “buy now.”

#### `thesis_tracker`

Purpose: append-only observations about whether a memo remains supported.

Suggested fields:

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `memo_id INTEGER NOT NULL`
- `observed_at TEXT NOT NULL`
- `evidence_summary TEXT NOT NULL`
- `evidence_refs_json TEXT NOT NULL`
- `thesis_status TEXT NOT NULL`
- `data_confidence TEXT NOT NULL`
- `uncertainties_json TEXT NOT NULL`
- `next_review_at TEXT`

`thesis_status` should be limited to `INTACT`, `WEAKENED`, `CONTRADICTED`, or `UNRESOLVED`. No status triggers a trade or portfolio mutation.

#### `research_validation_records`

Purpose: an audit trail for source facts and calculations used by a memo.

Suggested fields:

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `memo_id INTEGER NOT NULL`
- `created_at TEXT NOT NULL`
- `field_name TEXT NOT NULL`
- `reported_value TEXT`
- `normalized_value TEXT`
- `unit TEXT`
- `currency TEXT`
- `period_label TEXT`
- `source_name TEXT NOT NULL`
- `source_url TEXT NOT NULL`
- `source_date TEXT`
- `source_tier TEXT NOT NULL`
- `validation_method TEXT NOT NULL`
- `comparison_value TEXT`
- `discrepancy_pct TEXT`
- `validation_status TEXT NOT NULL`
- `notes TEXT`

Store decimal values as normalized strings where exact round trips matter. Validations should be append-only; corrections create a new record rather than erasing audit history.

### Read-only API

The first public API should expose only reads:

- `GET /finance/research/memos`
- `GET /finance/research/memos/{memo_id}`
- `GET /finance/research/memos/{memo_id}/validations`
- `GET /finance/research/memos/{memo_id}/thesis-history`

Memo creation in the first sprint should use a tested internal database helper or explicit local import command, not a public write endpoint. If an authenticated write API is added later, it requires a separate design and audit trail.

Every response should include:

- `research_only: true`
- `is_order: false`
- `trades_executed: false`
- `broker_connection: false`
- `portfolio_state_updated: false`
- `recommendation_engine_updated: false`

Unknown memo IDs return `404`. Invalid or unparseable JSON fields return an explicit data-integrity error; they must not be silently replaced with invented defaults.

## Safety Invariants

1. Research Desk has no import or call path to broker clients, execution services, order creation, or credentials.
2. Research Desk cannot write `portfolio_state.json`.
3. Research Desk cannot write or apply finance ledger transactions.
4. Research Desk cannot approve, defer, reject, or replace a weekly brief.
5. The recommendation engine does not query research tables in v1.
6. Research verdicts are not allocation decisions. `BUY_CANDIDATE` is explicitly non-executable.
7. Every material factual claim has provenance; every calculation has inputs, units, period, formula/method, and validation status.
8. Missing or conflicting decision-critical data forces `INSUFFICIENT_DATA` unless the conflict is resolved and recorded.
9. No return, P/L, market price, valuation, probability, or confidence is fabricated.
10. No upstream performance claim is persisted or displayed.
11. Research source confidence and analytical confidence remain separate concepts.
12. API and UI language always states: **“Research memo only. Not an order. PHOENIX did not execute a trade.”**

## Next Sprint: PHOENIX Research Memo Skeleton v1

### Objective

Build the smallest durable research record that proves the safety boundary before adding automated research collection, news ingestion, thesis monitoring, or UI complexity.

### In scope

1. Add the `research_memos` SQLite table and indexes using existing `init_db` conventions.
2. Add strict validation for:
   - asset or sleeve identity;
   - non-empty thesis and risk list;
   - explicit source references;
   - data confidence;
   - one of four verdicts: `BUY_CANDIDATE`, `WATCH`, `REJECT`, `INSUFFICIENT_DATA`.
3. Add internal helpers:
   - `save_research_memo(payload) -> int`
   - `list_research_memos(limit=50) -> list[dict]`
   - `get_research_memo(memo_id) -> dict | None`
4. Add read-only list/detail API endpoints with the safety flags above.
5. Store risks, uncertainties, and source references as structured JSON.
6. Add tests for schema creation, valid persistence, verdict rejection, missing-source behavior, exact read-back, empty list, `404`, and all safety flags.
7. Optionally add a simple read-only Research tab in a later sprint, after the backend contract is reviewed.

### Explicitly out of scope

- Automated web research or external API calls
- AI-generated memos inside the request path
- `thesis_tracker` and validation tables beyond schema design
- News pulse or earnings ingestion
- Recommendation-engine integration
- Price targets, position sizing, risk-band changes, or trade suggestions
- Approval, ledger, apply, broker, order, and portfolio-state changes

### Proposed memo contract

```json
{
  "asset_key": "quality_etf",
  "sleeve_key": null,
  "title": "Quality ETF research memo",
  "thesis": "Source-backed research thesis text.",
  "counter_thesis": "Strongest evidence-backed reason the thesis may fail.",
  "risks": ["Explicit risk with source or uncertainty label."],
  "uncertainties": ["Known missing or conflicting information."],
  "source_refs": [
    {
      "label": "Issuer primary document",
      "url": "https://example.invalid/source",
      "source_tier": "PRIMARY",
      "as_of": "2026-06-27"
    }
  ],
  "data_confidence": "MEDIUM",
  "verdict": "WATCH",
  "verdict_reason": "Evidence supports continued research but not candidate status.",
  "research_as_of": "2026-06-27"
}
```

The example is a contract illustration, not a real memo or investment conclusion. Tests should use clearly labeled fixtures and must not leak fixture text into production UI.

### Response safety envelope

```json
{
  "research_only": true,
  "is_order": false,
  "trades_executed": false,
  "broker_connection": false,
  "portfolio_state_updated": false,
  "recommendation_engine_updated": false,
  "message": "Research memo only. Not an order. PHOENIX did not execute a trade."
}
```

## Acceptance Checklist

### Audit v1

- [x] Upstream ideas assessed as research inspiration rather than portfolio logic.
- [x] Financial rigor components classified for adoption or adaptation.
- [x] Research workflows classified for adoption, later adaptation, or rejection.
- [x] External performance claims explicitly excluded.
- [x] Buy/sell, position-sizing, and portfolio-optimization logic explicitly excluded.
- [x] Research/recommendation separation documented.
- [x] Three-table Research Desk architecture defined.
- [x] Read-only endpoint boundary defined.
- [x] Safety invariants defined.
- [x] Smallest next sprint specified.

### Research Memo Skeleton v1 implementation gate

- [ ] `research_memos` exists after `init_db` and migration is idempotent.
- [ ] Only the four allowed verdicts are accepted.
- [ ] Missing decision-critical evidence can be represented as `INSUFFICIENT_DATA` without invented values.
- [ ] Source references and uncertainty labels survive exact database round trips.
- [ ] Public Research Desk endpoints are read-only.
- [ ] Empty list and missing memo states are honest.
- [ ] Every response contains the no-order/no-execution/no-mutation safety envelope.
- [ ] Recommendation output is byte-for-byte behaviorally unchanged by adding Research Desk.
- [ ] Approval, ledger, apply, and performance snapshot tests remain unchanged and pass.
- [ ] No broker dependency, API key, order model, or portfolio mutation is introduced.

## Final Recommendation

Proceed with **PHOENIX Research Memo Skeleton v1** only. It creates a durable evidence boundary and vocabulary without allowing research content to influence money movement. Defer thesis tracking, news pulse, earnings review, quality screening, and UI work until the memo contract and safety envelope have passed review in production-like SQLite tests.

Do not copy AI Berkshire wholesale. Extract the discipline; leave behind the trading implications, performance narrative, and uncited certainty.
