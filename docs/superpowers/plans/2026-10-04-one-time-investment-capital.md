# One-time investment capital

User-authorized scope: recognize the confirmed emergency withdrawal separately from income. No trades, commits, deployment, or betting initialization.

Design: optional owner-approved transfer identities in the existing budget-memory JSON. Each approval applies to its transfer month only; a later month requires review, never an automatic recurring allowance. Resolve against exactly one matching row in the latest verified statement, classified Transfers and non-income. Missing or ambiguous active evidence fails closed. Never infer approval from generic transfer totals. Existing statement freshness, reserves, cash reconciliation, and purchase deductions remain authoritative.

Direction evidence: existing statement rows do not retain the bank sign for transfers. Require explicit `owner_confirmed_incoming: true` for the exact identity; this is an owner attestation, not a claim that the bank direction was preserved. Known outgoing direction is rejected. Future-dated approvals are rejected before month filtering. This workflow must never auto-approve transfers from category alone.

Arithmetic: preserve regular sustainable capacity. Add approved capital to the signed monthly surplus before clamping, then cap by actual cash after reserves. Report regular and one-time deployable portions separately, summing exactly to total. The allocation does not change income, emergency balance, or holdings. Reimports resolve by transaction identity rather than import ID, and duplicate approvals are rejected.

Implementation sequence:
- [ ] Domain evidence resolver and failing identity/deduplication/month-boundary tests.
- [ ] Calculation regression tests for capital, deficit, purchases, and cash cap; implement in integer cents.
- [ ] Extend existing budget-memory validation and authority route, test persistence/integration.
- [ ] Add breakdown to existing Finance Budget display with tests and a clear UI diff for review.
- [ ] Run relevant pytest, frontend tests, and production build. Do not deploy or commit pending review.

Files: new finance capital-release domain module/tests; cashflow_authority.py/tests; budget.py/API tests; BudgetContent.jsx and presentation helper/tests. No schema migration: optional JSON field defaults to an empty list.
