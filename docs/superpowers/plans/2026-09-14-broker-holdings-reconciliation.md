# Broker holdings reconciliation

Goal: reconcile owner-supplied screenshot quantities and broker symbols without inventing transactions or substituting unrelated funds.

The existing authorized fund-identity work now has broker screenshot evidence. Extend the current correction endpoint with optional evidence hash and broker symbol; cross-check a bounded public registry and persist the evidence on each corrected position. Support positions in their original active or legacy section, never both. Keep screenshots and actual values private. This is data correction, not purchase or sale execution. Unknown recent cash movements require owner clarification.

- [ ] Tests: legacy position correction preserves its section; screenshot evidence must match the asset and approved broker symbol; missing evidence cannot promote identity; refresh retains metadata and correctly aggregates legacy positions.
- [ ] Add public identity registry, seven fund identities and BTC canonical identity, with issuer/broker source links. Distinguish broker-observed identity cross-check from unavailable exact issuer overlap.
- [ ] Replace SWRD/IEAG substitutions with LHVWORLDA/LHVEVF; use official dated LHV NAV feed with ISIN, symbol, finite-price and freshness checks. Use IEMM.AS for the observed IEMM EUR listing. Do not silently substitute another fund or currency listing when a quote fails.
- [ ] Test NAV identity mismatch, stale/future date, invalid/nonmatching NAV and correct EUR values. Test correction/API authorization and existing portfolio refresh paths.
- [ ] Deploy, privately reconcile the eight observed positions via correction endpoint with attachment hashes, refresh official prices and verify identities and totals. Never add screenshot differences as ledger transactions or count the screenshot as a bank cash statement.
- [ ] Report exact overlap separately: dated complete issuer holdings, including synthetic ETF economic exposure, are still required for exact percentages.
