# Independent fund cost evidence

Phoenix's contribution rule can exclude an incomplete rival when its verified
annual fee alone exceeds a fully evidenced candidate's total comparison cost.
Today the fee is coupled to broker verification, so missing broker catalogue
coverage prevents using independent exchange evidence. Resolve that dependency;
do not remove availability checks for a selected instrument.

Fetch the official Borsa Italiana product page for the reviewed EQAC.MI mapping
(ISIN IE00BFZXGZ54). Require exact ticker, ISIN, ETF type and one finite annual
fee. Record retrieval date, URL and document hash. Retain the row's independently
verified EUR listing currency; the fund's USD denomination is not its trading
currency. This evidence supplies a cost floor only, never broker availability,
execution fees, spreads or permission to buy.

Use the existing one-day freshness requirement. Reject mismatches, conflicts,
invalid fields, future dates and absent sources. An equal or lower fee remains
unresolved. Same-share-class alternatives cannot be dismissed using this bound.
Archive the evidence in the existing decision snapshot and expose the exclusion
in the existing alternatives explanation. No new UI panel or allocation model.

Alternatives considered: leaving the known gap unresolved delays a comparison;
assuming broker availability misstates evidence. Independent exchange evidence
retains uncertainty wherever it can change the policy winner.

Verification: failing parser and selection regressions first, exact public-page
smoke, finance/API/security suites, independent review, deployment and owner-only
live decision check. No holdings edits, order placement or crypto verdict changes.

Sources checked 2026-09-11:
- https://www.borsaitaliana.it/borsa/etf/scheda/IE00BFZXGZ54-ETFP.html?lang=en
- https://www.invesco.com/content/dam/invesco/emea/en/product-documents/etf/share-class/factsheet/IE00BFZXGZ54_factsheet_en.pdf

Both identify the exact share class and 0.30% annual charge. The issuer factsheet
is dated 2026-07-31; runtime evidence comes from the current exchange product page.
