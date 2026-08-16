# Task 6 Report: Finance Brief Authority Provenance

Status: complete

## Delivered

- Added a fail-closed cash-authority formatter for the existing Finance brief.
- Verified authority shows protected cash, deployable capacity, and remaining weekly windows.
- Blocked or malformed authority shows blockers without fabricated monetary values.
- Both the AI brief and deterministic recommendation fallback include the authority block.
- Preserved the existing cyan Finance terminal design without adding a panel or tab.

## Verification

- Focused frontend tests: 27 passed.
- Full PWA tests: 153 passed.
- Production PWA build: passed.
- Commit: `c1b43e1a feat(finance-ui): explain cash authority provenance`.

