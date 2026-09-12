# Recover ETF reference spread evidence

XNAS.DE had valid broker identity, fee and price history, but Yahoo reported bid
59.51 above ask 58.73. Phoenix correctly rejected the crossed quote; its generic
missing-evidence message hid the cause.

The new adapter consults [Tradegate BSX's public order book](https://www.tradegatebsx.com/orderbuch.php?isin=IE00BMFKG444)
only when an ETF quote is invalid and its EUR broker share-class identity is
verified. It checks the identity table, dated quote fields, positive displayed
sizes and uncrossed prices. No inferred or fabricated spread is used. On September
12 the public source showed bid 58.74 and ask 58.79, dated September 11 at 22:00
Europe/Berlin, for ISIN IE00BMFKG444. The resulting reference spread was 0.085084659%.

This is a Tradegate reference market, not Xetra or an executable Lightyear quote.
Source, venue, date, prices, sizes, document hash and fallback reason accompany the
decision. Broker price confirmation remains necessary. The quote repairs a data
failure; it does not establish investment outperformance or validate target weights.

Verification: 276 finance-domain tests and 11 subtests passed; 28 security tests
and 24 subtests passed. Final 13 focused tests also cover a failed fallback keeping
the original identity and missing spread. Public fetch was reproduced locally.
Independent review identified stale primary dates skipping fallback and numeric
overflow hiding a crossed quote; both were fixed. The final quote, adapter and
contribution regression run passed 34 tests, including both edge cases.
