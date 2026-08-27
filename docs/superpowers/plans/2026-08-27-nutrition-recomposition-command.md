# Nutrition Recomposition Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Phoenix Nutrition generate and operate an exact-gram, rehearsal-aware 2,600 kcal recomposition protocol while preserving logged facts and requiring approval for target changes.

**Architecture:** Keep `nutrition.engine` as the source for status and food inventory, and add a focused `recomposition.py` domain module for exact measurement, four-slot protocol construction, deterministic replanning, and evidence gates. The API exposes one read-only Today Protocol plus explicit meal-log and replan commands; the PWA consumes that contract through a small model and a routed orange command surface.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, SQLite repository helpers, React 18, Vite, Node test runner, pytest, Playwright browser verification.

## Global Constraints

- Calibration target is 2,600 kcal, 175 g protein, approximately 315 g carbohydrate, and approximately 70 g fat every day.
- The first adjustment review remains locked until 14 complete, reliably logged days exist.
- Planned totals must be within plus or minus 50 kcal and plus or minus 5 g protein to be labelled target-matched.
- Pasta is dry weight; meat is raw unless explicitly stored as cooked; frozen vegetables are frozen weight; wraps show units and label grams.
- Cookie Crisp, wraps, pasta, meat, frozen vegetables, bananas, and yogurt are preferred; potatoes are excluded.
- Calendar may alter timing and portability but may not alter approved energy targets.
- Logged meals are immutable facts unless explicitly deleted or corrected by the user.
- Phoenix never auto-logs, auto-purchases, or silently changes calorie targets.
- MOTS-C, ipamorelin, and BPC-157 remain blocked from autonomous recommendations.
- Nutrition retains orange domain chrome with distinct semantic macro and status colors.
- Existing Finance state and behaviour remain untouched.

---

## File Structure

- `jarvis/domains/nutrition/constitution.json`: authoritative recomposition phase, preferences, measurement rules, supplement states, and evidence thresholds.
- `jarvis/domains/nutrition/recomposition.py`: exact-gram component normalization, protocol construction, deterministic replan operations, protocol identity, and adjustment evidence evaluation.
- `jarvis/domains/nutrition/engine.py`: delegates recomposition planning to the focused module while preserving existing recipe, shopping, and weekly-plan behaviour.
- `jarvis/api/routers/nutrition.py`: Today Protocol, replan, individual approval/log, and recomposition-review HTTP contracts.
- `jarvis/api/tests/test_nutrition_recomposition_routes.py`: route-level write safety, stale protocol, and authority tests.
- `jarvis/domains/nutrition/tests/test_recomposition.py`: pure domain tests.
- `pwa/src/components/nutrition/todayProtocolModel.js`: safe response normalization and client-side presentation state.
- `pwa/src/components/nutrition/todayProtocolModel.test.js`: model tests.
- `pwa/src/components/nutrition/TodayProtocol.jsx`: exact-gram daily operating surface.
- `pwa/src/components/nutrition/NutritionDashboard.jsx`: promotes Today Protocol as the primary Nutrition action.
- `pwa/src/components/nutrition/nutritionUiContract.test.js`: orange identity, truthful actions, and responsive contract checks.
- `pwa/src/api/client.js`: Today Protocol API functions.
- `pwa/src/components/cockpit/cockpit.css`: responsive orange protocol layout.

---

### Task 1: Make The Recomposition Prescription Authoritative

**Files:**
- Modify: `jarvis/domains/nutrition/constitution.json`
- Modify: `jarvis/domains/nutrition/engine.py`
- Test: `jarvis/domains/nutrition/tests/test_nutrition_engine.py`
- Test: `jarvis/api/tests/test_nutrition_routes.py`

**Interfaces:**
- Consumes: existing `get_macro_target(constitution, today, training_day)`.
- Produces: phase `recomposition_cut`, constant calibration macros, and public calibration metadata in `/nutrition/status`.

- [ ] **Step 1: Write failing phase and status tests**

Add these tests:

```python
def test_recomposition_calibration_uses_same_target_on_training_and_recovery_days():
    constitution = load_constitution()
    training = engine.get_macro_target(constitution, date(2026, 8, 27), True)
    recovery = engine.get_macro_target(constitution, date(2026, 8, 27), False)

    assert training == recovery
    assert training.calories == 2600
    assert training.protein_g == 175
    assert training.carbs_g == 315
    assert training.fat_g == 70


def test_status_exposes_recomposition_calibration_authority():
    data = client.get("/nutrition/status").json()
    assert data["phase"] == "recomposition_cut"
    assert data["calibration"]["minimum_complete_days"] == 14
    assert data["calibration"]["target_loss_kg_per_week"] == [0.2, 0.4]
    assert data["target"]["calories"] == 2600
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
python -m pytest jarvis/domains/nutrition/tests/test_nutrition_engine.py -k recomposition_calibration -q
python -m pytest jarvis/api/tests/test_nutrition_routes.py -k calibration_authority -q
```

Expected: failures show the current `cut` phase and 2,400/2,000 targets.

- [ ] **Step 3: Replace the constitution phase with the approved prescription**

Use this structure in `constitution.json`:

```json
{
  "active_phase": "recomposition_cut",
  "phases": {
    "recomposition_cut": {
      "start_date": "2026-08-27",
      "end_date": null,
      "training_day": {"calories": 2600, "protein_g": 175, "carbs_g": 315, "fat_g": 70},
      "rest_day": {"calories": 2600, "protein_g": 175, "carbs_g": 315, "fat_g": 70},
      "fibre_g": {"minimum": 30, "target": 35},
      "fluid_l": {"minimum": 2.3, "target": 2.7},
      "steps": {"baseline": 5000, "target": 7000},
      "calibration": {
        "minimum_complete_days": 14,
        "target_loss_kg_per_week": [0.2, 0.4],
        "high_loss_kg_per_week": 0.5,
        "adjustment_kcal": [100, 150]
      }
    }
  },
  "food_preferences": {
    "prefer": ["cookie crisp", "wrap", "pasta", "meat", "frozen vegetables", "banana", "yogurt"],
    "avoid": ["potato"],
    "protein_priority": "meat_over_fish",
    "meals_per_day": 4
  },
  "measurement_rules": {
    "pasta": "dry",
    "meat": "raw_unless_explicitly_cooked",
    "frozen_vegetables": "frozen",
    "packaged_food": "as_served_label",
    "wrap": "unit_and_label_grams",
    "calorie_tolerance": 50,
    "protein_tolerance_g": 5
  }
}
```

Preserve the existing profile and safety flags. Update `get_current_phase()` to prefer `active_phase` and retain date-based fallback for older fixtures:

```python
def get_current_phase(constitution: dict, today: date) -> str:
    active = constitution.get("active_phase")
    if active in constitution.get("phases", {}):
        return active
    return _date_selected_phase(constitution, today)
```

Serialize `calibration`, `fibre_target_g`, and `fluid_target_l` in `_serialize_status()` from the active phase.

- [ ] **Step 4: Run focused and complete Nutrition tests**

Run:

```powershell
python -m pytest jarvis/domains/nutrition/tests/test_nutrition_engine.py jarvis/api/tests/test_nutrition_routes.py -q
```

Expected: all tests pass and old date fixtures continue to resolve through fallback constitutions.

- [ ] **Step 5: Commit the prescription authority**

```powershell
git add jarvis/domains/nutrition/constitution.json jarvis/domains/nutrition/engine.py jarvis/domains/nutrition/tests/test_nutrition_engine.py jarvis/api/tests/test_nutrition_routes.py
git commit -m "feat(nutrition): authorize recomposition calibration targets"
```

---

### Task 2: Build Exact-Gram Today Protocol Domain Logic

**Files:**
- Create: `jarvis/domains/nutrition/recomposition.py`
- Modify: `jarvis/domains/nutrition/engine.py`
- Test: `jarvis/domains/nutrition/tests/test_recomposition.py`

**Interfaces:**
- Consumes: `NutritionStatus`, serialized staples/recipes, nutrition memory, calendar timing blocks, and constitution measurement rules.
- Produces: `build_today_protocol(*, target_date, status, foods, memory_entries, calendar_blocks, constitution, logged_meals) -> dict`, `replan_protocol(protocol, action, foods) -> dict`, `protocol_identity(target_date, target, logged_meals) -> str`, and `evaluate_adjustment_evidence(*, daily_rows, waist_rows, performance_rows, hunger_rows, constitution) -> dict`.

- [ ] **Step 1: Write failing exact-measurement and preference tests**

Create `test_recomposition.py` with:

```python
def test_protocol_has_four_exact_gram_slots_and_reconciles_targets():
    protocol = build_fixture_protocol()
    assert [meal["slot"] for meal in protocol["meals"]] == [
        "breakfast", "rehearsal_break", "pre_training", "dinner"
    ]
    assert all(item["quantity_g"] > 0 for meal in protocol["meals"] for item in meal["items"])
    assert all(item["measurement_state"] for meal in protocol["meals"] for item in meal["items"])
    assert abs(protocol["target_gap"]["calories"]) <= 50
    assert abs(protocol["target_gap"]["protein_g"]) <= 5
    assert protocol["target_matched"] is True


def test_protocol_respects_user_food_rules():
    protocol = build_fixture_protocol()
    names = " ".join(item["name"].lower() for meal in protocol["meals"] for item in meal["items"])
    assert "potato" not in names
    assert "cookie crisp" in names
    assert "wrap" in names or "pasta" in names


def test_rehearsal_creates_portable_noon_meal_without_changing_target():
    protocol = build_fixture_protocol(calendar_blocks=[{
        "start": "11:00", "end": "15:00", "kind": "rehearsal", "breaks": ["12:00"]
    }])
    meal = next(row for row in protocol["meals"] if row["slot"] == "rehearsal_break")
    assert meal["timing"] == "12:00"
    assert meal["portable"] is True
    assert protocol["target"]["calories"] == 2600


def test_logged_meals_are_subtracted_and_never_rewritten():
    logged = [meal_log(calories=600, protein_g=40)]
    protocol = build_fixture_protocol(logged_meals=logged)
    assert protocol["logged_meals"] == logged
    assert protocol["remaining_target"]["calories"] == 2000
    assert all(meal["source"] == "proposal" for meal in protocol["meals"])
```

- [ ] **Step 2: Run the new domain tests and verify RED**

Run:

```powershell
python -m pytest jarvis/domains/nutrition/tests/test_recomposition.py -q
```

Expected: import failure for the absent `recomposition` module.

- [ ] **Step 3: Implement explicit component and protocol contracts**

Create these public functions in `recomposition.py`:

```python
CALORIE_TOLERANCE = 50.0
PROTEIN_TOLERANCE_G = 5.0


def exact_component(food: dict, quantity_g: float, measurement_state: str) -> dict:
    reference_g = float(food["reference_g"])
    factor = quantity_g / reference_g
    return {
        "item_id": food["id"],
        "name": food["name"],
        "quantity_g": round(quantity_g, 1),
        "measurement_state": measurement_state,
        "label_source": food.get("label_source", "generic_estimate"),
        "is_estimate": food.get("label_source") is None,
        "calories": round(float(food["calories"]) * factor, 1),
        "protein_g": round(float(food["protein_g"]) * factor, 1),
        "carbs_g": round(float(food["carbs_g"]) * factor, 1),
        "fat_g": round(float(food["fat_g"]) * factor, 1),
        "fibre_g": round(float(food.get("fibre_g", 0)) * factor, 1),
    }


def protocol_identity(target_date: date, target: dict, logged_meals: list[dict]) -> str:
    canonical = json.dumps({
        "date": target_date.isoformat(), "target": target, "logged": logged_meals
    }, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:20]


def build_today_protocol(*, target_date, status, foods, memory_entries,
                         calendar_blocks, constitution, logged_meals) -> dict:
    meals = _build_four_slots(
        target_date=target_date,
        remaining_target=_remaining_dict(status),
        foods=foods,
        memory_entries=memory_entries,
        calendar_blocks=calendar_blocks,
        preferences=constitution["food_preferences"],
        measurement_rules=constitution["measurement_rules"],
    )
    totals = _sum_meals(meals)
    gap = _macro_gap(status.target, status.logged, totals)
    return {
        "mode": "recomposition_today_protocol",
        "protocol_id": protocol_identity(target_date, _target_dict(status.target), logged_meals),
        "target": _target_dict(status.target),
        "remaining_target": _remaining_dict(status),
        "logged_meals": logged_meals,
        "meals": meals,
        "planned_total": totals,
        "target_gap": gap,
        "target_matched": abs(gap["calories"]) <= 50 and abs(gap["protein_g"]) <= 5,
        "requires_approval": True,
    }
```

Implement `_build_four_slots()` using deterministic food-role selection. Apply avoided-food filtering before scoring. Prefer product-label entries; retain `is_estimate=True` for generic foods. Use gram-step balancing in this order: protein anchor, carbohydrate, fat, then fibre/volume. Do not use potatoes as a fallback.

- [ ] **Step 4: Add deterministic replan operations and evidence evaluation**

Implement:

```python
def replan_protocol(protocol: dict, action: dict, foods: list[dict]) -> dict:
    if action["meal_id"] not in {meal["meal_id"] for meal in protocol["meals"]}:
        raise ValueError("Unknown protocol meal")
    if action["type"] == "skip":
        meals = [meal for meal in protocol["meals"] if meal["meal_id"] != action["meal_id"]]
    elif action["type"] == "adjust_portion":
        meals = _replace_item_quantity(protocol["meals"], action)
    elif action["type"] == "replace":
        meals = _replace_meal_with_nearest_match(protocol["meals"], action, foods)
    else:
        raise ValueError("Unsupported replan action")
    return _rebalance_unlogged_meals({**protocol, "meals": meals})


def evaluate_adjustment_evidence(*, daily_rows, waist_rows, performance_rows,
                                 hunger_rows, constitution) -> dict:
    complete = [row for row in daily_rows if row["complete"]]
    if len(complete) < 14:
        return {"status": "insufficient_evidence", "eligible": False,
                "complete_days": len(complete), "minimum_complete_days": 14}
    weekly_rate = _rolling_weight_rate(complete)
    return _proposal_from_guardrails(weekly_rate, waist_rows, performance_rows,
                                     hunger_rows, constitution)
```

The returned proposal contains `direction`, `kcal_delta`, `evidence`, `confidence`, and `requires_approval=True`; it never mutates the constitution.

- [ ] **Step 5: Run domain tests and regression tests**

Run:

```powershell
python -m pytest jarvis/domains/nutrition/tests/test_recomposition.py jarvis/domains/nutrition/tests/test_nutrition_engine.py -q
```

Expected: all pass.

- [ ] **Step 6: Commit the exact protocol engine**

```powershell
git add jarvis/domains/nutrition/recomposition.py jarvis/domains/nutrition/engine.py jarvis/domains/nutrition/tests/test_recomposition.py
git commit -m "feat(nutrition): build exact gram recomposition protocol"
```

---

### Task 3: Expose Approval-First Today Protocol APIs

**Files:**
- Modify: `jarvis/api/routers/nutrition.py`
- Modify: `jarvis/data/database.py`
- Test: `jarvis/api/tests/test_nutrition_recomposition_routes.py`

**Interfaces:**
- Produces: `GET /nutrition/today-protocol`, `POST /nutrition/today-protocol/replan`, `POST /nutrition/today-protocol/log-meal`, and `GET /nutrition/recomposition-review`.
- Consumes: Task 2 domain functions and existing meal/weight repositories.

- [ ] **Step 1: Write failing route contract tests**

Create:

```python
def test_today_protocol_is_read_only_and_exact():
    before = client.get("/nutrition/status").json()["meal_log"]
    protocol = client.get("/nutrition/today-protocol").json()
    after = client.get("/nutrition/status").json()["meal_log"]
    assert before == after
    assert protocol["requires_approval"] is True
    assert all("quantity_g" in item for meal in protocol["meals"] for item in meal["items"])


def test_log_one_protocol_meal_never_logs_the_full_day():
    protocol = client.get("/nutrition/today-protocol").json()
    chosen = protocol["meals"][0]
    response = client.post("/nutrition/today-protocol/log-meal", json={
        "protocol_id": protocol["protocol_id"], "meal_id": chosen["meal_id"]
    })
    assert response.status_code == 200
    status = client.get("/nutrition/status").json()
    assert len(status["meal_log"]) == 1


def test_stale_protocol_is_rejected_without_writes():
    protocol = client.get("/nutrition/today-protocol").json()
    client.post("/nutrition/log/meal", json=manual_meal_payload())
    response = client.post("/nutrition/today-protocol/log-meal", json={
        "protocol_id": protocol["protocol_id"], "meal_id": protocol["meals"][0]["meal_id"]
    })
    assert response.status_code == 409
    assert response.json()["detail"] == "Today protocol is stale; refresh before logging"


def test_recomposition_review_locks_before_fourteen_complete_days():
    review = client.get("/nutrition/recomposition-review").json()
    assert review["status"] == "insufficient_evidence"
    assert review["eligible"] is False
    assert review["requires_approval"] is False
```

- [ ] **Step 2: Run route tests and verify RED**

Run:

```powershell
python -m pytest jarvis/api/tests/test_nutrition_recomposition_routes.py -q
```

Expected: 404 responses for the absent routes.

- [ ] **Step 3: Add request models and context builder**

Add:

```python
class ReplanProtocolRequest(BaseModel):
    protocol_id: str = Field(min_length=20, max_length=20)
    action: Literal["skip", "replace", "adjust_portion"]
    meal_id: str = Field(min_length=1)
    item_id: str | None = None
    quantity_g: float | None = Field(default=None, gt=0)


class LogProtocolMealRequest(BaseModel):
    protocol_id: str = Field(min_length=20, max_length=20)
    meal_id: str = Field(min_length=1)


def _today_protocol_context(constitution: dict) -> dict:
    today = clock.today()
    status, meals = _status_for_date(constitution, today)
    bridge = nutrition_calendar_bridge(days=1, start_date=today, constitution=constitution)
    return recomposition.build_today_protocol(
        target_date=today,
        status=status,
        foods=engine.load_exact_food_inventory(),
        memory_entries=database.get_nutrition_memory(),
        calendar_blocks=bridge.get("days", [{}])[0].get("blocks", []),
        constitution=constitution,
        logged_meals=meals,
    )
```

- [ ] **Step 4: Implement routes with stale-write protection**

```python
@router.get("/today-protocol")
def today_protocol(constitution: dict = Depends(get_nutrition_constitution)) -> dict:
    return _today_protocol_context(constitution)


@router.post("/today-protocol/replan")
def replan_today_protocol(request: ReplanProtocolRequest,
                          constitution: dict = Depends(get_nutrition_constitution)) -> dict:
    current = _today_protocol_context(constitution)
    if request.protocol_id != current["protocol_id"]:
        raise HTTPException(409, "Today protocol is stale; refresh before replanning")
    return recomposition.replan_protocol(current, request.model_dump(), engine.load_exact_food_inventory())


@router.post("/today-protocol/log-meal")
def log_today_protocol_meal(request: LogProtocolMealRequest,
                            constitution: dict = Depends(get_nutrition_constitution)) -> dict:
    current = _today_protocol_context(constitution)
    if request.protocol_id != current["protocol_id"]:
        raise HTTPException(409, "Today protocol is stale; refresh before logging")
    meal = next((row for row in current["meals"] if row["meal_id"] == request.meal_id), None)
    if meal is None:
        raise HTTPException(404, "Protocol meal not found")
    ids = database.log_meal_components_atomically(clock.today(), meal["items"], source=f"today_protocol:{request.protocol_id}:{request.meal_id}")
    return {"status": "logged", "meal_id": request.meal_id, "log_ids": ids}


@router.get("/recomposition-review")
def recomposition_review(constitution: dict = Depends(get_nutrition_constitution)) -> dict:
    return recomposition.evaluate_adjustment_evidence(
        daily_rows=database.get_recomposition_daily_evidence(28),
        waist_rows=database.get_body_measurements("waist", 60),
        performance_rows=database.get_training_performance_guardrails(28),
        hunger_rows=database.get_nutrition_hunger_guardrails(28),
        constitution=constitution,
    )
```

Implement `log_meal_components_atomically()` with one SQLite transaction so partial meals cannot be recorded. Add read-only evidence queries that return empty collections when no evidence exists.

- [ ] **Step 5: Run Nutrition and cross-domain API tests**

Run:

```powershell
python -m pytest jarvis/api/tests/test_nutrition_recomposition_routes.py jarvis/api/tests/test_nutrition_routes.py jarvis/api/tests/test_calendar_routes.py -q
```

Expected: all pass; GET and replan calls produce no writes.

- [ ] **Step 6: Commit the API contract**

```powershell
git add jarvis/api/routers/nutrition.py jarvis/data/database.py jarvis/api/tests/test_nutrition_recomposition_routes.py
git commit -m "feat(nutrition): expose approval first today protocol"
```

---

### Task 4: Build The Orange Today Protocol Interface

**Files:**
- Create: `pwa/src/components/nutrition/todayProtocolModel.js`
- Create: `pwa/src/components/nutrition/todayProtocolModel.test.js`
- Create: `pwa/src/components/nutrition/TodayProtocol.jsx`
- Modify: `pwa/src/components/nutrition/NutritionDashboard.jsx`
- Modify: `pwa/src/components/nutrition/nutritionUiContract.test.js`
- Modify: `pwa/src/api/client.js`
- Modify: `pwa/src/App.jsx`
- Modify: `pwa/src/components/cockpit/cockpit.css`

**Interfaces:**
- Consumes: Task 3 HTTP routes.
- Produces: normalized `TodayProtocol` presentation model and routed user commands for Eat & Log, Replace, Adjust Portion, and Skip.

- [ ] **Step 1: Write failing model and UI-contract tests**

Create model tests:

```javascript
test('normalizes exact gram protocol without inventing quantities', () => {
  const model = buildTodayProtocolModel(protocolFixture)
  assert.equal(model.meals.length, 4)
  assert.equal(model.meals[0].items[0].quantityLabel, '60 g · as served')
  assert.equal(model.targetMatched, true)
})

test('missing measurement data remains visibly unverified', () => {
  const model = buildTodayProtocolModel({ meals: [{ meal_id: 'm1', items: [{ name: 'Food' }] }] })
  assert.equal(model.meals[0].items[0].quantityLabel, 'MEASUREMENT UNVERIFIED')
  assert.equal(model.targetMatched, false)
})
```

Extend `nutritionUiContract.test.js`:

```javascript
test('today protocol is orange, exact, approval-first, and responsive', async () => {
  const source = await readFile(new URL('./TodayProtocol.jsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../cockpit/cockpit.css', import.meta.url), 'utf8')
  for (const token of ['TODAY PROTOCOL', 'EAT & LOG', 'REPLACE', 'ADJUST PORTION', 'SKIP', 'quantityLabel']) {
    assert.match(source, new RegExp(token.replace(/[&]/g, '\\&')))
  }
  assert.match(css, /--phx-nutrition-orange/)
  assert.match(css, /@media \(max-width: 520px\)/)
  assert.doesNotMatch(source, /LOG FULL PLAN/)
})
```

- [ ] **Step 2: Run PWA tests and verify RED**

Run:

```powershell
cd pwa
node --test src/components/nutrition/todayProtocolModel.test.js src/components/nutrition/nutritionUiContract.test.js
```

Expected: missing module/component and missing UI tokens.

- [ ] **Step 3: Add client functions and safe model normalization**

Add to `client.js`:

```javascript
export const getNutritionTodayProtocol = () => apiFetch('/nutrition/today-protocol')
export const getNutritionRecompositionReview = () => apiFetch('/nutrition/recomposition-review')
export const replanNutritionTodayProtocol = payload => apiFetch('/nutrition/today-protocol/replan', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
})
export const logNutritionProtocolMeal = payload => apiFetch('/nutrition/today-protocol/log-meal', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
})
```

Implement the model without fallback foods or invented numbers:

```javascript
export function buildTodayProtocolModel(raw = {}) {
  const meals = Array.isArray(raw.meals) ? raw.meals.map(meal => ({
    ...meal,
    items: Array.isArray(meal.items) ? meal.items.map(item => ({
      ...item,
      quantityLabel: Number.isFinite(Number(item.quantity_g)) && item.measurement_state
        ? `${Number(item.quantity_g).toFixed(Number(item.quantity_g) % 1 ? 1 : 0)} g · ${item.measurement_state.replaceAll('_', ' ')}`
        : 'MEASUREMENT UNVERIFIED',
      sourceLabel: item.is_estimate ? 'GENERIC ESTIMATE' : 'PRODUCT LABEL',
    })) : [],
  })) : []
  const measurementsVerified = meals.every(meal => meal.items.every(item => item.quantityLabel !== 'MEASUREMENT UNVERIFIED'))
  return {...raw, meals, measurementsVerified, targetMatched: raw.target_matched === true && measurementsVerified}
}
```

- [ ] **Step 4: Build `TodayProtocol.jsx` as an operational surface**

The component must:

- Fetch protocol and review concurrently.
- Show target, gap, measurement/source state, and four fixed meal rows.
- Require confirmation only for `EAT & LOG`; replacement, portion, and skip remain proposals.
- Retain current inputs and show retry after network errors.
- Refresh after successful logging and display 409 stale messages as a refresh command.
- Never offer `LOG FULL PLAN`.

Use this command handler shape:

```javascript
async function runMealCommand(type, meal, extra = {}) {
  setPending(`${type}:${meal.meal_id}`)
  setError('')
  try {
    if (type === 'log') {
      await logNutritionProtocolMeal({ protocol_id: model.protocol_id, meal_id: meal.meal_id })
      await load()
    } else {
      const next = await replanNutritionTodayProtocol({
        protocol_id: model.protocol_id, action: type, meal_id: meal.meal_id, ...extra,
      })
      setProtocol(next)
    }
  } catch (err) {
    setError(err?.status === 409 ? 'Protocol changed. Refresh before continuing.' : 'Command failed. Your inputs were retained.')
  } finally {
    setPending('')
  }
}
```

- [ ] **Step 5: Route Today Protocol from the dashboard**

Add a `todayProtocol` Nutrition subview in `App.jsx`. Make `TODAY PROTOCOL` the primary dashboard command and retain Log Meal, Trends, Memory, Pantry/Shopping, Weekly Prep, and Recipes as secondary routes. Do not stack those complete tools on the dashboard.

- [ ] **Step 6: Add orange responsive CSS**

Define a mixed orange identity rather than lime-only chrome:

```css
.phx-scope-nutrition {
  --phx-nutrition-orange: #ff9f43;
  --phx-nutrition-gold: #ffd166;
  --phx-nutrition-green: #9dff6f;
}
.phx-today-protocol { color: rgba(244, 248, 246, .94); }
.phx-today-protocol__meals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.phx-today-protocol__meal { min-width: 0; border: 1px solid rgba(255,159,67,.24); border-radius: 6px; }
.phx-today-protocol__commands { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 520px) {
  .phx-today-protocol__meals { grid-template-columns: 1fr; }
  .phx-today-protocol__commands { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .phx-today-protocol__meal { overflow: hidden; }
}
```

Use existing cockpit tokens and icon library where available. Keep cards at 6 px radius and avoid nested cards.

- [ ] **Step 7: Run focused and complete PWA checks**

Run:

```powershell
cd pwa
node --test src/components/nutrition/todayProtocolModel.test.js src/components/nutrition/nutritionDashboardModel.test.js src/components/nutrition/nutritionUiContract.test.js
npm test
npm run build
```

Expected: all tests pass; build completes with only the existing chunk-size advisory.

- [ ] **Step 8: Commit the interface**

```powershell
git add pwa/src/api/client.js pwa/src/App.jsx pwa/src/components/nutrition/TodayProtocol.jsx pwa/src/components/nutrition/todayProtocolModel.js pwa/src/components/nutrition/todayProtocolModel.test.js pwa/src/components/nutrition/NutritionDashboard.jsx pwa/src/components/nutrition/nutritionUiContract.test.js pwa/src/components/cockpit/cockpit.css
git commit -m "feat(nutrition): add exact gram today protocol interface"
```

---

### Task 5: Acceptance Gate, Full Verification, And Deployment Readiness

**Files:**
- Modify: `jarvis/domains/nutrition/engine.py`
- Modify: `jarvis/api/tests/test_nutrition_routes.py`
- Create: `docs/nutrition-recomposition-operations.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: Nutrition acceptance-gate evidence and an operator runbook.

- [ ] **Step 1: Write failing acceptance-gate checks**

Extend the acceptance-gate regression test:

```python
def test_acceptance_gate_covers_recomposition_protocol():
    data = client.get("/nutrition/acceptance-gate").json()
    checks = {row["key"]: row for row in data["checks"]}
    assert checks["recomposition_authority"]["status"] == "pass"
    assert checks["exact_measurement_contract"]["status"] == "pass"
    assert checks["immutable_logged_meals"]["status"] == "pass"
    assert checks["fourteen_day_adjustment_gate"]["status"] == "pass"
    assert checks["research_peptide_block"]["status"] == "pass"
```

- [ ] **Step 2: Run the acceptance test and verify RED**

Run:

```powershell
python -m pytest jarvis/api/tests/test_nutrition_routes.py -k recomposition_protocol -q
```

Expected: missing check keys.

- [ ] **Step 3: Add acceptance evidence and operations documentation**

Add five deterministic checks to `build_nutrition_acceptance_gate()` using generated local protocol data and no writes. Document:

- Morning weight and weekly waist procedure.
- Four-meal normal and rehearsal-day timing.
- Exact raw/dry/frozen/as-served measurement rules.
- Two-week review gate and approval flow.
- Label-verification process for omega-3 and vitamin D.
- Peptide hard block and clinician-review boundary.
- Rollback procedure to the prior Nutrition constitution commit.

- [ ] **Step 4: Run complete local verification**

Run:

```powershell
python -m pytest jarvis/domains/nutrition/tests jarvis/api/tests/test_nutrition_routes.py jarvis/api/tests/test_nutrition_recomposition_routes.py jarvis/api/tests/test_calendar_routes.py -q
cd pwa
npm test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Start the local production preview**

Run the backend and PWA preview on unused ports, then verify with Playwright at 1440x900 and 390x844:

- Nutrition dashboard opens Today Protocol.
- Four meal slots render exact grams and measurement states.
- No horizontal overflow or incoherent overlap exists.
- Replace, Adjust Portion, and Skip do not write meal logs.
- Eat & Log writes only the selected meal.
- A stale protocol fails visibly and preserves inputs.
- Console contains no errors or warnings introduced by this change.

- [ ] **Step 6: Commit acceptance and runbook changes**

```powershell
git add jarvis/domains/nutrition/engine.py jarvis/api/tests/test_nutrition_routes.py docs/nutrition-recomposition-operations.md
git commit -m "docs(nutrition): add recomposition acceptance operations"
```

- [ ] **Step 7: Perform production read-only smoke verification after deployment**

Check Railway and Vercel without writing user data:

```powershell
$base='https://phoenix-production-1fb2.up.railway.app'
Invoke-RestMethod "$base/health"
Invoke-RestMethod "$base/nutrition/status"
Invoke-RestMethod "$base/nutrition/today-protocol"
Invoke-RestMethod "$base/nutrition/recomposition-review"
Invoke-RestMethod "$base/nutrition/acceptance-gate"
```

Expected:

- Health is `ok`.
- Status and Today Protocol agree on 2,600/175/315/70.
- Protocol has four exact-gram meals and `requires_approval=true`.
- Review is `insufficient_evidence` until 14 complete days exist.
- Acceptance gate is `PASS` with no blockers.
- The live PWA asset returns 200 and desktop/mobile browser checks remain clean.

## Plan Self-Review

- The plan covers every approved specification section: authority, exact grams, preferred foods, rehearsal timing, immutable logs, evidence gates, supplement safety, orange design, and production verification.
- New public names are consistent across tasks: `build_today_protocol`, `replan_protocol`, `protocol_identity`, `evaluate_adjustment_evidence`, and the four `/nutrition/today-protocol` or review routes.
- Work is split by independently reviewable boundaries: prescription, domain logic, API safety, interface, and acceptance.
- No task stages or modifies `jarvis/domains/finance/portfolio_state.json` or `.codex-remote-attachments/`.
