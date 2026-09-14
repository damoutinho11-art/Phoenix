# Finance technical acceptance

Status: technical checks completed; complete portfolio research remains dependent on owned fund evidence.

The acceptance suite exercises the actual contribution selector across 180 combinations of cash budgets, existing BTC exposures, assumed entry fees and synthetic historical price trends. Three additional 52-cycle simulations use small contributions and skipped purchases. They verify cash conservation, no automatic reduction in existing holdings, post-cost purchase limits, minimum acquired crypto principal, input immutability, repeatability and eventual eligible BTC purchases from actual contribution credit. They do not establish that the selected instruments or allocation weights outperform alternatives.

Validation command:

`python -m pytest jarvis/domains/finance/tests jarvis/api/tests/test_investment_policy.py jarvis/api/tests/test_contribution_history.py jarvis/api/tests/test_finance_cash_reconciliation.py jarvis/core/tests/test_clock.py -q`

Result: 587 passed, 11 subtests passed. The 183 new acceptance cases all pass. No production behavior or owner policy was changed during this acceptance review.

The live service was checked on September 14: the recommendation uses the correct local date, data_ready is true, cash-authority blockers are empty and the manual checklist is READY_FOR_MANUAL_REVIEW.

## Remaining evidence dependency

The current stored fund mappings are assumptions, not verified broker-owned ISIN/share-class records. Complete overlap analysis requires a current broker holdings statement linking each owned fund to its ISIN/share class and units, followed by dated issuer constituent weights. A spending account statement or a public fund page cannot prove ownership identity. Do not publish exact overlap or a full-portfolio historical replay from these assumed mappings.

The prior historical contribution comparison and these synthetic acceptance scenarios answer different questions. Neither proves the current policy is globally optimal. No final investment-performance certification is claimed. No trades or holdings changes were performed.
