# Portfolio Optimizer Implementation Plan

**Goal:** Build and evaluate a portfolio-level challenger without prematurely promoting its trades.
**Architecture:** Pure NumPy search and risk calculations; bounded public-history
adapter; authenticated research route; chronological offline study.
**Tech Stack:** Existing Python/FastAPI, NumPy, yfinance, pytest, React.

## Constraints

No automated trades. No new fixed BTC allocation ceiling. Keep production
contribution authority distinct from unvalidated research. Include all held
exposures, fees and cash; never invent missing data or investment performance.

## Tasks

- [x] Add synthetic regressions for whole-portfolio correlation effects, BTC
  allocations above 25%, cash conservation, unknown holdings, timestamps,
  historical-risk infeasibility, incomplete and tied comparisons.
- [x] Implement `portfolio_optimizer.py`: align weekly returns, enumerate plans,
  net-value accounting, drawdown screen, minimax regret and scenario sensitivity.
- [x] Implement `optimizer_evidence.py`: instrument reconciliation, eligibility,
  five-year EUR histories, bounded cache and exact input snapshot.
- [x] Add protected `/finance/optimizer` and existing-view research status;
  private archival and no changes to execution checklist authority.
- [x] Implement `optimizer_study.py`: dated fitting, next-price execution,
  consistent contributions/costs, unitized results and archived public inputs.
- [x] Run synthetic and real public-history evaluation; record limitations and
  promotion status without backdating broker/research evidence.
- [x] Obtain independent implementation review, fix findings, run relevant
  domain/API/security/frontend checks, deploy and verify owner access.

Completed as a research challenger. The conditional evaluation did not justify
promotion; the production contribution policy remains unchanged. Rollout and
validation evidence: `docs/reviews/2026-09-10-portfolio-optimizer-review.md`.
