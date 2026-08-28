# Nutrition Recomposition Operations

## Active prescription

Phoenix operates a 14-complete-day calibration at 2,600 kcal, 175 g protein, 315 g carbohydrate, and 70 g fat. The daily plan contains four exact-gram meals, targets 30-35 g fibre and 2.3-2.7 L fluid, and always requires approval before a meal is logged.

## Daily evidence

- Record body weight after waking, using the bathroom, and before food or drink, under comparable clothing conditions.
- Measure waist once per week, at the same anatomical point and under the same morning conditions.
- Mark a day complete only when all food intake is logged accurately enough to support a calorie decision.
- Record hunger and training performance truthfully; neither is inferred from missing data.

## Meal timing

Normal days use four meals around 08:00, 12:00, 15:00, and 20:00-00:00, with the last meal positioned around an 18:00-19:00 training session. On rehearsal days, move the noon meal before rehearsal when practical, keep a portable meal available during the 11:00-14:00/15:00 block, and place the main meal after rehearsal. Timing may move; the daily targets do not.

## Measurement rules

- Pasta: weigh dry.
- Meat: weigh raw unless the selected food is explicitly labelled as cooked.
- Frozen vegetables: weigh frozen.
- Packaged foods: use the product label and the served amount.
- Wraps: record both units and label grams.
- Never silently convert raw and cooked weights or replace a missing label with invented nutrition data.

## Approval and logging

Phoenix may replace a proposal, adjust its portion, or skip a proposed meal without writing a food log. Only **Eat & Log** writes, and it writes the selected meal only. Logged meals are immutable facts for protocol generation; corrections use the explicit log correction/delete workflow rather than replanning history.

## Two-week review

Phoenix must collect 14 complete days before proposing a calorie change. The review combines rolling morning weight, weekly waist, hunger, and training performance. A proposal is limited to the constitution's 100-150 kcal guardrail, explains its evidence, and requires explicit approval. Missing or incomplete evidence keeps the current prescription unchanged.

## Supplements

Creatine remains 5 g daily. Caffeine intake must be reviewed in the context of total coffee and concert timing. Omega-3 and vitamin D remain label-unverified until the exact product label and serving are recorded; Phoenix must not infer EPA/DHA or vitamin D dose from “one pill.” NAC is recorded only from the verified label.

MOTS-C, ipamorelin, and BPC-157 are hard-blocked from Phoenix planning. Phoenix does not provide or operationalize human-use dosing for research-only peptides. Any reconsideration requires review with a qualified clinician and identifiable product information.

## Verification

Run the local acceptance gate before deployment:

```powershell
python -m pytest jarvis/domains/nutrition/tests jarvis/api/tests/test_nutrition_routes.py jarvis/api/tests/test_nutrition_recomposition_routes.py jarvis/api/tests/test_calendar_routes.py -q
cd pwa
npm test
npm run build
```

Confirm `/nutrition/acceptance-gate` returns `PASS`, no blockers, and passing checks for `recomposition_authority`, `exact_measurement_contract`, `immutable_logged_meals`, `fourteen_day_adjustment_gate`, and `research_peptide_block`.

## Rollback

The pre-recomposition Nutrition baseline is commit `ed0da4ec`. If a production regression cannot be corrected promptly, create a dedicated rollback commit that restores only the Nutrition files changed after that commit. Do not reset the repository or overwrite unrelated user data. Re-run the full verification gate before deployment.
