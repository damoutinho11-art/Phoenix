# Reviewed statement image supplements

Import the owner's reviewed new transaction rows without resending a prior PDF.
Preserve the receipt-verified base statement and attach an explicitly owner-reviewed
image supplement. Never relabel a screenshot as a parsed bank PDF.

An owner-only endpoint accepts a JPEG/PNG image and reviewed rows, base import ID,
opening/closing balances and end date. Require positive integer cents, permitted
categories, ordered dates strictly after the preceding snapshot, every running
balance reconciled, no future dates, and a matching current base import. Keep
the image bytes and SHA-256 with the exact reviewed payload. Atomic writes and
content-based idempotency prevent retries duplicating transactions. Sequential
supplements must continue the preceding closing balance; new PDF imports naturally
supersede supplements to older imports. This initial route supports debit spending
rows only; expected income must not be represented as received money.

Cash authority projects the verified PDF plus reviewed supplements, including new
spending categories and closing balance. Source metadata explicitly distinguishes
the base PDF receipt from image review. Corrupt or inconsistent supplements block
authority. Existing generic transaction views receive only genuinely new rows;
ambiguous duplicate transaction identities are rejected before writing.

Recurring obligations gain an optional effective_from date. Only payments on or
after that date can satisfy the obligation, so a previous gym payment cannot clear
a new membership. Preserve the historical transaction; do not recategorize or edit
its amount. Configure the new EUR49 gym effective 2026-09-11.

Tests cover reconciliation, corruption, stale anchors, repeat import, atomicity,
authority projection and gym effective dates; then independent review, deployment,
owner-authorized import and read-back verification. No trades or approvals.
