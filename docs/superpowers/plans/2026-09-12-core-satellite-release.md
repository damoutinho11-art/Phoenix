# Core and speculative satellite release

**Goal:** Support an explicitly chosen long-term crypto satellite alongside the ETF
core, retaining cash authority, research provenance and manual trade controls.

**Architecture:** Store an owner investment policy separately from market research.
Apply its combined crypto ceiling after dynamic allocation targets are calculated.
Strategic research can support contributions to that mandate without claiming
superior expected returns. Existing ETF ranking and cash accounting remain active.

**Tech stack:** Python/FastAPI, SQLite, existing React finance brief.

## Constraints

- No orders, approvals, automatic selling, leverage or emergency-money use.
- Activate a new risk ceiling only with owner authorization. On September 12 the
  owner delegated the choice to the assistant; the chosen policy is stored privately.
- No invented expected returns or claim of globally optimal allocation.
- Policy changes must invalidate decisions requiring the previous policy.
- Preserve existing mode when no policy has been saved.

## Tasks

- [x] Add a validated private investment-policy store and owner-protected routes.
  Persist version, combined crypto maximum and BTC/ETH/SOL permitted universe;
  keep research and preference records distinct. Test malformed, nonfinite and
  majority-crypto limits, round trips and missing policy behavior.
- [x] Apply policy after dynamic targets; preserve the existing target mix up to
  the owner ceiling, reassign excluded crypto target weight to eligible BTC, and
  scale ETF targets to conserve total weight. Count all existing crypto holdings
  against the combined ceiling. Test over-cap portfolios never cause a sale or buy.
- [x] Bind strategic crypto research to the saved policy; keep other research
  requirements and expiry. Add allocation-fit and risk disclosures to the existing
  brief. Test policy changes cannot reuse an old strategic BUY review.
- [ ] Review BTC/ETH/SOL under the stated long-term role; publish supported dated
  research after the ceiling is confirmed. Do not promote unvalidated optimizer.
- [ ] Run domain/API/security tests and independent review. Deploy, read back
  the policy and compare live recommendation amounts with the manual checklist.

The owner ceiling is a required activation input, not an implementation default.
The owner may delegate that choice; neither the saved policy nor its research
binding belongs in the public repository. Policy-active operation requires
contribution_v2 so legacy weekly approvals cannot be reused.
