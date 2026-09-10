# Portfolio manager foundation

The user approved reviewing Phoenix and building toward the portfolio-wide,
evidence-supported selection design discussed in this conversation. This is the
first bounded implementation of that direction, driven by reproduced defects.

## Design

Keep the existing dashboard and manual execution. Add an instrument position
map per active asset/sleeve, keyed by exact market symbol, with units and last
EUR value. Aggregate EUR values into existing `holdings`; never add units of
different instruments. On first manual application, preserve an existing
legacy holding using its current canonical ticker mapping and record that
provenance. Refuse conversion of a nonzero legacy balance with unknown units.
No live balances are migrated by deployment, and no historical mixed units
are claimed to be reconciled. A single-position compatibility unit count is
allowed; a multi-position sleeve has no meaningful aggregate unit count.

Apply and void use the position's symbol. Pending purchases retain their exact
unrefreshed value for reversal; marked units reverse at their current recorded
unit value. Valuation
fetches each distinct symbol; an incomplete sleeve retains its previous total
and is reported failed. Zero positions need no quote. Manual aggregate unit
corrections are rejected for multiple positions because the instrument is
ambiguous; the correction API accepts an exact symbol. Holdings responses expose
the instrument breakdown. Explicit legacy identity correction requires both
units and a current EUR value. The existing buy-record form requires ETF symbols.

Use a shared pure projection to distinguish gross cash outlay, acquired
principal, costs, reserve and net portfolio value. Feed engine projections and
risk reporting from that projection. Validate new crypto purchases against the
existing explicit crypto caps using final net values; if fees would create a
breach, withhold that leg and retain its cash. Existing overweight positions
are disclosed and never automatically sold. Reserve target remains a target,
not an invented new hard limit.

Add a decision comparison record to the current recommendation: actual selected
plan versus holding this contribution in cash, before/after asset weights,
allocation distance, aggregate crypto concentration, estimated costs and
coverage limits. Do not label this a broad optimizer or a return prediction.

Reject missing/nonfinite/nonpositive FX or prices and invalid VIX observations.
Store dated selector inputs in the existing private brief archive for replay,
including effective mandate, holdings, evidence and policy implementation version.
Exclude unrelated profile/account data and preserve invalid evidence semantics.

## Validation and completion boundary

Synthetic two-fund apply/refresh/void round trips; partial quote failure;
unknown legacy units; single/multiple position unit corrections; net cash
conservation; cross-lane cost/cap boundaries; unchanged private API auth;
real-router recommendation/checklist and existing domain/API regression suites.
Independent code review precedes integration. Finish this foundation with an
explicit account of remaining optimization/evaluation work, never a claim
that tests prove investment superiority.
