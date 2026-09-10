# Diagnose optimizer decisions and compare downside scenarios

Continue the user's approved portfolio-manager improvement work. This iteration
adds evidence for the next model revision; it does not tune or promote the v1
allocator based on its already-inspected January 2024–September 2026 study.

## Selected approach

First attribute the existing result and expose explicit downside assumptions.
Retuning return/risk coefficients on this same period would contaminate the
evaluation. Replacing v1 immediately with the best retrospective baseline would
also lack prospective evidence. Both alternatives are deferred.

1. Offline cash-flow attribution decomposes the ending-value gap against broad
   ETF contributions into cash timing, instrument selection and fee differences.
   It uses each actual archived contribution date and exact observed entry/end
   prices. Reconcile to the archived ending values; label this an ex-post
   accounting decomposition, never an independent validation or causal forecast.
2. A pure downside module projects the selected plan, ranked alternatives and
   keeping the new contribution in cash. Show remaining cash and entry costs,
   historical-window effects, and explicitly illustrative asset-class shocks.
   Report each scenario's EUR loss and percentage of pre-entry portfolio wealth.
3. Hypothetical scenarios use documented fixed assumptions, not fitted
   probabilities: broad selloff (equity -40%, crypto -70%, bonds -15%, cash 0),
   crypto shock (equity -10%, crypto -80%, bonds 0%, cash 0), and correlated
   investment shock (all noncash -30%). Portfolio sleeves provide an explicitly
   disclosed asset-class assumption, not issuer-level look-through. Unknown
   exposures make a scenario incomplete rather than risk-free.
4. The historical window is 2022-01-03 through 2022-10-12. All noncash instruments
   need common actual observations near both endpoints; no interpolation,
   invented pre-inception prices or observation on/after the decision date.
5. Capture scenario configuration and classification assumptions in the private
   optimizer input snapshot. Keep v1 allocator and its archived replay unchanged;
   version the new diagnostic layer separately. Add a compact expandable risk
   comparison to the existing brief; no new tab or execution action.

The drawdown tolerance is displayed as a reference for scenario losses. This
diagnostic layer does not impose a new asset allocation cap or authorize trades.
Scenario losses are illustrative, not estimated likelihoods or maximum losses.
Cash already held remains outside the current contribution search; do not spend
it without reconciling cash authority. Taxes, liquidity and issuer overlap remain
explicitly incomplete.

## Validation

Synthetic tests cover exact fee/cash conservation, zero-return and losing-market
attribution, per-instrument decomposition, missing classifications and histories,
future-data rejection, endpoint alignment and exact snapshot replay. Reproduce
the original study unchanged, generate a separate diagnostic artifact, review
independently, test API/frontend/security and deploy the diagnostic additions.
The original study is now development evidence; future validation must use a
declared holdout or genuinely prospective outcomes.

## Methodology references

MSCI describes explicit, complete scenario assumptions followed by propagation
across portfolio risk factors. This implementation uses simple direct shocks,
not MSCI's predictive factor model or its calibration:
https://www.msci.com/research-and-insights/blog-post/building-predictive-stress-tests-msci-best-practices

CFA Institute notes that a return/covariance-only description omits time
dependence relevant to investment horizon. The existing one-period optimizer is
therefore not claimed to optimize twenty-year terminal wealth:
https://rpc.cfainstitute.org/research/foundation/2024/investment-horizon-serial-correlation-better-portfolios
