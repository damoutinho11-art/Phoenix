# Phoenix portfolio manager review

Reviewed starting commit `7cb0cc1168f777d88001b9931d15a18dff42c7b0` on 2026-09-09.
Scope: finance recommendation, evidence, accounting, risk and evaluation code;
synthetic regressions and existing tests. No private production data was read.

## Conclusion

Phoenix is a contribution assistant, not yet a broadly validated portfolio
manager. Its authenticated access, cash authority, explicit manual execution,
evidence freshness and deterministic decisions are useful foundations. Two
accounting defects must be corrected before widening its investment universe.

## Confirmed defects

1. **High: instrument identity is lost after manual application.**
   `finance._build_transaction_apply_preview` combines units by sleeve without
   preserving the transaction symbol. `market_data.update_portfolio_state_prices`
   values those units using the sleeve's fixed `TICKER_MAP` entry. Independent
   synthetic reproduction: ten SPYI shares acquired for EUR100 become EUR1500
   when refreshed using a mocked EUR150 VWCE quote. This also contaminates risk
   weights and subsequent recommendations. Multiple ETFs need separate positions.
2. **High: costs are counted as assets in projections.**
   `engine.allocate_weekly_budget` adds cash outlay rather than acquired principal
   to projected holdings. An independent EUR100 contribution example with EUR4.79
   costs reports EUR1100 rather than EUR1095.21. Cross-lane costs alter crypto
   percentages; reporting and constraint checking must use one net projection.
3. **High: missing FX can silently become parity.**
   `market_data._convert_to_eur` uses `fx.get(..., 1.0)` for USD/GBP. A failed FX
   request can therefore mark incorrect EUR valuations as refreshed.
4. **Medium: invalid numeric VIX can select risk-on.**
   `detect_market_regime` checks thresholds without rejecting NaN/nonpositive
   values. Missing numerical evidence must remain unknown.

## Capability gaps

- Candidate discovery is a configured list (18 ETF listings, five crypto assets),
  bounded to 40 fetches. Several listings do not satisfy the EUR-only policy.
  Listings are not the same as distinct funds, and this is not a market-wide scan.
- Contribution v2 chooses target shortfall and verified costs, not expected utility
  across complete alternative portfolios. Recent returns are context only.
- No measured holdings-level ETF overlap, issuer/sector/country exposure,
  portfolio covariance, robust scenario comparison, tax-aware selection or
  benchmark-relative tracking-error objective is used by the active selector.
- Constitution has overlapping numeric limits and prose rules. For example,
  generic single-crypto maximum is 15%, while the BTC-specific maximum is 25%.
  Drawdown prose suspensions are not executable constraints; regime classification
  currently uses VIX only, not all the conditions described in the constitution.
- Later-phase stock/emerging-market sleeve targets have no corresponding active
  instrument allocation path; normalization redistributes their weight silently.
- The archived replay calls v1; the price-only study does not establish v2 returns.
  There is no demonstrated out-of-sample superiority or live manager track record.

## Build sequence

1. Instrument accounting, net-of-cost projection, quote validity, and regression
   tests. Preserve manual transactions and aggregate values for existing views.
2. Decision comparison record: selected action and all-cash alternative, projected
   weights and costs, evaluated-universe coverage and unmeasured capabilities.
   This is accounting evidence, not a score implying investment skill.
3. One versioned executable mandate resolving the existing contradictory limits;
   point-in-time fund/crypto master and real holdings/exposure sources. Do not
   resolve the 15%/25% conflict by silently changing the user's risk policy.
4. Portfolio-level challengers comparing candidate combinations, target tracking,
   diversification, liquidity, downside scenarios and cost sensitivity. Missing
   exposures must remain missing; do not infer ETF overlap from ticker labels.
5. Chronological evaluation against contribution-v2, fixed diversified allocation
   and cash under identical contributions, eligible universes and realistic costs.
   Separate development, validation and held-out periods; retain dated inputs.
   Promote only after correctness and evidence gates, then track live outcomes.

Adding more score parameters or an unvalidated expected-return optimizer now
would amplify uncertain inputs. Building accounting and evaluation first is the
chosen approach. A static low-cost allocation remains the comparison baseline.

## Research supporting the design

- [SEC asset allocation guidance](https://www.investor.gov/introduction-investing/getting-started/asset-allocation):
  holdings in an ETF do not automatically provide sufficient diversification.
- [CFA Institute portfolio structuring research](https://rpc.cfainstitute.org/research/foundation/2016/portfolio-structuring-and-the-value-of-forecasting):
  adding many forecasting inputs can fit history while performing poorly out of sample.
- [CFA Institute performance evaluation](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/portfolio-performance-evaluation):
  appraisal needs to distinguish investment skill from luck and data limitations.

These references inform the architecture; they do not validate Phoenix performance.

## Foundation implementation and validation

Implemented separate instrument units and valuations, identity-preserving
apply/refresh/void, individual-symbol corrections, explicit partial-valuation
blocking, valid FX/VIX checks, net-of-fee projections and cap checks across both
lanes. Existing holdings views retain sleeve totals and expose instrument
breakdowns. Mixed-fund units and average unit prices are no longer aggregated.
The existing buy-record form now accepts the exact purchased ticker.

Recommendations now include accounting comparisons against cash and individual
eligible candidates, showing net value, allocation distance, costs and current
limit breaches. This does not rank portfolio combinations or predict returns.
Private saved briefs retain dated selector inputs; contribution-v2 can be
replayed. Raw histories are not added to every recommendation response.

Final validation: 205 finance-domain tests plus 11 subtests; 18 isolated security
tests plus 24 subtests; 79 related API integration tests; 281 frontend Node tests
and 21 interaction tests; production frontend build. The full API suite also
passed 1096 tests plus 3 subtests before the final targeted integration fixes.
Independent review found and verified additional reversal, correction, net-risk
projection and archive-semantics defects, each covered by a regression.

Security tests must run in a separate process from domain acceptance tests:
those tests import the app with a different CORS environment before the security
fixture sets its test origin. A combined exploratory run reproduced this
fixture-order failure; isolated real-app authentication/CORS tests pass.

Foundation deployment verified live on 2026-09-10:
- Source commit `6d834de18ac1c551c8508835706464261e829f35` pushed to main.
- Railway `1bb432a0-62f0-4c90-9f6f-bf6bf5f323b9`: SUCCESS, exact commit confirmed.
- Vercel `dpl_J2VxEfqF3VjKVLANbooNAXgd91Td`: READY, user alias
  `https://phoenix-phoenix123.vercel.app/` confirmed on this deployment.
- Protected static-bundle verification confirmed both the Railway API origin
  and the new instrument symbol field. Deployment protection preserved.
- Access checks: missing key 401, invalid key 401, public health 200, owner key 200.
- Vercel CLI 59.15.1 returned a scope-access error; the previously working 59.14.0
  deployed successfully with the same account/project. No access controls changed.
No production balances have been migrated or reconciled by this code review.

## User's allocation direction

The user clarified that Bitcoin's weight should be determined by portfolio-wide
optimization rather than selecting a fixed 15% or 25% limit. This supersedes
choosing between the contradictory legacy caps for the future optimizer design.
The foundation release does not silently remove constraints from the old
contribution rule and pretend that doing so constitutes optimization. The next
stage must use the saved horizon and risk tolerance, compare complete portfolios,
and test the resulting allocation policy before promotion.
