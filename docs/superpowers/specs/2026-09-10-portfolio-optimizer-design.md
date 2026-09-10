# Portfolio optimizer challenger

User direction: compare whole-portfolio alternatives and let analysis determine
Bitcoin allocation, rather than choosing a fixed 15%/25% asset limit. Use the
saved horizon and stated drawdown tolerance. Existing production contribution
recommendations remain authoritative until a promotion gate is satisfied.

## Method and scope

Enumerate buy-only contributions containing at most one ETF and one crypto plus
unspent cash at 10% budget increments, including all-cash and 100% single-asset
contributions. Honor minimum efficient buys, verified instrument/broker/research
evidence and phase eligibility. The challenger does not use target shortfalls,
fixed BTC caps, or the production policy's allocation-band caps to size purchases.
No leverage, automatic sells or broker execution are introduced.

Reconcile active and legacy balances to exact symbol exposures, excluding the
emergency fund. Unknown noncash holdings block whole-portfolio analysis. Preserve
the provenance of legacy ticker assumptions. Fetch five years of public daily
history, convert foreign listing history using same-date FX, and align completed
weekly observation dates. Require 104 weekly returns. No future observations,
interpolation or silent missing-holding exclusions. Daily ETF/crypto close times
remain asynchronous and are disclosed.

Estimate annualized means and covariance from those weekly returns. Compare nine
explicit model assumptions: mean shrinkage .25/.5/.75 toward zero and risk
aversion 2/4/6. Score each entire net-of-entry-cost portfolio using annualized
mean-minus-half-risk-aversion-times-variance, less entry wealth loss divided by
the configured horizon. Historical fund-price returns already include expenses;
do not subtract current TER a second time.

Choose the plan minimizing maximum regret relative to each scenario's best
feasible plan. This avoids the degeneracy of simply maximizing worst utility,
which would always select the largest risk aversion. Report scenario winners,
regret, selected weights, volatility, costs and correlation matrix. Model
parameters are assumptions to evaluate, not measured probabilities.

Screen hypothetical historical buy-and-hold paths initialized at projected
weights against the stated drawdown tolerance. This is a modeled screen, not a
future-loss guarantee. No feasible plan returns RISK_REVIEW; equivalent distinct
plans return AMBIGUOUS. This version has no forward-looking macro/crash stress
scenarios; its nine utility assumptions are sensitivity tests, not crash forecasts.
Inadequate evidence returns INSUFFICIENT_DATA. Missing
history for candidate-only instruments is a disclosed exclusion; missing history
for a held instrument blocks the entire analysis.

## Evidence and integration

Expose a protected research-only optimizer API with exact snapshot inputs and
ranked comparisons. Reuse the existing finance surface for a short research
status; never put unpromoted actions into the manual execution checklist.
Archive dated effective inputs and the model version in private saved records.
Do not equate price correlation with issuer/holdings overlap; that remains an
explicitly unmeasured capability along with taxes and return-forecast accuracy.

## Evaluation and promotion

Chronological public-price study: fit before each execution date, execute at the
next observed price, carry instrument units/cash separately for each strategy,
same contributions/costs. Compare broad-ETF-only contributions and 80/20
ETF/Bitcoin contribution splits (not continuously rebalanced portfolios). Use
unitized performance and drawdown so deposits do not hide losses. Archive exact
price inputs and hashes. Current-universe/assumed-cost results are conditional,
not a reconstruction of historical broker/research approval.

Default promotion status is NOT_VALIDATED. No retrospective price-only result
alone enables live recommendations; point-in-time evidence and risk review are
required. Deliver a functioning comparison engine and honest validation results,
not an unsupported claim of investment superiority.

## Review basis

Independent design review identified minimax degeneracy, complete holdings
reconciliation, entire-portfolio cost normalization, net fund-return expense
handling and deposit-adjusted evaluation as required corrections.

Primary references: [CFA portfolio risk and return](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/portfolio-risk-return-part-1)
and [CFA asset allocation](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/principles-asset-allocation).
