# One-time investment capital review

Status: implemented and verified locally; not committed, deployed, or enabled in the live profile.

2026-10-05 release preparation: owner approved the preview and publication. Isolated the change onto current production `002519452450b13c0e1486e10795776870593922`, preserving subsequent application work and excluding the uncommitted betting feature. Clean-release verification: 501 backend tests, 263 Node tests, 34 Vitest tests passed; production frontend build passed. Earlier counts below describe the original development checkout.

The cash authority previously capped all capital at the monthly income surplus, even after a confirmed emergency withdrawal. Optional owner-approved transfer identities now add one-time capital to the signed monthly surplus before clamping, with the final result still capped at available checking cash after reserves. Regular income is unchanged. Purchases and emergency shortfalls continue to reduce capacity.

Current-statement illustration after approving the confirmed incoming withdrawal:

| Item | EUR |
| --- | ---: |
| Approved incoming capital | 1,255.46 |
| Monthly deployable capacity | 1,185.16 |
| Additional usable one-time capital | 1,107.81 |
| Total deployable, limited by cash | 2,292.97 |
| Protected checking reserves | 619.69 |
| Separate emergency fund | 3,800.00 |

UI: two explanatory lines in the existing Budget cash-authority section, plus approval/reserve/month-review wording. Actual React component rendered in `2026-10-04-one-time-capital-preview.html`; surrounding shell is a review illustration. No Home changes, trades, or betting activation.

Changes:
- `jarvis/domains/finance/capital_releases.py`: approval validation and exact statement-identity matching.
- `jarvis/domains/finance/cashflow_authority.py`: cents-based combined capacity and separate reporting fields.
- `jarvis/api/routers/budget.py`: optional budget-memory approvals, save validation, and authority integration.
- Domain/API tests: evidence mismatches, duplicate approvals/reimports, future dates, expired months, deficits, purchases, reserves, invalid money, persistence.
- `pwa/src/components/holo/subs/CapitalAllocationBreakdown.jsx`, interaction test, `BudgetContent.jsx`, and frontend test script: existing Finance integration.
- `scripts/preview_capital.mjs`: repeatable actual-component preview.

Persistence: no database schema migration. Existing budget-memory JSON gains optional `one_time_capital_releases`, default empty. Each approval contains exact transaction date, merchant, description, amount, and `owner_confirmed_incoming: true`. Legacy statement data lost transfer direction, so direction is explicitly owner-attested; it is not described as bank-proven. Known outgoing direction is rejected. Approvals apply only to the transaction month; future dates are rejected, and unused amounts require a fresh review rather than renewing automatically. No current live profile write was made.

Verification:
- Relevant backend suites: 501 passed.
- Complete configured frontend suite: 281 Node tests + 41 Vitest tests passed.
- Frontend production build passed (existing large-chunk warning).
- `git diff --check` passed.
- Independent read-only review: no remaining blockers after fixing incoming attestation and future-month validation.

Release boundary: user requested UI review before any commit. After review, isolate only this change from the unrelated uncommitted betting feature, publish the backend/frontend, then save the already user-authorized transfer approval using the existing owner API credential and verify live capacity. Do not publish the old betting initialization or alter emergency balances, holdings, or statement rows.
