# Reviewed image supplement release

Owner-authorized statement photos can now extend an existing receipt-verified
PDF without replacing its provenance. The private image and exact reviewed debit
payload are retained with SHA-256 hashes. Every running balance must reconcile.
Dates must extend the current source; future or ambiguous duplicate rows fail.
Transaction writes and supplement storage are atomic. An identical retry saves
zero rows; changed payloads for an imported image are rejected.

Budget authority combines the base PDF's effective categories with the reviewed
debits and updated balance. The source explicitly reports
`lhv_pdf_with_reviewed_image`, preserves `base_pdf_receipt`, and distinguishes PDF
parsed rows from image-reviewed rows. This is an owner-authorized transcription,
not automatic OCR verification or a bank-authenticated image. The initial route
supports spending debits only, never expected income or portfolio transactions.

Review identified partial-PDF supersession: a subsequent PDF covering fewer days
could otherwise hide newer reviewed spending. The corrected path blocks partial
or conflicting replacements until the overlap is reconciled. Fully covered,
consistent new statements supersede older supplements.

Recurring obligations now accept an effective_from date. Payments preceding that
date cannot discharge the new obligation. Historical payments are unchanged.

Validation completed so far:
- 407 finance/domain and relevant API tests plus 11 subtests passed.
- 19 isolated security tests plus 24 subtests passed.
- 22 focused image/recursion tests passed after repairing a deep-summary-copy
  regression; the full budget/import rerun passed all 295 tests.
- Final independent review found no remaining material blocker in the scoped change.

No frontend change, broker connection, trade execution, approval or portfolio
holdings update. Deployment and owner-data import verification are pending.
