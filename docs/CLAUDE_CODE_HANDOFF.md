# JARVIS — Handoff Brief for Claude Code

Personal Iron-Man-style life/finance manager for Diogo (professional bassoonist,
Solo Bassoon at Estonian National Opera Tallinn; also runs body comp/training
goals and wants this to eventually cover his whole schedule). This brief gets
you from "here's what exists" to "here's what to build next" without losing
the context from the design conversation that produced it.

## Core philosophy (non-negotiable, applies to every domain)

JARVIS researches, surfaces, and proposes. The user approves anything that
touches the outside world (money, opera schedule conflicts, irreversible
commitments). Low-stakes internal actions (JARVIS's own training schedule
entries, reminders) can be created without asking. This mirrors the finance
domain's existing constitution: `manual_approval_required: true`,
`no_auto_trading`, `no_broker_connections`, `no_api_keys`, `no_network_calls`.

**Do not weaken this anywhere.** If a new feature would create an order, place
a trade, submit a form on an external site, or take any irreversible
real-world action without explicit per-action user confirmation, stop and ask
rather than build it.

## Recommended tooling: obra/superpowers

Before starting any new domain (calendar, training, music), install
[obra/superpowers](https://github.com/obra/superpowers) (MIT, actively
maintained, ~235k stars as of this writing - verified directly on GitHub,
not from a third-party aggregator). It forces a brainstorm -> spec ->
plan -> test -> review discipline before code gets written, and uses git
worktrees to isolate experimental work from the main tree.

This is recommended for a specific reason, not because it's popular: its
actual mechanism is a direct structural defense against the exact failure
mode that produced the original 1,400-file repo (versioned modules added
forward with no consolidation, parallel report/audit layers, no spec step
before implementation). If Code installs it before touching the calendar
domain or the yfinance data-layer work below, it should make that kind of
sprawl structurally harder to fall back into.

Install:
```
npx skills add obra/superpowers
```
(or see the repo's README for the full install matrix across hosts.)

No other third-party Claude Code tooling is recommended here. A broader set
of "best agent skills" repos was evaluated during this project (web
scraping, token-compression, science-domain skill packs, full-stack
skill bundles, prompt-writing tools) and none solve a problem JARVIS
actually has - they're tooling for *how* an agent codes, not domain logic
for *what* JARVIS does. Resist adding tooling because it's trending; that
instinct is part of what this rebuild is recovering from.

## Why this rebuild exists

The prior implementation (`desktop-jarvis-portfolio-os`) grew to 1,400+ files
across 140+ internal "stages" with two competing, partially-overlapping
portfolio engines, only one of which was ever actually wired to the real
entry point. A full forensic audit and partial cleanup were done before the
decision was made to extract only the proven, load-bearing logic into a
clean structure instead of continuing to patch the old repo. **Do not let
domains grow past a few files each without a clear reason.** If a domain
starts accumulating `_v2`, `_v3` suffixed files or parallel "report" modules
next to every real module, stop and flag it — that pattern is exactly what
caused the original collapse.

## Architecture

```
jarvis/
  core/
    safety.py          # DONE - manual-approval refusal boundary, domain-agnostic
    memory.py           # NOT BUILT - shared fact store, see "Memory model" below
  domains/
    finance/             # DONE (see audit below) - reference pattern for new domains
    calendar/             # NOT BUILT - see "Calendar domain" below
    training/              # NOT BUILT
    music/                  # NOT BUILT
  interfaces/
    dashboard/               # NOT BUILT - "see everything" surface
  agents/
    cowork_bridge/              # NOT BUILT - see "Cowork / browser access" below
```

Each domain should follow the finance domain's shape: a `constitution.json`
(or equivalent policy file) defining rules and bounds, an `engine.py` doing
the actual logic, a `tests/` directory that's kept in lockstep with the
engine, and nothing else unless there's a specific reason. No `_report.py`
twin files, no versioned filenames.

## Host environment

This is designed to run inside **Claude Cowork**, not as a standalone hosted
app. Reasoning: Cowork already provides a persistent agentic session, code
execution, and - critically - **browser control**, which is required for the
calendar domain (see below) since that target system has no API and is
robots-disallowed for plain fetching. Building custom browser-automation
infrastructure from scratch would repeat the original project's mistake of
over-building infrastructure before the domains themselves work.

Voice (the actual "Iron Man" feel) is deferred - Cowork's mobile app gives
remote access already, which covers "ask JARVIS something from my phone."
Custom wake-word/voice infrastructure is explicitly **out of scope** until
the domains are solid; building it early was part of what produced
`premium_chat_voice_hud` / `voice_briefing` module sprawl in the old repo.

## Memory model

Single shared fact store, domain-owned writers. Each domain writes its own
state into a common place; domains read each other's published facts but
never call each other's internal functions directly. This is what lets
"don't schedule heavy leg day the afternoon before a concert" work (reads
both calendar and training facts) without entangling the two domains'
internals. **Not yet built** - needed once a second domain (calendar) exists
to read the first domain's (finance, or eventually training) facts.

---

## STATUS: Finance domain

### What's done and verified

Location: `jarvis/domains/finance/`

- `engine.py` - the proven allocation engine, ported from the old repo's
  `allocation_engine.py`. **Verified byte-identical output** against the
  original via direct diff on real portfolio data (`portfolio_state.json`),
  plus the original test suite passing unchanged after the port.
- `constitution.json` - real rules: target weights, crypto risk caps
  (`btc_max: 0.15`, `total_crypto_hard_max: 0.225`, etc.), legacy holding
  policy, platform routing. Now also has `sleeve_bands` (explicit min/max
  per sleeve, sourced from `etf_universe.json`'s `allowed_band` for the
  three ETF sleeves and from `crypto_risk_rules` for crypto).
- `risk_metrics.py` - annualized volatility (log returns, `sqrt(252)`,
  Bessel-corrected sample variance), max drawdown, windowed returns
  (1/3/6/12mo). Correct math, properly tested.
- `etf_scoring.py` - five-factor weighted ETF sleeve scoring (gap, momentum,
  valuation/risk, concentration, fee/liquidity).
- `market_data_loader.py`, `data_contracts.py` - supporting fixture-loading
  and typed data contracts for the risk metrics module.
- `core/safety.py` - manual-approval refusal boundary (the canonical "I
  cannot execute that command" response).

Two deliberate additions beyond a straight port (both verified additive -
diffed against the pre-addition output to confirm zero behavior change to
existing fields), plus one bug-fix-shaped addition:

1. **`SleeveStatus.band_status`** (`below_min` / `within_band` / `above_max`)
   - computed from the new `constitution.json` -> `sleeve_bands` section.
   Note: the *existing* `sleeve_band_issues()` warning function was
   deliberately **left untouched** (still uses its old hardcoded bands) to
   avoid silently changing live warning behavior - `band_status` is
   currently informational only, not yet wired into warnings. See "Next
   steps" below.
2. **`holding_classifications()`** - unified view of every holding (active +
   legacy) with one classification each (`investable_active`,
   `legacy_acceptable`, `legacy_unwanted_fee_sensitive`, `legacy_cash`).
   Purely additive; `legacy_holdings_status()` (the original function) is
   untouched.
3. **`portfolio_state_staleness_warning()`** - flags when
   `portfolio_state.json`'s `as_of` date is more than 7 days old (or
   missing/malformed/future-dated). Wired into `allocate_weekly_budget()` so
   it's the first warning in every ticket when triggered. This was a real
   gap found during audit: the engine recorded `as_of` but never checked it.

All additions have regression tests. Full suite: 18 tests, all passing
(`jarvis/domains/finance/tests/`).

### Known real gaps - not cosmetic, need actual work

1. **`portfolio_state.json` is stale by default** (it's whatever was true
   when ported - check the `as_of` field; the staleness warning above will
   tell you if it's > 7 days old). This file represents Diogo's actual
   holdings. It needs a real, current update before any recommendation
   should be trusted, and ideally a clean way for him to update it
   (currently just hand-edit JSON).
2. **`etf_universe.json`'s scores are static, hand-entered numbers** -
   `momentum_score`, `valuation_risk_score`, `concentration_penalty`,
   `fee_liquidity_score` for each of the 3 ETF sleeves have no source, no
   `as_of`, no refresh mechanism anywhere in the codebase. The weekly
   recommendation's ETF pick rests entirely on these numbers. This needs
   either (a) an explicit, visible "last manually reviewed: DATE" field so
   staleness is at least visible the same way portfolio_state now is, or
   (b) a real data source wired in. Don't silently treat these as live.
3. **No live market price feed exists anywhere.** `risk_metrics.py` is
   correct but has only ever run against `data/market_data.example.json`,
   which is synthetic test fixture data (`quality_etf_candidate` is not a
   real ticker). If risk metrics are meant to inform real decisions, a real
   price source needs to be connected - this was never done in the original
   project either (confirmed: zero modules in the old codebase actually
   computed live prices into this format).

   **Recommended fix: [yfinance](https://github.com/ranaroussi/yfinance)**
   (Apache-2.0, ~23.7k stars, actively maintained, no API key required -
   verified directly on GitHub). It pulls free Yahoo Finance OHLC history
   via `yf.download("VWCE.DE", start=..., end=...)`, returning a pandas
   DataFrame that maps closely onto `NormalizedPricePoint`/
   `NormalizedMarketSeries` in `data_contracts.py`. Several other finance
   libraries were evaluated for this (FinanceToolkit, FinanceDatabase,
   FinancePy, two AI-wrapper "finance assistant" repos, and the archived/
   unmaintained Ruby `maybe-finance/maybe`); yfinance is the best fit here
   specifically because it needs zero API key and zero paid dependency,
   which matches the constitution's `no_api_keys` spirit most closely. Two
   honest caveats to carry forward: yfinance scrapes Yahoo's undocumented
   endpoints (not an official API), so it's somewhat fragile to upstream
   changes, and Yahoo's own ToS restricts use to personal/research purposes
   - both fine for this project, neither fine to ignore if scope ever grows
   beyond personal use.

   For ISIN/ticker lookups (e.g. confirming VWCE's exact ticker across
   exchanges), [FinanceDatabase](https://github.com/JerBouma/FinanceDatabase)
   (MIT, ~7.8k stars, 300k+ symbols, no API key) is a reasonable
   complement - lower priority than yfinance, only worth adding if ticker
   resolution becomes a real blocker.
4. `sleeve_band_issues()` should eventually be reconciled with the new
   `sleeve_bands` constitution data (right now there are two slightly
   different sets of "what's the max weight for this sleeve" - the old
   hardcoded one driving warnings, and the new explicit one driving
   `band_status`). Do this deliberately, with a diff-verification pass like
   the rest of this port, not as a quick swap - the values genuinely
   differ for several sleeves and swapping silently would change live
   warning behavior.

### Reference: how to verify changes to this domain

Before changing `engine.py` logic, get a baseline:
```bash
python3 -c "
from jarvis.domains.finance import engine
import json
print(json.dumps(engine.build_weekly_result(), indent=2, sort_keys=True, default=str))
" > /tmp/baseline.json
```
Make your change, regenerate, diff. Any difference should be one you can
explain and justify, not a surprise. Run `pytest jarvis/domains/finance/tests/`
after every change.

---

## NOT BUILT YET

### Calendar domain (next priority - user wants this soon)

Source: Estonian National Opera's internal scheduling system, Plaan
(`https://plaan.opera.ee/v2/workspace/`). This is a real, login-walled
internal web app - confirmed `robots.txt`-disallowed for plain fetching, so
it requires actual browser automation (Cowork), not an API integration.

**Hard constraint, explicitly confirmed by the user: strictly read-only.**
JARVIS should be able to check the schedule and surface conflicts, but must
**never** click, submit, or change anything on that site. If you build
anything here that could mutate state on Plaan, stop - that's outside the
agreed scope.

The user's own training/practice schedule (basketball, bassoon practice
blocks) is explicitly **not** synced to an external calendar - it should
live natively inside JARVIS as its own local data, separate from the Plaan
read-only integration. JARVIS can create/move these freely without asking
(low-stakes, internal-only).

### Training domain

Body composition cut (target: late July), plyometric program (goal: dunk a
basketball by August 2026), PPL/Upper/Lower training split. A separate PWA
("Breakthrough 120") already exists tracking this - treat it as one input
source for now, not the system of record (user was explicit this is
undecided; don't assume integration direction).

### Music domain

Practice scheduling, repertoire tracking. Not scoped in detail yet - will
need a conversation with the user about what this actually needs to do
before building.

### Dashboard

The "see everything" surface the user explicitly asked for alongside voice.
Should pull from each domain's published facts (once `core/memory.py`
exists) rather than reaching into domain internals directly.

### Cowork bridge / browser access

The mechanism by which JARVIS hands off read-only browser tasks (Plaan
checks) to Cowork's browser tools. Needs to be built and iterated against
the real, live site - this is exactly the kind of work that benefits from
fast edit-test loops against a real browser session rather than sandboxed
verification, which is part of why this handoff exists.

---

## Working style notes (carried over from the design conversation)

- Big architectural or "which design do we keep" decisions should go back to
  the user before being built - e.g. the finance domain's port involved a
  real choice between two competing engines (one proven/wired-up but
  simpler, one more sophisticated but never connected to anything real).
  The user was shown a concrete side-by-side before deciding. Don't make
  that kind of call silently.
- Verify behavior preservation concretely (diff real output, run real
  tests) rather than asserting "this should be equivalent." Several real
  bugs were caught this way during the finance port (a false-positive
  credential scanner, a mismatched band-value source, a warnings-shape bug)
  that would have shipped if only "looks right" had been the bar.
- The user is a careful reviewer who wants to see the actual data/numbers,
  not just hear "it's done" - the finance domain almost got handed off
  before someone checked whether `portfolio_state.json` was actually
  current. Audit data freshness and realism, not just code correctness,
  before declaring a domain ready.
