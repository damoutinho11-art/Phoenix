# Core and speculative crypto allocation review

Phoenix now supports a privately stored owner allocation policy. The combined
crypto ceiling applies after dynamic targets, counts existing BTC/ETH/SOL/HYPE/TAO,
and permits new satellite allocations only to BTC/ETH/SOL. ETF targets redistribute
within existing sleeve caps. Bills and emergency cash remain excluded from the
investment budget, and no sell orders or trade approvals are generated.

Strategic investment reviews must bind to the current policy digest while retaining
source, risk, alternative, expiry and validation requirements. A policy change
invalidates the previous strategic review and manual decision signature. Policy
storage failures pause recommendations; saved policy requires contribution_v2.
Background research and generated allocation context use the same policy and
effective targets. The existing brief explains the ceiling and target separately
from any forecast of returns.

## Verification

- Full API suite before review refinements: 1,149 tests and 3 subtests passed.
- Final affected finance domain/API suite: 790 tests and 11 subtests passed.
- Final access-control suite: 28 tests and 24 subtests passed.
- Independent review verified all four findings were fixed: infeasible ETF targets,
  background/static research mismatch, PUT preflight and legacy approval reuse.
  Reviewer checks: 117 tests plus 420 age/regime/phase/ceiling scenarios passed.

## Limits

This is a constrained contribution policy, not a globally optimal portfolio or a
validated return forecast. Existing allocation preferences and phase eligibility
remain inputs. Experimental portfolio optimization has not been promoted. Owner
policy activation and updated strategic research require a separate authenticated
read-back after deployment. No private holdings or policy documents are committed.

## September 13 activation and accounting follow-up

Railway deployment a4d2c8bd-4ed5-4428-95c4-6c5621ee2a98 served
8ebd53a4e48312509498093cb683c717d2f1475c successfully. The owner-delegated
policy was saved and read back through authenticated endpoints. Private strategic
research memos 7/8/9 passed validation: BTC conditional BUY_CANDIDATE, ETH/SOL WATCH,
dated September 13 and expiring September 20. These are eligibility judgments,
not transaction approval or return forecasts.

The live check uncovered a pre-existing classification error: legacy China equity
in the discovery sleeve was counted as crypto. The follow-up excludes discovery
from crypto exposure and buy caps, while preserving its value in portfolio totals,
its own sleeve limit, and the prohibition on automatic sales. The crypto WAIT
summary now reports available contribution room and the configured minimum buy.
API summary dependencies expose the active policy too; universe expansion precedes
policy application so ETH/SOL minimum-buy metadata is preserved.

Final follow-up validation: 793 finance domain/API tests and 11 subtests passed;
28 access-control tests and 24 subtests passed. No trades or approvals were made.
