# Finance Review Other Design

## Goal

Finish the Finance transaction-classification workflow without weakening the
verified-statement authority boundary. A user must be able to review transactions
currently classified as `Other`, correct their categories after import, and teach
Phoenix how to classify the same merchant on future statements.

The feature lives inside **Finance -> Control Room -> Budget** and uses the cyan
and blue Finance visual system everywhere. Budget ledger, Cash Policy, statement
review, and Review Other must no longer introduce orange or gold chrome.

## Product Decisions

- `Other` remains a valid category and unresolved rows may be skipped.
- The Review Other queue groups rows by normalized merchant so repeated purchases
  can be corrected together.
- Bank facts remain locked: date, merchant, description, amount, income direction,
  statement identity, and import ordinal are never edited.
- Category is the only field corrected in this workflow.
- `Remember merchant` is optional and enabled by default.
- Remembering a merchant affects future parses; it never silently rewrites older
  statement evidence.
- The user can forget a learned rule later.
- Corrections may change category-based reserves and analysis, but never statement
  balances or total income/spending. Cash authority is recalculated from the same
  verified statement plus the audited category overlay.

## Placement And Interaction

### Budget Ledger

When the active month contains effective `Other` transactions, the ledger shows a
cyan **Review Other** command beside the Other category and in the Phoenix
assessment area. The command includes the unresolved transaction count and value.

### Review Other Subsection

Review Other is a full Budget subsection, parallel to Cash Policy and statement
review rather than a modal or nested card. Its compact header contains:

- unresolved amount;
- unresolved transaction count;
- reviewed merchant-group progress;
- a return-to-ledger command.

The body is a dense merchant queue. Each merchant group shows:

- merchant name and number of matching rows;
- combined value;
- locked date, description, and amount details for every row;
- one category selector;
- a `Remember merchant` toggle, enabled by default;
- `Apply correction` and `Skip` commands.

Applying a merchant-group correction updates every unresolved row for that merchant
in the current verified statement. Skipping leaves the rows as `Other`. The queue
updates immediately after a successful response and the ledger refreshes from the
server rather than optimistic arithmetic.

The subsection also exposes a compact **Learned merchants** list. Each entry shows
the normalized merchant and learned category with a `Forget` command. Forgetting a
rule affects future imports only; existing corrections remain in the audit trail.

## Visual System

All Finance controls, active states, borders, focus rings, dividers, clipped
corners, and instrument glow use the established Finance cyan/blue tokens. Remove
`phx-scope-budget` and any Budget-specific orange/gold action treatment from the
ledger, Cash Policy, statement upload/review, and Review Other roots.

Category labels are neutral until selected; selection uses cyan. Green, yellow,
and red remain reserved for verified, warning, and blocked states. The layout must
remain readable without horizontal overflow at 390 x 844 and preserve the existing
dense projected-instrument style at 1440 x 900.

## Persistence And Audit Model

Add two additive SQLite tables.

### `budget_category_corrections`

One row per corrected authoritative statement row:

- `id`;
- `statement_import_id`;
- `ordinal`;
- immutable transaction identity hash;
- original category;
- corrected category;
- normalized merchant;
- correction group ID;
- created and updated timestamps.

The unique key is `(statement_import_id, ordinal)`. Corrections update the overlay
row, never `budget_statement_import_transactions`. The original category is stored
once and cannot be replaced by later edits.

### `budget_learned_merchant_rules`

One active rule per normalized merchant:

- `id`;
- normalized merchant;
- category;
- source correction group ID;
- active flag;
- created and updated timestamps.

For future parsing, explicit Cash Policy merchant rules have highest precedence,
learned merchant rules come next, and built-in deterministic classification comes
last. Forgetting a rule marks it inactive and preserves history.

Schema migration is additive and idempotent. Existing statements require no data
rewrite and have no corrections or learned rules until the user acts.

## Effective Transaction Projection

The database exposes one shared projection helper that overlays corrected category
values on immutable authoritative rows. Budget authority, verified-statement
summary, transaction review, recommendation, brief, and manual checklist consume
that projection. This prevents different surfaces from calculating with different
categories.

The legacy ledger summary applies the same correction by immutable transaction
identity so the visible category totals update immediately. Receipt-free text rows
remain ledger-only and cannot receive authoritative corrections or influence cash
authority.

Every effective-authority input hash includes the correction revision. A successful
correction therefore invalidates stale recommendation/checklist evidence and forces
normal recomputation.

## API Contract

### `GET /budget/category-review?month=YYYY-MM`

Returns:

- active verified `statement_import_id`;
- correction revision;
- unresolved count and amount;
- merchant groups with locked rows and effective categories;
- active learned merchant rules.

If no verified statement exists, return a fail-closed ready response with no groups
and a clear blocker. Do not fall back to ledger-only rows.

### `POST /budget/category-corrections`

Accepts:

- active `statement_import_id`;
- expected correction revision;
- merchant group key;
- exact authoritative ordinals;
- corrected known category;
- `remember_merchant` boolean.

The server verifies that the statement is still the latest verified source, every
ordinal belongs to it, every selected row is in the merchant group, and no bank fact
was supplied or changed. The correction rows and optional learned rule are written
atomically. The response includes refreshed review metrics, summary, and authority.

Reject stale revisions or a replaced statement with HTTP 409. Reject malformed
categories, ordinals, groups, or attempts to alter bank facts with HTTP 422.

### `DELETE /budget/learned-merchants/{rule_id}`

Deactivates one learned rule and returns the refreshed learned-rule list. It does
not remove historical corrections.

## Error Handling

- All category saves are fail-closed and transactional.
- A network or server error retains the staged selection and offers retry.
- A 409 refreshes the queue and explains that the source statement changed.
- An invalid or missing verified statement disables correction commands.
- An empty queue returns to a completed state rather than rendering blank controls.
- No endpoint accepts amount, date, description, income direction, month, receipt,
  or balance edits.

## Safety And Financial Semantics

- Total statement income and spending cannot change through category correction.
- Correcting to or from `Food & Groceries` may legitimately change the remaining
  food reserve and deployable cash.
- Recurring-bill paid detection continues to match immutable merchant and
  description evidence, not corrected category.
- Emergency-fund, income, investment, and transfer categories remain available but
  do not change immutable direction. A debit cannot become income.
- Phoenix never executes a broker action, order, trade, transfer, or portfolio
  mutation.
- All recommendation and checklist output continues to require manual approval.

## Testing And Verification

Backend tests must prove:

- migrations are idempotent;
- immutable statement rows do not change after corrections;
- merchant groups and unresolved totals are exact;
- repeated merchant rows correct atomically;
- stale revisions and replaced statements fail with 409;
- invalid categories and ordinals fail with 422;
- learned-rule precedence and forgetting work;
- text-only rows cannot enter the review queue or authority;
- category corrections refresh summary, authority input hash, recommendation, and
  checklist consistently;
- totals remain unchanged while category-based reserves may change;
- duplicate authoritative rows remain distinct by ordinal.

Frontend tests must prove:

- Review Other appears only when unresolved rows exist;
- locked bank facts have no editable controls;
- staged selections survive retryable failures;
- successful correction refreshes the server-backed queue and ledger;
- learned rules can be forgotten;
- every Finance Budget root uses cyan/blue and no `phx-scope-budget` remains;
- desktop and 390 px layouts do not overflow;
- focus, keyboard use, loading, empty, stale, and error states are reachable.

Final verification includes the full Finance backend suite, complete PWA tests,
production build, isolated smoke gate, desktop/mobile browser QA with temporary
data, whole-branch review, Railway deployment, Vercel deployment, and live read-only
reconciliation against the production API.

## Out Of Scope

- Editing immutable bank facts, income direction, or transaction amounts;
- deleting bank transactions;
- free-form AI category writes without user confirmation;
- automatic trades or transfers;
- retroactively applying a newly learned rule to earlier verified statements;
- changing the existing cash-policy amounts or investment strategy.
