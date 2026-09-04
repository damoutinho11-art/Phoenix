# Monday Readiness Design

## Objective

Phoenix must be operational for Monday, 7 September 2026: an active calendar-aware training plan must provide the day's routed session, and Nutrition must provide four exact-gram meals around an 18:00-19:00 workout. Phoenix adapts future sessions around verified calendar events and readiness, while the user confirms workout completion and meal logging.

## Training

- Restore planner acceptance by regenerating evidence from the deployed training source.
- Generate and activate a six-day performance-hybrid sequence beginning Monday: push strength, pull strength, lower power, push volume, pull volume, jump/elastic.
- Respect the Plaan feed, hard performance conflicts, minimum neural recovery spacing, and missed-day adaptation.
- Require a readiness scan before routing a high-neural session; pain, limping, or next-day worsening must reduce or block loading.

## Nutrition

- Keep the approved 2,000 kcal recomposition target and four daily meals.
- Reconcile the macro target to approximately 2,000 kcal instead of exposing a 160 kcal contradiction.
- Produce exact gram weights from the trusted food inventory, including the user's preferred cereal, wraps/pasta, meat, frozen vegetables, bananas, and whey where available.
- On Monday, time meals near 08:00, 12:00, 15:30-16:30, and after training. Calendar events may move timing but not silently change daily targets.
- Meal proposals remain approval-first; only Eat & Log records intake.

## Failure Behavior

- No accepted planner evidence means no plan activation.
- No active training plan means Nutrition must not pretend it knows Monday's training demand.
- Food quantities that cannot reconcile within defined calorie and macro tolerances must fail visibly rather than return 404 or fabricated values.

## Verification

- Backend training and nutrition suites pass.
- Live endpoints expose accepted training authority, an active Monday session, a four-meal exact-gram protocol, reconciled energy/macros, and current Plaan evidence.
- Production PWA is checked at mobile and desktop widths with no overlap or inaccessible controls.
