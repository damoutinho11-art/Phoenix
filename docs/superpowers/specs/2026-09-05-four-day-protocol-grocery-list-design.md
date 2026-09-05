# Four-Day Protocol Grocery List Design

## Goal

Phoenix Nutrition will create a grocery list for four identical days of the current 2,000 kcal Today Protocol. The list will consolidate each ingredient into one exact total while preserving measurement basis, nutrition provenance, pantry status, and estimated pricing.

## User Flow

Grocery Mode will offer **4 DAYS · CURRENT PROTOCOL** as its primary source. Selecting it loads the same meal protocol shown in Today Protocol, repeats it four times, and presents the consolidated ingredients.

Each row will show the ingredient name and total quantity for four days. Measurement labels remain explicit, including `dry`, `cooked`, and `as served`. Reference and inventory estimates remain visibly labelled. Phoenix will separate ingredients marked in Nutrition Memory into **Already Have** and leave the remainder under **Need to Buy**.

The list is informational and approval-first. It will not purchase groceries, log meals, or assume package counts.

## Data Flow

The nutrition API will add the current protocol as a shopping-list source with a fixed four-day duration. It will obtain the canonical Today Protocol through the same backend context used by the existing Today Protocol route, flatten its meal items, multiply their quantities and nutritional totals by four, and pass them through the existing pantry-aware shopping-list aggregation.

The response will identify the source as the current protocol and include `days: 4`. Shopping items will expose an exact consolidated quantity and its unit or measurement basis. Items with the same stable identity, name, unit, and measurement basis will merge. Items with different bases, such as dry and cooked weights, will remain separate.

The PWA API client will request this source. Grocery Mode will make it the default and display the four-day duration, quantity totals, pantry split, provenance labels, and price estimates returned by the backend.

## Quantity Rules

- Repeat the current approved protocol without meal substitutions.
- Multiply each ingredient quantity by exactly four before display.
- Preserve sensible decimal precision from the daily plan; do not invent package rounding.
- Preserve `dry`, `cooked`, or `as served` measurement text.
- Consolidate matching ingredients across meals and days.
- Keep nutrition and price values marked as estimates where their source is estimated.
- Use pantry memory only to classify items; do not subtract an unknown pantry quantity from the required total.

## Nutrition Color System

The entire Nutrition domain will use green as its identity color. Every Nutrition screen, including Dashboard, Today Protocol, Grocery Mode, meal logging, meal building, pantry and memory, trends, recipes, and weekly planning, will replace orange or cyan identity accents with the established Nutrition green tokens. This includes headers, selected controls, borders, badges, focus states, progress indicators, links, and informational status accents. Semantic error and warning colors may remain red or amber where changing them would hide their meaning.

Grocery Mode's selected source control will read **4 DAYS · CURRENT PROTOCOL**. Summary cards will state the duration, number of items to buy, pantry item count, and estimated cost. Ingredient rows will lead with shopping quantity; calories and protein may remain secondary supporting data.

Empty and failure states will explain whether the protocol is unavailable or the pantry already covers the list. No state will imply that an order has been placed.

## Error Handling

If Today Protocol cannot be generated, the API will return a clear failure rather than falling back to a different meal plan. The PWA will show an unavailable state and allow the user to return to Nutrition. Missing price information will remain an unavailable estimate and will not prevent quantity generation.

## Verification

Backend tests will prove that the four-day source:

- multiplies the approved daily quantities by four;
- merges duplicate ingredients;
- preserves measurement bases and provenance;
- separates pantry items without subtracting unknown stock;
- reports a four-day duration and performs no logging or purchasing.

PWA tests will prove that Grocery Mode defaults to the four-day protocol source and displays exact totals and estimate labels. A Nutrition-wide UI contract will verify that every Nutrition screen uses the green identity palette while retaining semantic error and warning colors. The full backend and PWA suites, the production build, and a mobile-width browser check will run before deployment.

## Scope

This change covers one four-day list based on the current approved protocol and a Nutrition-wide green identity pass across existing Nutrition screens. Variable durations, package-size rounding, meal variety, inventory depletion, purchasing integrations, and automatic ordering are outside this feature.


