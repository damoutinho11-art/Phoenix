# Brief decision identity and supersession

Problem observed 2026-09-17: one week accumulated four briefs (#33, #36, #37, #38),
most still PENDING with approve buttons, although only the budget change between
#33 and #36 was a real decision change. The decision signature hashed the whole
lane payload — fetch timestamps, live spreads, price metrics and projected
valuations — and public evidence is cached for 15 minutes, so every refresh of
the same choice produced a "new decision" and a new pending brief. Older briefs
were never retired.

Changes:

- `decision_signature` now hashes only decision-defining fields: week budget,
  policy version, as-of date, lane status and amount, the selected instrument's
  identity/cost/eligibility/research fields, the same for alternatives, the
  recurring-contribution binding and the investment policy. Quotes, spreads,
  timestamps, scores and projections no longer participate. A changed choice,
  amount, budget, policy, fee, eligibility or research verdict still requires a
  new brief and cannot inherit an approval.
- Saving a new decision brief marks other pending/deferred briefs of that week
  `superseded`; approving a brief does the same. Rejected briefs are untouched.
- The week lifecycle treats an approved brief as the week's decision even when a
  newer undecided brief exists, so closed-week views name the approved brief.
- Decision Log shows superseded briefs as REPLACED without action buttons and
  offers a REPLACED filter.

Verification: new `jarvis/api/tests/test_brief_decision_identity.py` (5 tests:
volatile fields keep the signature, eleven decision changes alter it, week-scoped
supersession, approval supersedes and wins the lifecycle). API + finance + core:
1754 passed, 14 subtests. Security suite: 28 passed, 24 subtests, after
registering the new supersede write in the evidence-recommendation fence. Frontend:
30 tests and production build passed. No production data was changed; existing
stale W38 briefs become REPLACED the next time a brief for that week is approved
or created, and can be rejected manually meanwhile.
