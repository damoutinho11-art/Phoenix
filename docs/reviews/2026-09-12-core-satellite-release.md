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
