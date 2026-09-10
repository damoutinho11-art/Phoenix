# Portfolio optimizer: built for comparison, not promoted

The new whole-portfolio contribution challenger is functional, but its first
conditional historical evaluation does **not** support replacing the production
contribution policy. It earned less than both simple baselines with only a modest
reduction in maximum drawdown. Promotion remains `NOT_VALIDATED`.

## What was implemented

The engine compares one ETF, one crypto and remaining cash across a 10% contribution
grid. It accounts for all recorded active and legacy exposures, estimated entry
costs, covariance and nine return-shrinkage/risk-aversion assumptions. It chooses
the feasible plan with the smallest worst regret across those assumptions. The
research engine has no fixed BTC percentage ceiling; current phase, broker,
instrument identity and crypto-research evidence gates remain.

The risk screen tests hypothetical historical buy-and-hold paths initialized at
each projected portfolio. It does not implement forward-looking macro or crash
stress scenarios. The saved drawdown tolerance is a modeling input, not a future
loss guarantee. Unknown holdings, incomplete valuation, missing held-instrument
history, risk-infeasible choices and equivalent plans produce explicit non-choice
statuses. Legacy ticker assumptions remain visible and require reconciliation
before a promotion claim.

`POST /finance/optimizer/run` runs an owner-authenticated research comparison;
`GET /finance/optimizer` returns the last saved research result. Exact inputs,
version and source provenance are archived in `finance_optimizer_runs`, separate
from weekly approvals, transactions and execution checklists. The existing brief
contains an inline comparison action and research-only result. No new tab, order
placement or automatic trade authority was added.

## Conditional public-price result

Evaluation: 2024-01-02 through 2026-09-08; 32 monthly contributions of €100,
€3,200 contributed to each strategy. Universe: VWCE, SPYI, IUSQ, IS3Q, XNAS,
SXRV (EUR listings), BTC/EUR, ETH/EUR and SOL/EUR. Five years of adjusted public
prices were collected on 2026-09-10. Each signal uses only prices before its
cutoff; trades execute at the next common observed close. Daily unitization
removes deposits from return and drawdown measurements. Units and unspent cash
carry forward without selling or ongoing rebalancing.

Lower assumed one-way entry costs: ETFs 0.05%, crypto 0.5%.

| Strategy | Ending value | Annualized time-weighted return | Maximum drawdown |
|---|---:|---:|---:|
| Optimizer challenger | €3,582.90 | 9.63% | 19.56% |
| Broad ETF contributions | €4,044.55 | 18.10% | 21.08% |
| 80% ETF / 20% BTC contributions | €3,878.66 | 19.47% | 21.35% |

With higher assumed costs (ETFs 0.25%, crypto 1%), annualized time-weighted
returns were 9.38%, 17.76% and 19.02%, respectively. Both cost cases produced
32 unique research choices. These are hypothetical results, not the owner's
portfolio performance. Different ending values and time-weighted return rankings
can arise because contribution timing differs from a single initial investment.

This is a current-universe, assumed-eligibility study. Broker access, research
verdicts and executable quotes were not reconstructed historically. Adjusted
prices can be revised; survivorship, asynchronous ETF/crypto closes and evaluation
period choice remain limitations. Taxes, cash interest, liquidity depth and final
liquidation costs are unmodeled. Monthly research results do not establish the
performance of weekly production decisions.

## Reproducibility and review

Machine-readable results: `2026-09-10-optimizer-study.json`.
Public price archive: `2026-09-10-optimizer-study.prices.json.gz`.
Decompressed input SHA-256:
`0e0626056cf3eaf694183b5497899531d120eb9bd48469ad9c83787deb29c858`.

Offline replay command:

```text
python -m jarvis.domains.finance.optimizer_study replay.json --replay-report docs/reviews/2026-09-10-optimizer-study.json
```

Replay preserves the original contribution dates, cost cases, horizon, tolerance,
retrieval date and exact public prices. Reproduction matched every stored decision
and metric. Independent implementation review found and prompted corrections to
crypto week alignment, numerical overflow handling and date-dependent replay.
The review also confirmed that the implemented risk screen is historical only;
forward stress testing is explicitly outside this version.

## What remains before investment authority can change

The optimizer is a testable research engine, not the best available portfolio
manager. Required next research includes prospective evidence, additional market
periods, calibrated assumptions, explicit macro/crash scenarios, issuer-level
fund overlap, taxes, liquidity and comparison with the actual production policy.
Any model revision must be evaluated on fresh holdout data; improving the same
historical score alone is insufficient. No retrospective price-only result can
automatically promote a model.

Final checks before rollout:

- Finance domain: 226 tests plus 11 subtests passed.
- Full API: 1,100 tests plus 3 subtests passed; final optimizer-specific checks
  also passed after the last integration edits.
- Isolated real-app security: 19 tests plus 24 subtests passed, including both
  new routes and rejection before database access.
- Frontend: 281 Node tests and 23 interaction tests passed; production build passed.
- Independent final review: no new actionable findings; 25 focused tests passed.
- Public-history replay: exact decisions, metrics, configuration and source date
  reproduced without network.

Deployment is pending at this source commit. Existing production policy and
access controls are unchanged by this release.
