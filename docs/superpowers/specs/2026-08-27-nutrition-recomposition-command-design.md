# Nutrition Recomposition Command Design

**Date:** 2026-08-27
**Status:** Approved direction, pending written-spec review
**Owner:** Diogo
**System:** Phoenix Nutrition

## Objective

Rebuild Phoenix Nutrition around a patient recomposition phase: lose body fat while preserving or gaining muscle, maintain basketball and dunk-training capacity, and reduce decision load without pretending that planned food was eaten.

The long-term outcome is approximately 12-13% body fat. Phoenix must treat this as a multi-phase objective without a forced deadline. Progress is determined from measured weight, waist, performance, adherence, and progress photos rather than an unverified body-fat estimate.

## Starting Evidence

- Age: 26
- Height: 181 cm
- Current morning weight: 77.6 kg
- Current waist: not yet measured
- Current intake: approximately 3,000 kcal on accurately tracked days
- Recent weight trend: stable for two weeks at that intake
- Resistance-training performance: stable
- Activity: approximately 5,000 steps per day, basketball once weekly, short treadmill work
- Training commitment: six resistance sessions plus one active-recovery day
- Sleep: approximately 6-7 hours, normally 00:00-08:00
- Hydration: approximately 1.5 L before intervention
- Primary hunger window: after rehearsals around 14:00-15:00
- Rehearsal pattern: commonly 11:00-14:00 or 15:00, with a break near 12:00
- Normal training time: approximately 18:00-19:00
- Preferred structure: four meals
- Preferred foods: Cookie Crisp, wraps, pasta, meat, frozen vegetables, bananas, yogurt
- Avoided food: potatoes
- Alcohol: none

## Phase Prescription

Phoenix will use a 14-day calibration phase named **Recomposition Cut**.

| Target | Starting value |
| --- | ---: |
| Calories | 2,600 kcal daily |
| Protein | 175 g daily |
| Carbohydrates | approximately 315 g daily |
| Fat | approximately 70 g daily |
| Fibre | 30-35 g daily |
| Fluids | 2.3-2.7 L baseline, increased for heat and sweat |
| Steps | progress from 5,000 toward 7,000 daily |

The initial target is deliberately identical on training and recovery days. This creates a clean calibration period, reduces daily complexity, and prevents under-fuelling while the active Training plan is being observed. Phoenix may distribute carbohydrates differently around sessions but must not silently change daily energy.

The former 2,400 kcal training-day and 2,000 kcal rest-day targets are superseded for this phase.

## Daily Operating Model

Phoenix leads the day by producing a **Today Protocol** from authoritative Training, Calendar, Nutrition Memory, Pantry, and logged-meal data.

The protocol contains four meal slots:

1. Breakfast near 09:00.
2. Rehearsal-break or midday meal near 12:00-13:00.
3. Main or pre-training meal near 15:00-17:00.
4. Post-training dinner near 20:00-21:00.

On rehearsal days, the 12:00 break is a real planned meal rather than an optional snack. Calendar may shift meal timing and portability, but it may not independently change calorie or macro targets.

Each planned meal supports these commands:

- **Eat & Log:** records the exact approved portion as eaten.
- **Replace:** proposes nutritionally comparable alternatives.
- **Adjust Portion:** recalculates that meal and the remaining day.
- **Skip:** removes the meal and replans only the unconsumed remainder.

Phoenix never logs a proposed meal automatically. Logged meals are immutable facts unless the user explicitly deletes or corrects them.

## Measurement Contract

Phoenix must express every planned meal, replacement, and logged portion as exact ingredient quantities. Generic instructions such as "one serving," "a bowl," "some vegetables," or "a pasta meal" are invalid unless the serving is also resolved to a verified gram weight.

Each ingredient line contains:

- Product or food name
- Exact quantity in grams or millilitres
- Measurement state: raw, dry, frozen, cooked, drained, or as served
- Product-label source when a packaged product is used
- Calories, protein, carbohydrates, fat, and fibre for that quantity

The default measurement rules are:

- Pasta is weighed dry.
- Meat is weighed raw unless the saved food entry explicitly identifies a cooked product.
- Frozen vegetables are weighed frozen.
- Cereal, yogurt, whey, cheese, sauces, and oils are weighed as served.
- Wraps are recorded by both unit and verified label weight, for example `1 wrap / 128 g`.
- Batch recipes declare total batch weight, serving count, and grams per serving.

Every meal displays a macro subtotal. Every protocol displays the sum of all planned meals and the difference from the approved daily target. The normal planning tolerance is no more than plus or minus 50 kcal and plus or minus 5 g protein per day. Phoenix must show any larger deviation and cannot label the protocol target-matched.

Generic database estimates may be used only when no product label exists, and they must be visibly marked as estimates. Product-label values override generic values. Phoenix must never claim laboratory precision because cooking, draining, and label rounding introduce unavoidable measurement error.

## Food Strategy

The plan preserves preferred foods rather than using unnecessary restriction.

- Cookie Crisp remains available in a measured breakfast or rehearsal meal and is paired with yogurt, milk, whey, or another complete protein source.
- Wraps and pasta alternate as primary carbohydrate formats.
- Lean meat is the default primary protein; fish remains optional.
- Frozen vegetables are used to increase volume and fibre in main meals.
- Bananas are the default portable fruit around rehearsal, basketball, and resistance training.
- Potatoes are excluded from autonomous suggestions.
- Protein is distributed across four meals instead of concentrating more than 80 g in lunch and dinner.
- Food volume, fibre, hydration, and meal timing are addressed before reducing calories further.
- At least one exact 2,600 kcal reference protocol is generated from the user's real Cookie Crisp, yogurt, whey, wrap, chicken, mozzarella, pasta, frozen vegetables, and banana entries after their product labels are verified.

Replacement meals should remain close to the original meal's energy and protein contribution. Phoenix must show the numerical effect before approval.

## Adjustment Authority

Phoenix uses daily morning weights but evaluates only rolling trends.

- No calorie adjustment is permitted during the first 14 complete, reliably logged days.
- The desired initial loss rate is approximately 0.2-0.4 kg per week.
- Waist is measured once weekly under consistent conditions.
- Progress photos are reviewed every four weeks.
- Strength, session completion, hunger, sleep, and recovery are guardrails.
- If two reliable weeks show weight and waist effectively unchanged, Phoenix may propose a 100-150 kcal reduction.
- If loss exceeds approximately 0.5 kg per week, strength declines, or recovery materially worsens, Phoenix may propose adding 100-150 kcal.
- Every target change must show its evidence, expected effect, and confidence.
- Every target change requires explicit user approval.
- One weigh-in, one unusual meal, one missed session, or one high-sodium day cannot trigger an adjustment.
- Phoenix may recommend a maintenance phase when hunger, adherence, sleep, or performance has materially deteriorated.

Missing or incomplete data produces an **Insufficient Evidence** state. Phoenix must not invent adherence, expenditure, body-fat percentage, or progress.

## Supplement Policy

Phoenix classifies supplements by evidence and verification state.

- Creatine monohydrate: approved at 5 g daily.
- Whey protein: optional convenience tool, not required when food meets protein.
- Caffeine: tracked by amount and time. Late use is discouraged because sleep is currently constrained.
- Omega-3: dose remains unverified until EPA and DHA values are supplied.
- Vitamin D: dose remains unverified until the label strength is supplied; Phoenix cannot recommend blind high dosing.
- NAC: 400 mg reported; retained as user-reported and not treated as a recomposition driver.
- BCAAs, fat burners, testosterone boosters, detox products, and complex pre-workouts are not autonomously recommended.

MOTS-C, ipamorelin, and BPC-157 are paused and excluded from all Phoenix planning. They remain blocked unless reviewed with a qualified clinician using identifiable product details. Phoenix must not provide, store as an approved protocol, or operationalize human-use dosing for research-only peptides.

## Interface Design

Nutrition retains its orange domain identity and the dense, premium command-centre language established by Finance and Training.

The first viewport prioritizes:

1. Today's target and measured progress.
2. The next meal command.
3. The four-slot Today Protocol.
4. A morning weight prompt when today's measurement is missing.

Secondary routed sections contain Trends, Food Memory, Pantry, Weekly Prep, Shopping, Recipes, and the acceptance gate. The main screen must not become a recipe gallery or stack every tool into nested cards.

Desktop and mobile must preserve one coherent hierarchy. Fixed-format macro displays, meal controls, and action bars require stable responsive dimensions. Nutrition uses orange for domain chrome while protein, carbohydrate, fat, readiness, caution, and error states retain distinct semantic colors.

## Data Flow

1. The active Training plan declares whether the day contains a real session.
2. Calendar supplies timing constraints such as rehearsals and concerts.
3. Nutrition constitution supplies the approved recomposition targets.
4. Memory removes avoided foods and prioritizes favorites.
5. Pantry influences recipe selection and shopping requirements.
6. The planner creates four proposed meal slots without writing logs.
7. User actions log, replace, resize, or skip one slot.
8. Phoenix recalculates only the unconsumed remainder.
9. Daily weight and meal evidence feed a read-only trend evaluator.
10. The evaluator may produce an approval-required target-change proposal after the evidence gate is satisfied.

## Failure And Safety Behaviour

- Backend failure renders a visible unavailable state without fixture meals.
- Conflicting Training and Calendar data preserves the Training target and flags the timing conflict.
- A stale plan is labelled stale and cannot be silently logged.
- A partial meal-log failure retains the user's inputs and supports an explicit retry.
- Planner errors cannot mutate meal logs, pantry, targets, or shopping data.
- External purchases and calendar writes remain prohibited.
- Supplement amounts without verified label strengths remain unknown.
- Peptides remain hard-blocked from autonomous recommendations.

## Acceptance Criteria

- Production status reflects 2,600 kcal, 175 g protein, approximately 315 g carbohydrate, and approximately 70 g fat during calibration.
- Training-plan changes correctly alter timing context without silently changing the approved energy target.
- Phoenix produces four practical meals using real food-brain entries and user preferences.
- Every planned ingredient has an exact amount and measurement state; packaged foods retain product-label provenance.
- Meal subtotals and protocol totals reconcile within plus or minus 50 kcal and plus or minus 5 g protein of the approved target.
- Pasta uses dry weight, meat uses raw weight unless explicitly stored as cooked, frozen vegetables use frozen weight, and wraps show unit plus label grams.
- Cookie Crisp, wraps, pasta, meat, frozen vegetables, and bananas can appear; potatoes do not.
- A rehearsal from 11:00-15:00 produces a portable 12:00 meal.
- Eat & Log, Replace, Adjust Portion, and Skip behave deterministically.
- Replanning never alters logged meals.
- No target change is proposed before 14 complete days.
- Target proposals use rolling weight, waist, performance, adherence, hunger, and recovery evidence.
- Empty data remains explicitly unknown.
- Desktop and 390 px mobile views remain readable without overlap or horizontal overflow.
- Backend, model, UI-contract, and production smoke tests pass.
- Existing Finance state and behaviour remain untouched.

## Verification Strategy

- Unit tests cover target selection, meal-slot construction, preference filtering, timing adaptation, immutable logged meals, and evidence-gated adjustments.
- API tests cover the approved prescription, rehearsal-day plans, replanning commands, supplement verification states, and fail-closed behaviour.
- PWA model tests cover truthful empty states, next-meal actions, partial failures, and responsive UI contracts.
- Browser verification covers desktop and 390 px mobile Nutrition flows against the live backend with console and overflow checks.
- Production verification checks Railway health, Nutrition endpoints, PWA assets, and authoritative target consistency without writing user data.

## Out Of Scope

- Automatic food purchasing
- Automatic meal logging
- Automatic target changes
- Medical diagnosis or treatment
- Human-use peptide protocols
- Precise body-fat estimation without validated measurement
- Replacing the active Training plan
