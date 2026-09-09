# Contribution v2: portfolio need and verified cost

This replaces the proposed price-timing rule, not the strategic portfolio
targets. The price-only study did not support promoting evidence-buy-v1.

## Decision rule

Within each ETF/crypto lane, prioritize the largest remaining target shortfall
in euros, then the lowest verified comparison cost. ETF comparison cost is the
current annual fund fee plus estimated entry friction divided by the configured
investment horizon. Crypto compares estimated entry friction after the same
target-shortfall priority. The saved profile currently specifies 20 years.

Recent returns, drawdown and volatility remain visible risk context; negative
returns alone no longer veto a long-term contribution. This is a contribution
and cost rule, not a forecast of the highest-return asset.

All cash, phase, route, identity, freshness, research and risk-cap checks remain.
Crypto requires current validated BUY_CANDIDATE research. Missing horizon gives
ETF-specific WAIT; it does not crash or block an independently valid crypto buy.
Tied distinct instruments and conflicting same-share-class fees produce WAIT.

Missing evidence blocks comparisons where it could change the winner. A rival
with a smaller target shortfall cannot outrank the higher-priority shortfall.
For distinct ETFs with equally large shortfalls, a currently verified annual
fund fee is a lower bound on the cost model: if that fee alone already exceeds
the fully evidenced leader's estimated cost, even free execution cannot change
the choice. This exclusion is disclosed; unavailable spreads are never set to
zero. Unverified or conflicting fee evidence cannot use that exclusion.

## Validation

- Eight focused contribution tests cover falling markets, shortfall priority,
  cost choice, cost bounds, incomplete rivals, crypto research, caps, budget
  conservation, ties, missing horizon and conflicting share-class fees.
- 158 finance domain tests plus 10 subtests passed.
- 16 isolated security/authenticated API tests passed, including a real
  contribution-v2 recommendation/checklist projection during falling prices.
- Independent review verified the two reported edge-case fixes and found no
  remaining deployment-blocking code issue in its scoped review.
- Public market evidence with a synthetic portfolio selected VWCE.DE for the
  ETF lane; its verified cost beat comparable target-shortfall candidates.
  Crypto correctly waited because that fixture supplied no validated buy memo.
  This smoke is not a recommendation for the user's actual holdings.

## Scope and rollout

Mode: PHOENIX_FINANCE_SELECTION_MODE=contribution_v2. The v1 research rule is not
promoted. No claim that v2 outperforms a benchmark, guarantees returns or is
globally optimal has been established. Fund fees can change; reference spreads
are indicative and the final broker quote must be checked before a manual buy.

HYPE and TAO now have verified Kraken EUR history/reference quote mappings.
LHV public product evidence confirms HYPE. TAO broker availability remains
unconfirmed and cannot be assumed from the exchange data.

Deployment status: pending. Preserve owner authentication and persistent data;
no automatic trades or holding edits are part of rollout.
