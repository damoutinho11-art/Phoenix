# Dated crypto research and decision provenance

The old synthesis always returned WATCH after clean checks, and described fetched
external prices as local-only evidence. The new contract distinguishes market-fact
checks from a dated investment judgment. It retains a matching, bound review,
expires it within seven days, preserves subsequent rejection, and carries the
review and binding checks into decision archives. Hashes bind recorded assertions;
they do not certify source truth, analyst independence or future returns.

## Current bounded comparison

The public snapshot in `2026-09-11-crypto-market-evidence.json` contains adjusted EUR
daily closes fetched through yfinance and the exact computed metrics. Calculations
use 181 observations ending September 10, excluding the current unfinished day.

| Asset | 90-day return | 180-day return | Annualized volatility | Sample maximum drawdown |
| --- | ---: | ---: | ---: | ---: |
| BTC | 20.11% | 6.15% | 36.25% | -26.49% |
| ETH | 45.89% | 14.74% | 52.85% | -33.80% |
| SOL | 47.37% | 10.63% | 52.52% | -35.50% |

These are historical sample statistics, not predicted returns or worst-case losses.
BTC leads this limited comparison on observed risk; ETH and SOL had stronger recent
returns. Neither ranking establishes which addition best improves the whole portfolio.

[Bitcoin's documentation](https://bitcoin.org/en/faq) describes scheduled scarcity
and demand-dependent value. Scarcity is not evidence of underpricing.
[Ethereum](https://ethereum.org/en/staking/) and [Solana](https://solana.com/staking)
describe staking mechanisms and risks. No staking income is assumed for LHV spot
holdings. [LHV](https://www.lhv.ee/en/crypto/) lists the assets, charges 0.5% on buys
and sells, and currently restricts acquired assets from payments or transfers.
Snapshot spreads are reference-market observations, not executable LHV quotes.

The three published review payloads remain WATCH. Reconsideration requires an
evaluated marginal allocation case against cash and broad ETFs across plausible
assumptions, after costs and portfolio interactions. This work does not promote
the experimental optimizer, change the existing mandate, or establish optimality.
HYPE and TAO are outside this bounded review, not rejected on investment merit.

## Verification

- Research routes and synthesis: 169 tests passed before final review refinements.
- Finance domain and review contract: 278 tests and 11 subtests passed.
- Authenticated recommendation and access controls: 19 tests and 24 subtests passed.
- Independent review identified rejection revival and missing archived review
  binding; both were corrected and regression checked.
- Production publication and deployment verification are recorded after release.
