# Four-Day Protocol Grocery List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Phoenix generate an exact pantry-aware grocery list for four identical days of the current 2,000 kcal protocol and make every Nutrition surface use the green identity palette.

**Architecture:** The existing `/nutrition/shopping-list` route gains a `today_protocol_4_days` source. A focused adapter converts exact protocol components into shopping rows, multiplies quantities and totals by four, then delegates consolidation and pantry classification to the existing shopping-list engine. The PWA defaults Grocery Mode to this source and imports shared green theme constants across all Nutrition components.

**Tech Stack:** Python 3, FastAPI, pytest, React 18, Vite, Node test runner, Vitest.

## Global Constraints

- Repeat the current approved protocol without meal substitutions.
- Multiply each ingredient quantity by exactly four before display.
- Preserve `dry`, `cooked`, and `as served` measurement text.
- Do not invent package rounding or package counts.
- Pantry memory classifies items but does not subtract unknown pantry quantities.
- Estimate provenance remains visible.
- Every Nutrition screen uses green identity styling.
- Semantic error red and warning amber may remain where they communicate state.
- Grocery Mode never purchases groceries or logs meals.

---

### Task 1: Four-Day Protocol Shopping API

**Files:**
- Modify: `jarvis/api/routers/nutrition.py`
- Modify: `jarvis/domains/nutrition/engine.py`
- Test: `jarvis/api/tests/test_nutrition_routes.py`
- Test: `jarvis/api/tests/test_nutrition_recomposition_routes.py`

**Interfaces:**
- Consumes: `_today_protocol_context(constitution: dict) -> dict`
- Produces: `engine.build_protocol_shopping_items(meals: list[dict], days: int) -> list[dict]`
- Produces: `GET /nutrition/shopping-list?source=today_protocol_4_days`
- Response adds `days: 4`, `source: "today_protocol_4_days"`, and shopping rows with `quantity`, `unit`, `measurement_state`, `source_label`, and `is_estimate`.

- [ ] **Step 1: Write failing engine and route tests**

Add tests that derive expected values from the live protocol so changes to the meal recipe remain valid:

```python
def test_four_day_protocol_shopping_list_multiplies_and_merges_exact_quantities():
    protocol = client.get("/nutrition/today-protocol").json()
    response = client.get(
        "/nutrition/shopping-list?source=today_protocol_4_days"
    )
    assert response.status_code == 200
    data = response.json()

    assert data["source"] == "today_protocol_4_days"
    assert data["source_title"] == "Four days · current protocol"
    assert data["days"] == 4
    assert data["requires_approval"] is True

    daily = {}
    for meal in protocol["meals"]:
        for item in meal["items"]:
            key = (item["item_id"], item["measurement_state"])
            daily[key] = daily.get(key, 0.0) + item["quantity_g"]

    returned = {
        (item["item_id"], item["measurement_state"]): item
        for item in data["items"]
    }
    for key, daily_quantity in daily.items():
        assert returned[key]["quantity"] == pytest.approx(
            daily_quantity * 4, abs=0.1
        )
        assert returned[key]["unit"] == "g"
```

Add a provenance and pantry test:

```python
def test_four_day_protocol_shopping_list_preserves_basis_and_pantry_without_subtraction():
    created = client.post(
        "/nutrition/memory",
        json={
            "kind": "pantry",
            "item_id": "cookie_crisp",
            "item_type": "food",
            "name": "Cookie Crisp",
        },
    ).json()
    try:
        data = client.get(
            "/nutrition/shopping-list?source=today_protocol_4_days"
        ).json()
        cookie = next(item for item in data["items"] if item["name"] == "Cookie Crisp")
        assert cookie["quantity"] == pytest.approx(154.0)
        assert cookie["measurement_state"] == "as served"
        assert cookie["source_label"] == "REFERENCE ESTIMATE"
        assert cookie["is_estimate"] is True
        assert cookie in data["already_have"]
        assert cookie["quantity"] == pytest.approx(154.0)
    finally:
        client.delete(f"/nutrition/memory/{created['entry']['id']}")
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
python -m pytest jarvis/api/tests/test_nutrition_routes.py -k four_day_protocol -q
```

Expected: FAIL because `today_protocol_4_days` is rejected by the route query pattern or absent from the response.

- [ ] **Step 3: Implement the protocol-to-shopping adapter**

In `jarvis/domains/nutrition/engine.py`, add:

```python
def build_protocol_shopping_items(meals: list[dict], days: int) -> list[dict]:
    """Convert exact protocol components into repeatable shopping rows."""
    repeated = []
    for meal in meals or []:
        for raw in meal.get("items", []) or []:
            item = dict(raw)
            quantity_g = float(item.get("quantity_g", 0) or 0)
            row = {
                **item,
                "name": item.get("name", ""),
                "item_id": item.get("item_id", ""),
                "item_type": item.get("item_type", "food"),
                "quantity": round(quantity_g * days, 1),
                "unit": "g",
                "measurement_state": item.get("measurement_state", "as served"),
                "servings": float(item.get("servings", 1) or 1) * days,
                "calories": float(item.get("calories", 0) or 0) * days,
                "protein_g": float(item.get("protein_g", 0) or 0) * days,
                "carbs_g": float(item.get("carbs_g", 0) or 0) * days,
                "fat_g": float(item.get("fat_g", 0) or 0) * days,
                "price_eur": float(item.get("price_eur", 0) or 0) * days,
                "source_label": item.get("source_label", "INVENTORY ESTIMATE"),
                "is_estimate": item.get("is_estimate", True),
            }
            repeated.append(row)
    return repeated
```

Extend `_shopping_key` with `measurement_state` so incompatible measurement bases never merge. Extend aggregation to sum `quantity` and retain `measurement_state`, `source_label`, and `is_estimate`.

In `jarvis/api/routers/nutrition.py`, extend the query pattern to:

```python
pattern="^(day_plan|meal_builder|today_protocol_4_days)$"
```

Add the source branch before `day_plan`:

```python
if source == "today_protocol_4_days":
    protocol = _today_protocol_context(constitution)
    result = engine.build_shopping_list_from_items(
        engine.build_protocol_shopping_items(protocol.get("meals", []), days=4),
        memory_entries=memory_entries,
        source="today_protocol_4_days",
        source_title="Four days · current protocol",
    )
    result["days"] = 4
    result["protocol_id"] = protocol["protocol_id"]
    return result
```

- [ ] **Step 4: Run focused backend tests and verify GREEN**

Run:

```powershell
python -m pytest jarvis/api/tests/test_nutrition_routes.py jarvis/api/tests/test_nutrition_recomposition_routes.py -k "shopping or four_day_protocol" -q
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit the backend slice**

```powershell
git add jarvis/api/routers/nutrition.py jarvis/domains/nutrition/engine.py jarvis/api/tests/test_nutrition_routes.py jarvis/api/tests/test_nutrition_recomposition_routes.py
git commit -m "feat(nutrition): build four-day protocol grocery list"
```

### Task 2: Grocery Mode Four-Day Presentation

**Files:**
- Modify: `pwa/src/api/client.js`
- Modify: `pwa/src/components/nutrition/ShoppingList.jsx`
- Create: `pwa/src/components/nutrition/ShoppingList.interaction.test.jsx`
- Modify: `pwa/package.json`

**Interfaces:**
- Consumes: `getNutritionShoppingList(source: string, suggestionId?: string)`
- Consumes API fields: `days`, `quantity`, `unit`, `measurement_state`, `source_label`, `is_estimate`
- Produces: Grocery Mode default source `today_protocol_4_days`.

- [ ] **Step 1: Write the failing Grocery Mode interaction test**

Create a mocked response with one exact item and one pantry item, render `ShoppingList`, and assert the primary source and totals:

```jsx
it('shows an exact four-day current-protocol grocery list', async () => {
  getNutritionShoppingList.mockResolvedValue({
    source: 'today_protocol_4_days',
    source_title: 'Four days · current protocol',
    days: 4,
    principle: 'Phoenix creates a pantry-aware shopping list only.',
    need_to_buy_count: 1,
    already_have_count: 1,
    estimated_missing_cost_eur: 0,
    estimated_full_cost_eur: 0,
    need_to_buy: [{
      item_id: 'cookie_crisp',
      item_type: 'food',
      name: 'Cookie Crisp',
      category: 'carbs',
      quantity: 154,
      unit: 'g',
      measurement_state: 'as served',
      source_label: 'REFERENCE ESTIMATE',
      is_estimate: true,
    }],
    already_have: [{
      item_id: 'yogurt',
      item_type: 'food',
      name: '0% Greek Yogurt',
      category: 'dairy / eggs',
      quantity: 1125.2,
      unit: 'g',
      measurement_state: 'as served',
      source_label: 'INVENTORY ESTIMATE',
      is_estimate: true,
      already_have: true,
    }],
    categories: {},
  })

  render(<ShoppingList onBack={() => {}} />)

  expect(await screen.findByText('4 DAYS · CURRENT PROTOCOL')).toBeInTheDocument()
  expect(screen.getByText('154 g · as served')).toBeInTheDocument()
  expect(screen.getByText('REFERENCE ESTIMATE')).toBeInTheDocument()
  expect(getNutritionShoppingList).toHaveBeenCalledWith('today_protocol_4_days')
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npx vitest run src/components/nutrition/ShoppingList.interaction.test.jsx --environment jsdom
```

Expected: FAIL because Grocery Mode still defaults to `day_plan` and renders servings.

- [ ] **Step 3: Implement the exact four-day presentation**

Set the component source state to `today_protocol_4_days`. Replace the old day-plan source control with one primary button labelled `4 DAYS · CURRENT PROTOCOL`; retain `FROM NEXT MEAL` as the optional secondary source.

Add:

```jsx
function Quantity({ item }) {
  if (Number.isFinite(Number(item.quantity))) {
    return (
      <span>
        {fmt(item.quantity)} {item.unit || 'g'} · {item.measurement_state || 'as served'}
      </span>
    )
  }
  return <span>{fmt(item.servings)}× · {item.unit || 'serving'}</span>
}
```

Render `item.source_label` as a visible badge when present, add a `4 DAY SUPPLY` summary card, and change the section subtitle to `missing ingredients for four consistent protocol days`.

Update the `test` script in `pwa/package.json` to include both interaction files:

```json
"test": "node --test src/**/*.test.js && vitest run src/components/nutrition/*.interaction.test.jsx --environment jsdom"
```

- [ ] **Step 4: Run interaction and contract tests and verify GREEN**

Run:

```powershell
npm test
```

Expected: all Node and Vitest tests pass.

- [ ] **Step 5: Commit the Grocery Mode slice**

```powershell
git add pwa/src/api/client.js pwa/src/components/nutrition/ShoppingList.jsx pwa/src/components/nutrition/ShoppingList.interaction.test.jsx pwa/package.json
git commit -m "feat(nutrition): show four-day grocery quantities"
```

### Task 3: Nutrition-Wide Green Identity

**Files:**
- Create: `pwa/src/components/nutrition/nutritionTheme.js`
- Modify: every `.jsx` file under `pwa/src/components/nutrition/`
- Modify: `pwa/src/components/cockpit/cockpit.css`
- Modify: `pwa/src/components/nutrition/nutritionUiContract.test.js`

**Interfaces:**
- Produces shared exports: `NUTRITION_GREEN`, `NUTRITION_GREEN_BRIGHT`, `NUTRITION_GREEN_BORDER`, `NUTRITION_GREEN_MUTED`, `NUTRITION_GREEN_SURFACE`.
- Semantic state colors remain local only for errors and warnings.

- [ ] **Step 1: Write the failing Nutrition green contract**

Rename the orange Today Protocol contract to green and add a source scan across Nutrition components:

```js
test('every nutrition surface uses the green identity palette', async () => {
  const files = [
    'NutritionDashboard.jsx', 'TodayProtocol.jsx', 'ShoppingList.jsx',
    'LogMeal.jsx', 'MealBuilder.jsx', 'NutritionMemory.jsx',
    'WeightHistory.jsx', 'RecipeList.jsx', 'WeeklyPlanner.jsx',
    'DayPlanner.jsx', 'CalendarNutritionBridge.jsx',
    'NutritionAcceptanceGate.jsx', 'nutriHud.jsx',
  ]
  const sources = await Promise.all(
    files.map(file => readFile(new URL(`./${file}`, import.meta.url), 'utf8'))
  )
  for (const source of sources) {
    assert.equal(source.includes('#ff9f43'), false)
    assert.equal(source.includes('#ffd166'), false)
    assert.equal(source.includes('rgba(255,209,102'), false)
  }

  const css = await readFile(
    new URL('../cockpit/cockpit.css', import.meta.url),
    'utf8'
  )
  assert.match(css, /--phx-nutrition-green: #9dff6f/)
  assert.doesNotMatch(css, /--phx-nutrition-orange/)
  assert.doesNotMatch(css, /--phx-nutrition-gold/)
})
```

- [ ] **Step 2: Run the UI contract and verify RED**

Run:

```powershell
node --test src/components/nutrition/nutritionUiContract.test.js
```

Expected: FAIL with orange, gold, and amber identity literals found.

- [ ] **Step 3: Create and apply the shared green theme**

Create `nutritionTheme.js`:

```js
export const NUTRITION_GREEN = '#9dff6f'
export const NUTRITION_GREEN_BRIGHT = '#d5ffc7'
export const NUTRITION_GREEN_BORDER = 'rgba(157,255,111,.18)'
export const NUTRITION_GREEN_MUTED = 'rgba(157,255,111,.42)'
export const NUTRITION_GREEN_SURFACE = 'rgba(157,255,111,.04)'
export const NUTRITION_TEXT = 'rgba(220,248,236,.94)'
export const NUTRITION_TEXT_DIM = 'rgba(190,214,202,.72)'
```

Import these values in every Nutrition JSX component and replace identity uses of `#ff9f43`, `#ffd166`, and `rgba(255,209,102,...)` with the matching green constant or a green alpha. Keep `#ff5c7a` for errors and amber only when the component labels a real warning or caution state.

In `cockpit.css`, replace Nutrition orange/gold tokens with:

```css
.phx-scope-nutrition {
  --phx-nutrition-green: #9dff6f;
  --phx-nutrition-green-bright: #d5ffc7;
  --phx-nutrition-green-muted: rgba(157, 255, 111, .42);
  --phx-nutrition-green-border: rgba(157, 255, 111, .18);
}
```

Update Today Protocol styles to consume the green tokens.

- [ ] **Step 4: Run the PWA tests and build**

Run:

```powershell
npm test
npm run build
```

Expected: all tests pass and Vite exits 0 with a production build.

- [ ] **Step 5: Commit the green identity slice**

```powershell
git add pwa/src/components/nutrition pwa/src/components/cockpit/cockpit.css
git commit -m "style(nutrition): unify domain on green identity"
```

### Task 4: Full Verification and Production Deployment

**Files:**
- No planned source changes.
- Verify: backend, PWA, production API, and deployed mobile UI.

**Interfaces:**
- Production API returns the four-day source.
- Production PWA renders exact consolidated quantities with green Nutrition styling.

- [ ] **Step 1: Run the full backend suite**

Run:

```powershell
python -m pytest -q
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run the full PWA suite and build**

Run:

```powershell
Set-Location pwa
npm test
npm run build
```

Expected: all tests pass and the production build exits 0.

- [ ] **Step 3: Verify repository state and push**

Run:

```powershell
git diff --check
git status --short
git push origin HEAD:main
```

Expected: no diff-check errors, only intentional files before commit, then a successful push to `main`.

- [ ] **Step 4: Deploy backend and PWA using the existing project configuration**

Deploy the pushed commit through the existing Railway backend and Vercel PWA projects. Record both deployment IDs and wait until both report success.

- [ ] **Step 5: Verify the live API**

Request:

```text
GET /nutrition/shopping-list?source=today_protocol_4_days
```

Confirm `days == 4`, `source == "today_protocol_4_days"`, Cookie Crisp is `154 g · as served`, duplicate yogurt/pasta/chicken/broccoli/oil rows are consolidated, and no item has lost provenance.

- [ ] **Step 6: Verify the mobile production UI**

At a mobile viewport, navigate Nutrition → Grocery Mode and confirm:

- `4 DAYS · CURRENT PROTOCOL` is selected by default.
- Exact quantities and measurement bases are visible.
- Pantry and need-to-buy sections render.
- Reference and inventory estimates remain labelled.
- All Nutrition identity accents are green.
- Semantic errors and warnings retain meaningful state colors.
- `document.documentElement.scrollWidth === document.documentElement.clientWidth`.
- No browser console or visible application errors appear.

