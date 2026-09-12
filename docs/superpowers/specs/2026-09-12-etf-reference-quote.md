# ETF quote recovery

Root cause: XNAS.DE Yahoo metadata returned bid 59.51 above ask 58.73.
The existing spread validator correctly rejects it. Broker identity, fee and
history were present. Add a bounded public Tradegate BSX reference quote fallback
only when ETF spread/date is invalid, bound to the broker-verified ISIN and EUR
identity. Require dated, positive, uncrossed bid/ask and positive displayed sizes.
Preserve the quote timestamp, venue, original-provider rejection and source hash.
Do not call it an executable Lightyear or Xetra quote. Missing or malformed
fallback stays WAIT with a specific reason. No fabricated spread or weakened gate.

Tests cover identity, dates, crossed/missing quotes, malformed values, selection
integration and cost accounting. Then independent review, deployment and live
read-only recommendation verification. This repairs evidence availability; it
does not prove the configured allocation mandate optimal or place a trade.
