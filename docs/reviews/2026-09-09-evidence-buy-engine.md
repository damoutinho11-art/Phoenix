# Evidence buy engine — local validation

## Result

The opt-in evidence_v1 policy selects the actual ETF and crypto recommendation
inside the existing allocation engine. The current production default remains
legacy. No deployment, private production finance read, portfolio edit or trade
was performed during this implementation.

The existing rationale displays the instrument, cash outlay, estimated costs,
historical returns, drawdown, last completed close and reasons to buy or wait.
The recommendation, saved brief and manual checklist use the same decision.
Changed decisions cannot inherit the previous saved brief's approval ID.

## Policy

Within each lane: 35% proportional target gap, 20% 90-day return, 20% 180-day
return, 15% lower volatility and 10% smaller drawdown. A second policy uses
35/15/15/20/15. Both must have the same unique winner. This is a historical
heuristic, not a claim to maximize future returns.

The selector preserves cash authority, emergency-fund exclusion, phase limits,
broker readiness, crypto caps, efficient minimum buys and manual execution.
It requires current identity, costs and broker evidence. Crypto additionally
requires a recent validated BUY_CANDIDATE memo; WATCH and REJECT do not support
buying. One verified ETF share class gets one ranking vote across listings.
Incomplete evidence for a mandate-eligible rival blocks that lane's comparison.

Missing closes are reported and omitted, never filled in. Remaining observed
closes must satisfy minimum history, maximum gaps and freshness checks.

## Public-source smoke, 2026-09-09

23 configured instruments were evaluated: 18 ETF listings and five crypto
assets. This is not an exhaustive market scan. The checks did not read holdings.

- VWCE.DE, IUSQ.DE and IS3Q.DE had EUR metadata, public broker verification,
  observed reference spreads and usable histories. Their latest complete
  observed close was September 7; one empty September 8 close was disclosed.
- BTC, ETH and SOL had EUR histories, public LHV product verification and
  Coinbase EUR reference bid/ask quotes. The quote is explicitly a market
  reference, not an LHV execution quote. Actual broker costs need confirmation.
- HYPE-EUR and TAO-EUR did not provide usable history through the current
  mapping. Several ETF alternatives lacked spreads or broker verification.
  These failures are retained as missing evidence and may require WAIT.

Sources: [Lightyear pricing](https://lightyear.com/en-eu/pricing),
[LHV crypto](https://www.lhv.ee/en/crypto/),
[Coinbase ticker contract](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-ticker).

## Verification and review

- Finance domain: 145 tests plus 10 subtests passed.
- Isolated security and authenticated evidence API: 15 tests passed.
- Existing checklist, saved receipt and ledger API regressions: 47 tests passed.
- Full API run: 1,095 passed plus 3 subtests; one obsolete assertion expected
  three configured crypto tickers. Updated it to five with explicit asset names;
  all 13 data-coverage tests then passed. The full suite was not repeated after
  that test-only correction.
- Frontend: 281 Node tests and 20 interaction tests passed; production build passed.
- Independent review identified and verified fixes for stale brief approval IDs,
  duplicate ISIN weighting, unknown currency exclusions, mismatched crypto
  asset/symbol identities and ignored research REJECT verdicts. Final review
  reported no further important findings and reran 27 focused tests successfully.

Offline business-route tests now authenticate their local ASGI clients with a
synthetic key. Security tests live outside that fixture and exercise real
credential rejection. Production middleware was not changed.

## Promotion requirements

The code is reviewable locally. Production promotion remains pending:

1. Resolve or explicitly scope the current alternative-coverage gaps so a
   comparison can complete without hiding missing rivals.
2. Evaluate archived point-in-time snapshots before claiming strategy quality.
   The new buy_replay module compares selected purchases with target-gap and
   cash baselines under explicit historical cutoffs and costs. Its current
   synthetic tests prove causality and missing-data handling, not performance.
   No real historical performance claim has been established.
3. Review resulting coverage and decisions before setting
   PHOENIX_FINANCE_SELECTION_MODE=evidence_v1 on the authenticated deployment.

No calibrated expected-return model, valuation model, holdings-level overlap
analysis, tax model or autonomous broker-wide discovery is included. A stronger
investment decision requires those additional inputs; the current heuristic
must not be described as universally optimal.
