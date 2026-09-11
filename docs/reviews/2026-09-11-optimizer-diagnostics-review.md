# Optimizer diagnosis and downside comparison

The original allocator has not been promoted or retuned. This release adds an
auditable explanation of its weak historical result and explicit downside
comparisons for research choices in the existing finance brief.

## Why the original study lagged

The lower-cost January 2024–September 2026 study ended €461.65 below broad-ETF
contributions. The exact ending-wealth decomposition is:

| Effect relative to the same dated broad-ETF contributions | Lower-cost case | Higher-cost case |
|---|---:|---:|
| Cash timing | −€198.14 | −€197.30 |
| Instrument choices | −€262.66 | −€261.14 |
| Fee difference, including subsequent growth/loss of foregone units | −€0.85 | +€0.57 |
| Total ending-value gap | −€461.65 | −€457.87 |

This is an ex-post accounting decomposition of synthetic results, not a new test
of investment skill or an inference about future returns. Cash contributed about
43% of the lower-cost shortfall; instrument choices accounted for most of the
remainder. Lower fees alone would not resolve the result.

For each contribution D, benchmark price multiple B, chosen outlays A_i,
instrument multiples G_i, unspent cash C, chosen fees F_i and benchmark fee F_b:

- Cash effect: C × (1 − B).
- Instrument effect: sum A_i × (G_i − B).
- Fee difference: F_b × B − sum F_i × G_i.

These sum to the difference in terminal wealth; they are not additive
annualized-return components. Exact execution/end prices are required, and
reconstructed balances must match the archived study. The lower-cost model left
€660 in cash. Its contribution-only search never redeploys existing cash; this
is an architectural limitation, not an authorization to spend the owner's
recorded reserve. The model also uses the saved investment horizon only to
amortize entry costs; it does not optimize full-horizon terminal wealth.

Machine-readable attribution: `2026-09-10-optimizer-attribution.json`.
Reproduce without network:

```text
python -m jarvis.domains.finance.optimizer_attribution docs/reviews/2026-09-10-optimizer-study.json attribution.json
```

The source report and public-price archive hashes are verified and recorded.
Original v1 study replay still produces every original decision and metric.

## New research risk comparison

`downside-review-v1` compares the research choice, ranked alternatives and keeping
the new contribution in cash. Existing holdings remain in every plan. It reports
cash afterward, entry costs, scenario EUR losses and losses as a percentage of
portfolio wealth before entry costs. The saved drawdown tolerance is displayed as
a reference; this layer does not introduce a new allocation cap or rank plans.

Illustrative direct-shock assumptions:

| Scenario | Equity | Crypto | Bonds | Cash |
|---|---:|---:|---:|---:|
| Broad selloff | −40% | −70% | −15% | 0% |
| Crypto shock | −10% | −80% | 0% | 0% |
| Correlated investment shock | −30% | −30% | −30% | 0% |

These figures are deliberately disclosed hypothetical assumptions, not fitted
forecasts, probabilities, calibrated macro predictions or maximum losses. Asset
classes come from configured sleeve assumptions; unknown classifications do not
receive an invented class-specific shock.

A separate observed window spans 2022-01-03 through 2022-10-12. Supported
instruments must have actual observations near both endpoints. All comparable
plans use the same common endpoint pair. An unsupported instrument makes its
plan incomplete. Future, duplicate, nonfinite and missing observations cannot
be used as valid evidence. The window measures endpoint change, not its maximum
interim drawdown.

Each private optimizer snapshot now contains the exact downside configuration
and classification assumptions. The diagnostic version is separate from the
unchanged allocator version. Results appear in an expandable comparison within
the existing brief; there is no new tab or trading action.

MSCI's methodological guidance distinguishes explicit scenario assumptions from
propagating their effects through a portfolio. Phoenix's direct-shock worksheet
is simpler than a predictive risk-factor model and is not presented as MSCI's
implementation. [MSCI methodology](https://www.msci.com/research-and-insights/blog-post/building-predictive-stress-tests-msci-best-practices).

CFA Institute explains why time dependence and investment horizon deserve
attention beyond one-period means and covariance. This supports recording the
current model's horizon limitation rather than claiming twenty-year optimality.
[CFA research](https://rpc.cfainstitute.org/research/foundation/2024/investment-horizon-serial-correlation-better-portfolios).

## Verification and limits

Synthetic tests cover fee/cash conservation, profitable and falling-market
attribution, corrupt archives, future windows, unknown classes, missing prices,
shared historical endpoints and replay of captured scenario assumptions.
Independent review identified a cross-plan endpoint mismatch; it was reproduced
and corrected before release. The corresponding display was also corrected to
use shared observed dates when the selected plan is incomplete.
An additional regression verifies that no observed dates are claimed when all
instrument histories are missing, including a cash-only portfolio.

Browser DOM verification at desktop and 390px mobile width confirmed the real
component's content and contained horizontal table scrolling. Screenshot capture
was unavailable, so this was DOM/layout verification rather than screenshot QA.
Only synthetic data and a temporary local fixture were used; temporary files,
browser tab and local server were removed afterward.

The original 2024–2026 period is now development evidence. Any later allocator
revision needs declared holdout or prospective evaluation. Issuer-level overlap,
taxes, executable liquidity, cash interest, selling/rebalancing, return estimation
and multi-period planning remain unfinished. Neither this analysis nor any
retrospective price-only result promotes the model to live recommendations.

Verification completed before deployment:

- Finance domain and optimizer API: 242 tests and 11 subtests passed.
- Isolated API security suite: 19 tests and 24 subtests passed.
- Relevant finance route, receipt, checklist and optimizer API tests: 49 passed.
- Final attribution, downside and optimizer API regression run: 17 passed.
- Frontend: 281 Node tests and 24 interaction tests passed; production build passed.
- Original study replay: all original decisions, metrics, configuration and price
  hash remained unchanged. Git whitespace checks passed.

## Production rollout

Source commit `ab31c15a762268d365860ff0b517d0f3d2b60dda` was pushed to main.
Railway deployment `f9b560ef-44d5-4202-9942-b09f8dcd3533` reached SUCCESS with
that exact commit. Vercel deployment `dpl_CVzjUoEb87RY2Jog3FcDEKWohZbV` reached
READY and serves the production alias `https://phoenix-phoenix123.vercel.app/`.
Authenticated Vercel asset retrieval confirmed the published downside component,
observed-endpoint text and correct Railway API origin.

Post-release headers-only checks confirmed absent/invalid owner access returns
401, public health returns 200, and valid owner access returns 200. Anonymous
GET `/finance/optimizer` and POST `/finance/optimizer/run` return 401; owner GET
returns 200. Private responses carry `Cache-Control: no-store`. No private response
bodies were read and no owner-authorized production optimizer run was triggered.

The comparison is available on newly generated research results. Existing saved
results are preserved. Selection remains `contribution_v2`; research diagnostics
do not promote the optimizer or authorize trades. Live verification covers the
deployed assets and access boundary; full result behavior was tested locally with
synthetic inputs. These rollout notes were recorded after the source deployment.
