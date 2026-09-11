# Independent fund fee evidence review

The live contribution decision was waiting because EQAC.MI broker availability
was unverified. A fully evidenced lower-cost Nasdaq candidate existed, but the
existing fee lower-bound rule required broker verification even for an excluded
rival. This release separates exchange fund facts from broker execution evidence.

The exact EQAC.MI / IE00BFZXGZ54 mapping was checked against the official exchange
product page and issuer factsheet. Both report a 0.30% annual charge. The current
exchange fetch produced a matching ETF identity, fee and source hash. Its USD
fund denomination is distinct from the EUR listing currency supplied by market
metadata. The adapter never changes broker availability or permits buying EQAC.

Sources:
- https://www.borsaitaliana.it/borsa/etf/scheda/IE00BFZXGZ54-ETFP.html?lang=en
- https://www.invesco.com/content/dam/invesco/emea/en/product-documents/etf/share-class/factsheet/IE00BFZXGZ54_factsheet_en.pdf

The independent fee can exclude a different share class only when the fee alone
is strictly above the fully evidenced leader's cost estimate, at the same target
shortfall. Unknown, stale, future, malformed or mismatched evidence cannot supply
that bound. A higher-priority unresolved candidate still blocks the lane. The
source/date/hash remain in the saved decision; alternatives include the exclusion
provenance. This extends evidence coverage, not the target/cost policy objective.

Review found that conflicting fees could fall back to broker evidence, or remain
eligible if all other fields were present. Both directions of fee disagreement,
with and without a spread, now remain unresolved before ranking. Regressions
failed before the correction and passed afterward.

Verification:
- 312 finance domain and relevant API tests, plus 11 subtests, passed.
- 19 isolated API security tests, plus 24 subtests, passed.
- Exact live public-source adapter smoke passed; broker status stayed unverified.
- Final independent review found no material blocker; 32 focused tests passed.
- Git whitespace check passed. No frontend source or asset change required.

Bitcoin's existing WATCH memo contains internal validation checks and explicitly
lacks external investment research. This release does not turn those checks into
BUY_CANDIDATE, alter risk limits, approve a brief, or place an order. Portfolio
manager research remains unvalidated; broader research and policy work continues.

Deployment and live decision verification are pending.
