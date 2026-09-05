# Nutrition reference estimates — 5 September 2026

The user selected 1,900–2,000 kcal/day and explicitly allowed clearly marked reference estimates for foods without package labels. The planning target is 2,000 kcal, 175 g protein, 190 g carbohydrate, and 60 g fat on both training and rest days.

The repository's staple values do not have package-label evidence. They must be shown as inventory estimates, not product labels. Reference overlays supplement the exact-gram protocol without rewriting historical meal logs or the original staple catalog.

## Sources checked

- [USDA Standard Reference Legacy dietary fibre table](https://www.nal.usda.gov/sites/default/files/page-files/Total_Dietary_Fiber.pdf): per 100 g, whole-wheat dry pasta 9.2 g, whole-wheat tortillas 9.8 g, raw banana 2.6 g, raw broccoli 2.6 g. These are generic food matches, not evidence for the user's package. The loader scales them to each existing inventory reference weight.
- [Nestlé Estonia Cookie Crisp](https://www.nestle-cereals.com/ee/hommikusoogihelbed/cookie-crisp): per 100 g, 393 kcal, 7.2 g protein, 76.3 g carbohydrate, 5.2 g fat, 6 g fibre. This manufacturer reference is still marked estimated until the user's package is verified.
- [USDA chicken breast, cooked, roasted](https://fdc.nal.usda.gov/food-details/171477/nutrients): the inventory's 165 kcal / 31 g protein / 3.6 g fat values match a cooked reference. Its protocol quantity is explicitly cooked weight, never raw weight.

## Truthful output

Unknown fibre contributes nothing to a conservative lower bound and carries `fibre_known: false`. It is stored as NULL when logged. A lower bound reaching the fibre minimum can support an estimated match, but does not make the full fibre total known. `nutrition_basis` and `fibre_complete` distinguish those cases. The UI shows estimate labels and source links.

The protocol must match calories, protein, carbs, fat, and the known fibre minimum together. It must preserve logged meals, explicit portion instructions, disliked foods, and approval-only logging. Four-meal generation must retain useful portions rather than achieve daily totals through near-empty meals.
