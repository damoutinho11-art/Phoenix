# Evidence-driven ETF and crypto recommendations

Status: implemented and reviewed locally; no strategy promoted or deployed.

## User outcome

Upgrade the existing weekly recommendation, not a separate Research panel.
For each ETF and crypto lane, show the selected instrument, executable amount,
evidence-based reasons against alternatives, and conditions that invalidate the
choice. Show WAIT with a specific reason when evidence or eligibility is missing.
“Best” means the highest-ranked eligible choice under an explicit policy, not a
claim about guaranteed future returns.

## Existing shortcomings verified in source

ETF category scores combine allocation gaps with static momentum, valuation,
concentration and fee/liquidity values. Listing selection rewards available
prices and EUR denomination, then configured order. Crypto selection considers
BTC, HYPE and TAO and orders eligible assets by allocation shortfall. Research
context is attached after allocation and does not select the asset.

## Proposed boundary

Preserve verified cash capacity, position limits, efficient minimum buys,
portfolio freshness, weekly closure and manual execution. Authentication stays
in place. No automated orders, portfolio edits or changes to strategic targets.

The user approved broader ETF and crypto choice. This implementation evaluates
all 18 configured ETF listings and the five configured crypto assets (BTC, ETH,
SOL, HYPE and TAO), subject to existing phase and allocation limits. Additional
ETF entries require an explicit mandate review: matching sleeve and observed
ISIN, UCITS, no leverage/inverse exposure and a review source. Unsupported crypto
identities remain excluded. This is a bounded universe, not a broker-wide scan.

## Decision pipeline

1. Validate cash and portfolio authority; calculate eligible contribution room.
2. Obtain dated, source-attributed evidence for eligible candidates. ETF total
   return histories and crypto histories use their actual trading calendars.
   Distinguish missing, stale and conflicting evidence. Do not substitute preset
   scores, zeros or another instrument's history without disclosure.
3. Evaluate ETFs using portfolio fit and measured return/risk evidence, then
   verified product identity, costs and broker availability. Category proxies
   cannot establish a specific listing's fees, overlap or investability.
4. Evaluate crypto independently using portfolio fit, measured risk/return,
   liquidity and asset-specific risk evidence. ETF and crypto scores are not
   directly comparable. Price appreciation alone cannot establish fundamentals.
5. Use a versioned deterministic policy with explicit weights, eligibility
   thresholds and tie handling. These parameters must be documented and tested
   before promotion. The implementation plan records heuristic weights; they
   are not calibrated expected returns or investment probabilities.
6. Choose within each lane, size within the existing limits, and render the
   decision and alternatives in the existing recommendation. Missing decisive
   evidence produces WAIT for the affected lane; missing shared cash authority
   blocks both. Do not force a crypto buy every week.

## Validation and rollout

Use synthetic fixtures to prove evidence can change the selected ETF and crypto
without changing holdings. Test stale/incomplete evidence, ties, risk limits,
transaction costs, broker eligibility, week closure and independent lane waits.
Verify all existing recommendation consumers show the same asset and amount.
Replay candidate policies with historical cutoffs, costs and simple baselines;
report sensitivity and limitations rather than treating one replay as proof.
Do not silently promote the earlier three-ETF descriptive score into authority.
Run security regressions alongside finance tests and the frontend build.
Present the resulting policy and validation evidence before production promotion.

## Approaches considered

- Replace presets with price-history scores only: smaller change, but insufficient
  to substantiate product selection or crypto risk judgments.
- Constrained evidence-driven selection inside the existing recommendation:
  recommended; preserves portfolio rules and makes decisions reproducible.
- Open-ended market discovery: broader choice, but requires a new universe,
  eligibility and data-coverage policy before it can make reliable decisions.
