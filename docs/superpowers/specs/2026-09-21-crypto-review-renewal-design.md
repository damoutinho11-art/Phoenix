# Scheduled crypto review renewal

Date: 2026-09-21 · Status: implemented alongside this spec

## Problem

A crypto contribution requires a dated investment review valid for at most
seven days. The 13 September BTC review expired on the 20th and the W39
crypto lane went to WAIT. Renewal was a manual research task; nothing in
PHOENIX renewed it. The owner wants PHOENIX to renew it weekly.

## Principle

A renewal is not a new judgment. PHOENIX may re-issue a human-authored
review only after re-verifying that its premises still hold today. It must
never invent a thesis, soften a verdict, or extend a review whose premises
have moved. When a premise fails, the lane waits and the reason is visible.

## Premise checks (all must pass)

1. The prior review validated under the existing contract as of its own
   `valid_until` date, and its verdict is BUY_CANDIDATE or WATCH.
2. The active owner investment policy digest equals the review's
   `investment_policy_sha256`.
3. Every source URL is fetched again today over HTTPS; the response bytes
   are hashed and the source's `checked_at` becomes today. A source that
   cannot be fetched fails the renewal.
4. The broker-cost source still states the fee the review relied on
   (the text contains "0.5"). If the page changed, a human must re-read it.
5. Market risk is recomputed from the same public history used elsewhere
   (`measure_history`): renewal is refused when the 90-day return is
   below −35 % or the sample maximum drawdown is below −45 %. Those are the
   review's own "reassess if facts deteriorate" condition made concrete.
6. Chain age: `origin_reviewed_at` (the human review's date) is at most
   56 days before today. After that a fresh assistant review is required.

## Artefact

The renewed review is a copy of the prior one with `reviewed_at` = today,
`valid_until` = today + 7, refreshed sources, `reviewer` = "PHOENIX
scheduled renewal", `reviewer_type` = `phoenix_renewal`,
`renews_review_sha256` = digest of the prior review, and
`origin_reviewed_at` carried forward. It is stored as a new active,
VALIDATED memo bound by the same two check records
(`SOURCE_CONFIDENCE/external_source_review`,
`MANUAL_REVIEW/investment_thesis_review`) whose `raw_json` records
`generated_by: phoenix_renewal` and the premise results, so provenance is
never mistaken for a fresh human review.

## Contract changes

`validated_investment_review` accepts `reviewer_type` `phoenix_renewal`
only when `renews_review_sha256` is a 64-hex digest and
`origin_reviewed_at` is within 56 days of `reviewed_at`.

## Schedule

The existing daily research autopilot loop calls the renewal for BTC, ETH
and SOL after its own pass; a review is renewed when it expires within two
days or has already expired. `POST /finance/research/renew-reviews` runs
the same step on demand. Both report what was renewed, skipped, and why.

## Out of scope

Automatic first-time reviews, verdict changes, policy changes, trades.
