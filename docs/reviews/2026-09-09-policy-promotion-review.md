# Decision: do not promote evidence-buy-v1

The price-only study does not support replacing the current production buy
policy with evidence-buy-v1. Keep the provider and safety improvements, but
revise the purchase rule before rollout. Do not tune the existing weights to
maximize the result on these same 32 windows.

## Observed results

January 2024 through August 2026, 32 monthly cutoffs, next available daily close
entry and approximately 30-day holding periods. These are arithmetic means of
individual windows, not annual returns or a compounded portfolio backtest.

| Lane | Assumed round-trip cost | Rule mean | Equal-weight mean | WAIT windows |
|---|---:|---:|---:|---:|
| ETF | 0.1% | 0.3591% | 1.3244% | 18 / 32 |
| ETF | 0.5% | 0.1830% | 0.9199% | 18 / 32 |
| Crypto | 1.0% | -0.9421% | 2.0145% | 22 / 32 |
| Crypto | 2.0% | -1.0658% | 0.9994% | 23 / 32 |

The ETF study uses six current EUR listings; the crypto study uses BTC, ETH and
SOL. The benchmark invests equal amounts across the lane's entire study
universe. The rule can filter candidates or remain in cash, so this comparison
tests the combined filtering, timing and ranking behavior, not ranking alone.

It assumes equal portfolio target gaps and symmetric proportional costs.
Current universe selection and revised adjusted histories introduce biases;
historical broker availability, historical research, taxes and real portfolio
sizing are not modeled. Overlapping windows are not independent. No claim of
statistical significance or universally superior future performance follows.

## Audit trail

- `2026-09-09-price-policy-study.json` contains all window outcomes and summaries.
- The sibling `.prices.json.gz` preserves the public EUR history inputs. Its
  uncompressed SHA-256 is recorded in the report.
- `python -m jarvis.domains.finance.price_policy_study <output.json>` reproduces
  the study using newly fetched data; exact archived reproduction calls `study`
  with the saved histories and cutoffs/costs recorded by the report.
- Tests verify future prices change outcomes without changing earlier choices,
  correct two-sided cost arithmetic, and omission of incomplete comparisons.
- Independent review reproduced all four summaries and found no blocking
  calculation or lookahead issue. This remains a conditional price study, not
  a historical replay of actual Phoenix approvals.

## Data coverage improvements completed

Kraken's public spot endpoints now supply canonical HYPE/EUR and TAO/EUR daily
histories and indicative spreads. The current unfinished candle is excluded.
Pair metadata verifies both the asset and EUR currency; quotes remain explicitly
reference-market quotes, not LHV execution quotes.

The LHV parser now recognizes name and ticker inside an official product card.
Its current public page verifies HYPE; TAO broker availability remains
unconfirmed. A user clarification is pending. Market history alone does not
override this broker requirement.

Primary source contracts:
[Kraken OHLC](https://docs.kraken.com/api-reference/market-data/get-ohlc-data),
[Kraken pairs](https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs),
[LHV crypto](https://www.lhv.ee/en/crypto/).

## Required next design change

The saved profile has a long investment horizon. Separate the long-term
contribution decision from an attempted short-term price forecast. Evaluate a
portfolio-fit-first purchase rule using actual target deficits and verified
product costs, with price trends explanatory rather than an automatic cash
veto. Crypto still needs a current validated BUY_CANDIDATE verdict and all caps.

This replacement rule is not implemented or approved for production by this
study. The study shows why v1 should remain unpromoted; it does not by itself
prove a replacement optimal. Production remains unchanged.
