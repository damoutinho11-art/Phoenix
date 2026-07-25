# Training Calendar Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local editable PHOENIX training calendar layer that fits around the existing opera calendar data without mutating source events. Users can see generated training sessions on the calendar, save a local copy, move a training block, mark it recovery-only, and see simple conflicts against rehearsals/performances.

**Architecture:** Persist local training calendar blocks in SQLite, expose them through the existing training API, fetch them through the PWA API client, merge them into the existing calendar dashboard as training events, and add a training-dashboard entry point that opens the calendar planner.

**Tech Stack:** FastAPI, Pydantic, SQLite helpers in `jarvis/data/database.py`, React PWA source under `pwa/src`, Node built-in test runner, pytest.

## Global Constraints

- Keep this slice limited to the Training Calendar Planner.
- Do not implement the Meal Builder Basket or Training Plan Editor in this plan.
- Treat the normalized calendar snapshot as read-only. Local PHOENIX training blocks are a separate editable layer.
- Preserve existing training status, routed-session, nutrition, finance, and calendar API contracts.
- Use focused tests before or with each implementation step.
- Do not revert unrelated dirty worktree files.

---

## Task 1: Add SQLite Persistence For Local Training Calendar Blocks

**Files:**

- `jarvis/data/database.py`
- `jarvis/data/tests/test_database.py`

### 1.1 Add failing database tests

- [ ] Append these tests near the other training persistence tests in `jarvis/data/tests/test_database.py`.

```python
def test_training_calendar_blocks_round_trip() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        original_path = database.DB_PATH
        database.DB_PATH = Path(tmp) / "jarvis.db"
        try:
            database.init_db()
            saved = database.save_training_calendar_block(
                {
                    "date": "2026-07-13",
                    "time_start": "09:00",
                    "time_end": "10:15",
                    "session_type": "high_intensity",
                    "source": "manual",
                    "status": "planned",
                    "title": "Heavy lower",
                    "notes": "Keep it away from Tosca call.",
                }
            )

            assert saved["block_id"] > 0
            assert saved["date"] == "2026-07-13"
            assert saved["session_type"] == "high_intensity"
            assert saved["source"] == "manual"
            assert saved["status"] == "planned"

            blocks = database.list_training_calendar_blocks("2026-07-12", days=7)
            assert [block["block_id"] for block in blocks] == [saved["block_id"]]
        finally:
            database.DB_PATH = original_path


def test_training_calendar_blocks_update_and_delete() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        original_path = database.DB_PATH
        database.DB_PATH = Path(tmp) / "jarvis.db"
        try:
            database.init_db()
            saved = database.save_training_calendar_block(
                {
                    "date": "2026-07-13",
                    "time_start": "09:00",
                    "time_end": "10:15",
                    "session_type": "jump",
                    "source": "manual",
                    "status": "planned",
                    "title": "Jump day",
                    "notes": None,
                }
            )

            updated = database.update_training_calendar_block(
                saved["block_id"],
                {
                    "date": "2026-07-14",
                    "status": "moved",
                    "notes": "Moved after rehearsal.",
                },
            )

            assert updated is not None
            assert updated["date"] == "2026-07-14"
            assert updated["status"] == "moved"
            assert updated["notes"] == "Moved after rehearsal."

            assert database.delete_training_calendar_block(saved["block_id"]) is True
            assert database.delete_training_calendar_block(saved["block_id"]) is False
            assert database.list_training_calendar_blocks("2026-07-12", days=7) == []
        finally:
            database.DB_PATH = original_path
```

- [ ] Run:

```powershell
pytest jarvis/data/tests/test_database.py -q
```

Expected result before implementation: failure because `save_training_calendar_block` does not exist.

### 1.2 Add schema

- [ ] In `jarvis/data/database.py`, add this table and index inside `_SCHEMA` with the other training tables.

```sql
CREATE TABLE IF NOT EXISTS training_calendar_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_date TEXT NOT NULL,
    time_start TEXT,
    time_end TEXT,
    session_type TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    status TEXT NOT NULL CHECK (status IN ('planned','moved','completed','skipped','recovery_only')),
    title TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_training_calendar_blocks_date
ON training_calendar_blocks(block_date, id);
```

### 1.3 Add persistence helpers

- [ ] In `jarvis/data/database.py`, add these helpers near the existing training log helpers.

```python
_TRAINING_CALENDAR_STATUSES = {"planned", "moved", "completed", "skipped", "recovery_only"}


def _serialize_training_calendar_block(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    data = _row_to_dict(row)
    data["block_id"] = data.pop("id")
    data["date"] = data.pop("block_date")
    return data


def _validate_training_calendar_status(status: str) -> str:
    normalized = str(status or "planned").strip().lower()
    if normalized not in _TRAINING_CALENDAR_STATUSES:
        raise ValueError(f"Unsupported training calendar status: {status}")
    return normalized


def save_training_calendar_block(payload: dict[str, Any]) -> dict[str, Any]:
    now = _utc_now()
    block_date = _date_value(payload["date"]).isoformat()
    status = _validate_training_calendar_status(payload.get("status", "planned"))
    with get_db() as conn:
        cursor = conn.execute(
            """
            INSERT INTO training_calendar_blocks (
                block_date, time_start, time_end, session_type, source, status,
                title, notes, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                block_date,
                payload.get("time_start"),
                payload.get("time_end"),
                str(payload["session_type"]),
                str(payload.get("source") or "manual"),
                status,
                str(payload["title"]),
                payload.get("notes"),
                now,
                now,
            ),
        )
        row = conn.execute(
            "SELECT * FROM training_calendar_blocks WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
    serialized = _serialize_training_calendar_block(row)
    assert serialized is not None
    return serialized


def list_training_calendar_blocks(start_date: date | str, days: int = 7) -> list[dict[str, Any]]:
    start = _date_value(start_date)
    span = max(1, min(int(days), 31))
    end = start + timedelta(days=span - 1)
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM training_calendar_blocks
            WHERE block_date BETWEEN ? AND ?
            ORDER BY block_date ASC, COALESCE(time_start, '99:99') ASC, id ASC
            """,
            (start.isoformat(), end.isoformat()),
        ).fetchall()
    return [block for row in rows if (block := _serialize_training_calendar_block(row)) is not None]


def update_training_calendar_block(block_id: int, patch: dict[str, Any]) -> dict[str, Any] | None:
    allowed = {
        "date": "block_date",
        "time_start": "time_start",
        "time_end": "time_end",
        "session_type": "session_type",
        "source": "source",
        "status": "status",
        "title": "title",
        "notes": "notes",
    }
    values: dict[str, Any] = {}
    for key, column in allowed.items():
        if key not in patch:
            continue
        value = patch[key]
        if key == "date":
            value = _date_value(value).isoformat()
        elif key == "status":
            value = _validate_training_calendar_status(value)
        values[column] = value

    if not values:
        with get_db() as conn:
            row = conn.execute(
                "SELECT * FROM training_calendar_blocks WHERE id = ?",
                (block_id,),
            ).fetchone()
        return _serialize_training_calendar_block(row)

    values["updated_at"] = _utc_now()
    assignments = ", ".join(f"{column} = ?" for column in values)
    params = [*values.values(), block_id]
    with get_db() as conn:
        conn.execute(
            f"UPDATE training_calendar_blocks SET {assignments} WHERE id = ?",
            params,
        )
        row = conn.execute(
            "SELECT * FROM training_calendar_blocks WHERE id = ?",
            (block_id,),
        ).fetchone()
    return _serialize_training_calendar_block(row)


def delete_training_calendar_block(block_id: int) -> bool:
    with get_db() as conn:
        cursor = conn.execute(
            "DELETE FROM training_calendar_blocks WHERE id = ?",
            (block_id,),
        )
    return cursor.rowcount > 0
```

- [ ] Ensure `database.py` imports `date`, `timedelta`, `Any`, and `sqlite3` already cover this code. Add imports only when absent.

### 1.4 Verify database task

- [ ] Run:

```powershell
pytest jarvis/data/tests/test_database.py -q
```

Expected result: all tests in that file pass.

- [ ] Commit after this task:

```powershell
git status --short
git add jarvis/data/database.py jarvis/data/tests/test_database.py
git commit -m "Add training calendar block persistence"
```

---

## Task 2: Add Training Calendar API And Conflict Projection

**Files:**

- `jarvis/api/routers/training.py`
- `jarvis/api/tests/test_training_routes.py`

### 2.1 Add failing route tests

- [ ] Add these tests to `jarvis/api/tests/test_training_routes.py`.

```python
from jarvis.api.routers import training


def test_training_calendar_plan_includes_generated_and_local_blocks(monkeypatch) -> None:
    local_block = {
        "block_id": 7,
        "date": "2026-07-13",
        "time_start": "09:00",
        "time_end": "10:15",
        "session_type": "high_intensity",
        "source": "manual",
        "status": "planned",
        "title": "Manual lower",
        "notes": None,
        "created_at": "2026-07-11T00:00:00Z",
        "updated_at": "2026-07-11T00:00:00Z",
    }
    monkeypatch.setattr(training.database, "list_training_calendar_blocks", lambda start_date, days=7: [local_block])

    response = client.get("/training/calendar-plan?start_date=2026-07-12&days=7")

    assert response.status_code == 200
    payload = response.json()
    assert payload["start_date"] == "2026-07-12"
    assert payload["days"] == 7
    assert payload["source_schedule"]["read_only"] is True
    assert payload["local_blocks"] == [local_block]
    assert any(block["source"] == "generated" for block in payload["generated_blocks"])
    assert any(block["block_id"] == 7 for block in payload["blocks"])


def test_training_calendar_block_crud_routes(monkeypatch) -> None:
    saved = {
        "block_id": 11,
        "date": "2026-07-13",
        "time_start": "08:30",
        "time_end": "09:30",
        "session_type": "jump",
        "source": "manual",
        "status": "planned",
        "title": "Jump primer",
        "notes": None,
        "created_at": "2026-07-11T00:00:00Z",
        "updated_at": "2026-07-11T00:00:00Z",
    }
    updated = {**saved, "date": "2026-07-14", "status": "moved"}
    monkeypatch.setattr(training.database, "save_training_calendar_block", lambda payload: saved)
    monkeypatch.setattr(training.database, "update_training_calendar_block", lambda block_id, payload: updated)
    monkeypatch.setattr(training.database, "delete_training_calendar_block", lambda block_id: True)

    create_response = client.post(
        "/training/calendar-plan/blocks",
        json={
            "date": "2026-07-13",
            "time_start": "08:30",
            "time_end": "09:30",
            "session_type": "jump",
            "source": "manual",
            "status": "planned",
            "title": "Jump primer",
            "notes": None,
        },
    )
    assert create_response.status_code == 200
    assert create_response.json()["block_id"] == 11

    patch_response = client.patch(
        "/training/calendar-plan/blocks/11",
        json={"date": "2026-07-14", "status": "moved"},
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["date"] == "2026-07-14"
    assert patch_response.json()["status"] == "moved"

    delete_response = client.delete("/training/calendar-plan/blocks/11")
    assert delete_response.status_code == 200
    assert delete_response.json() == {"deleted": True}


def test_training_calendar_plan_flags_heavy_training_on_performance_day(monkeypatch) -> None:
    monkeypatch.setattr(
        training,
        "LIVE_SNAPSHOT_RAW",
        "2026-07-13 19:00 Performance - Tosca\n",
    )
    monkeypatch.setattr(
        training.database,
        "list_training_calendar_blocks",
        lambda start_date, days=7: [
            {
                "block_id": 99,
                "date": "2026-07-13",
                "time_start": "09:00",
                "time_end": "10:00",
                "session_type": "high_intensity",
                "source": "manual",
                "status": "planned",
                "title": "Heavy day",
                "notes": None,
                "created_at": "2026-07-11T00:00:00Z",
                "updated_at": "2026-07-11T00:00:00Z",
            }
        ],
    )

    response = client.get("/training/calendar-plan?start_date=2026-07-13&days=1")

    assert response.status_code == 200
    conflicts = response.json()["conflicts"]
    assert conflicts
    assert conflicts[0]["block_id"] == 99
    assert conflicts[0]["severity"] == "high"
    assert conflicts[0]["conflict_type"] == "performance_day"
```

- [ ] Run:

```powershell
pytest jarvis/api/tests/test_training_routes.py -q
```

Expected result before implementation: failures for missing `/training/calendar-plan` routes.

### 2.2 Add API models

- [ ] In `jarvis/api/routers/training.py`, add these models after the existing training request/response models.

```python
TrainingCalendarSessionType = Literal[
    "high_intensity",
    "general",
    "jump",
    "iso_only",
    "rest",
    "deload",
    "peak",
    "attempt",
    "manual",
]
TrainingCalendarStatus = Literal["planned", "moved", "completed", "skipped", "recovery_only"]


class TrainingCalendarBlockRequest(BaseModel):
    date: date
    time_start: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    time_end: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    session_type: TrainingCalendarSessionType
    source: Literal["generated", "manual", "moved"] = "manual"
    status: TrainingCalendarStatus = "planned"
    title: str = Field(min_length=1, max_length=120)
    notes: str | None = Field(default=None, max_length=500)


class TrainingCalendarBlockPatch(BaseModel):
    date: date | None = None
    time_start: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    time_end: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    session_type: TrainingCalendarSessionType | None = None
    source: Literal["generated", "manual", "moved"] | None = None
    status: TrainingCalendarStatus | None = None
    title: str | None = Field(default=None, min_length=1, max_length=120)
    notes: str | None = Field(default=None, max_length=500)
```

### 2.3 Add generated blocks and conflict helpers

- [ ] Add `HTTPException` and the calendar parser import in `jarvis/api/routers/training.py`.

```python
from fastapi import APIRouter, Depends, HTTPException
from jarvis.domains.calendar import engine as calendar_engine
```

- [ ] Add these helpers below `_serialize_status`.

```python
_HEAVY_TRAINING_TYPES = {"high_intensity", "jump", "peak", "attempt"}


def _generated_training_calendar_blocks(constitution: TrainingConstitution, start_date: date, days: int) -> list[dict[str, Any]]:
    status = _current_status(constitution)
    sessions = status.get("week_sessions") or []
    window_dates = {start_date + timedelta(days=offset) for offset in range(days)}
    blocks: list[dict[str, Any]] = []
    for index, session in enumerate(sessions):
        session_day = session.get("date")
        if isinstance(session_day, str):
            try:
                session_date = date.fromisoformat(session_day[:10])
            except ValueError:
                session_date = start_date + timedelta(days=index)
        elif isinstance(session_day, date):
            session_date = session_day
        else:
            session_date = start_date + timedelta(days=index)
        if session_date not in window_dates:
            continue
        session_type = str(session.get("session_type") or session.get("type") or "general")
        blocks.append(
            {
                "block_id": f"generated-{session_date.isoformat()}",
                "date": session_date.isoformat(),
                "time_start": None,
                "time_end": None,
                "session_type": session_type,
                "source": "generated",
                "status": "planned",
                "title": str(session.get("title") or session.get("name") or "Generated training"),
                "notes": session.get("intent") or session.get("notes"),
                "created_at": None,
                "updated_at": None,
            }
        )
    return blocks


def _calendar_performances_by_date() -> dict[str, list[Any]]:
    snapshot = calendar_engine.parse_snapshot(LIVE_SNAPSHOT_RAW)
    by_date: dict[str, list[Any]] = {}
    for event in snapshot.events:
        event_type = str(getattr(event, "event_type", "") or "").lower()
        title = str(getattr(event, "title", "") or "")
        if event_type == "performance" or "performance" in title.lower():
            by_date.setdefault(event.start.date().isoformat(), []).append(event)
    return by_date


def _project_training_calendar_conflicts(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    performances = _calendar_performances_by_date()
    conflicts: list[dict[str, Any]] = []
    for block in blocks:
        if block.get("status") in {"skipped", "recovery_only"}:
            continue
        if str(block.get("session_type")) not in _HEAVY_TRAINING_TYPES:
            continue
        events = performances.get(str(block.get("date")), [])
        for event in events:
            conflicts.append(
                {
                    "block_id": block["block_id"],
                    "severity": "high",
                    "conflict_type": "performance_day",
                    "detail": "Heavy training is planned on the same day as a performance.",
                    "suggestion": "Move this block earlier or mark it recovery-only.",
                    "opera_event_title": getattr(event, "title", "Performance"),
                    "opera_event_date": event.start.date().isoformat(),
                }
            )
    return conflicts
```

### 2.4 Add routes

- [ ] Add these endpoints after `GET /training/routed-session` or near the other training planning endpoints.

```python
@router.get("/calendar-plan")
def get_training_calendar_plan(
    start_date: date | None = None,
    days: int = 7,
    constitution: TrainingConstitution = Depends(get_training_constitution),
) -> dict[str, Any]:
    start = start_date or date.today()
    span = max(1, min(days, 31))
    generated_blocks = _generated_training_calendar_blocks(constitution, start, span)
    local_blocks = database.list_training_calendar_blocks(start, span)
    local_dates = {block["date"] for block in local_blocks}
    blocks = [block for block in generated_blocks if block["date"] not in local_dates]
    blocks.extend(local_blocks)
    blocks.sort(key=lambda block: (block["date"], block.get("time_start") or "99:99", str(block["block_id"])))
    return {
        "start_date": start.isoformat(),
        "days": span,
        "blocks": blocks,
        "generated_blocks": generated_blocks,
        "local_blocks": local_blocks,
        "conflicts": _project_training_calendar_conflicts(blocks),
        "source_schedule": {
            "read_only": True,
            "source": "LIVE_SNAPSHOT_RAW",
            "editable_layer": "training_calendar_blocks",
        },
    }


@router.post("/calendar-plan/blocks")
def create_training_calendar_block(payload: TrainingCalendarBlockRequest) -> dict[str, Any]:
    return database.save_training_calendar_block(payload.model_dump(mode="json"))


@router.patch("/calendar-plan/blocks/{block_id}")
def patch_training_calendar_block(block_id: int, payload: TrainingCalendarBlockPatch) -> dict[str, Any]:
    patch = payload.model_dump(mode="json", exclude_unset=True)
    updated = database.update_training_calendar_block(block_id, patch)
    if updated is None:
        raise HTTPException(status_code=404, detail="Training calendar block not found")
    return updated


@router.delete("/calendar-plan/blocks/{block_id}")
def remove_training_calendar_block(block_id: int) -> dict[str, bool]:
    return {"deleted": database.delete_training_calendar_block(block_id)}
```

### 2.5 Verify API task

- [ ] Run:

```powershell
pytest jarvis/api/tests/test_training_routes.py -q
```

Expected result: training route tests pass.

- [ ] Run:

```powershell
pytest jarvis/data/tests/test_database.py jarvis/api/tests/test_training_routes.py -q
```

Expected result: both targeted suites pass.

- [ ] Commit after this task:

```powershell
git status --short
git add jarvis/api/routers/training.py jarvis/api/tests/test_training_routes.py
git commit -m "Expose training calendar planner API"
```

---

## Task 3: Add PWA API Client Functions

**Files:**

- `pwa/src/api/client.js`
- `pwa/src/api/clientContract.test.js`

### 3.1 Add failing source contract test

- [ ] Create `pwa/src/api/clientContract.test.js`.

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./client.js', import.meta.url), 'utf8');

test('training calendar planner API helpers are exported', () => {
  assert.match(source, /export async function getTrainingCalendarPlan/);
  assert.match(source, /export async function postTrainingCalendarBlock/);
  assert.match(source, /export async function patchTrainingCalendarBlock/);
  assert.match(source, /export async function deleteTrainingCalendarBlock/);
  assert.match(source, /\/training\/calendar-plan/);
  assert.match(source, /\/training\/calendar-plan\/blocks/);
});
```

- [ ] Run:

```powershell
cd pwa
npm test -- src/api/clientContract.test.js
```

Expected result before implementation: failure because the exports are missing.

### 3.2 Implement client helpers

- [ ] Add these functions to `pwa/src/api/client.js` near the existing training API functions.

```javascript
export async function getTrainingCalendarPlan(days = 7, startDate = '') {
  const params = new URLSearchParams();
  params.set('days', String(days));
  if (startDate) params.set('start_date', startDate);
  return apiFetch(`/training/calendar-plan?${params.toString()}`);
}

export async function postTrainingCalendarBlock(payload) {
  return apiFetch('/training/calendar-plan/blocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function patchTrainingCalendarBlock(blockId, payload) {
  return apiFetch(`/training/calendar-plan/blocks/${encodeURIComponent(blockId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteTrainingCalendarBlock(blockId) {
  return apiFetch(`/training/calendar-plan/blocks/${encodeURIComponent(blockId)}`, {
    method: 'DELETE',
  });
}
```

### 3.3 Verify client task

- [ ] Run:

```powershell
cd pwa
npm test -- src/api/clientContract.test.js
```

Expected result: client contract test passes.

- [ ] Commit after this task:

```powershell
git status --short
git add pwa/src/api/client.js pwa/src/api/clientContract.test.js
git commit -m "Add training calendar planner client API"
```

---

## Task 4: Render Editable Training Layer In Calendar Dashboard

**Files:**

- `pwa/src/components/calendar/CalendarDashboard.jsx`
- `pwa/src/components/calendar/calendarUiContract.test.js`

### 4.1 Add failing UI contract checks

- [ ] Extend `pwa/src/components/calendar/calendarUiContract.test.js` with this test.

```javascript
test('calendar exposes editable PHOENIX training layer controls', async () => {
  const source = await readFile(new URL('./CalendarDashboard.jsx', import.meta.url), 'utf8')

  assert.match(source, /getTrainingCalendarPlan/);
  assert.match(source, /postTrainingCalendarBlock/);
  assert.match(source, /patchTrainingCalendarBlock/);
  assert.match(source, /PHOENIX TRAINING LAYER/);
  assert.match(source, /SAVE LOCAL COPY/);
  assert.match(source, /MOVE \+1 DAY/);
  assert.match(source, /RECOVERY ONLY/);
  assert.match(source, /trainingBlockToCalendarEvent/);
});
```

- [ ] Run:

```powershell
cd pwa
npm test -- src/components/calendar/calendarUiContract.test.js
```

Expected result before implementation: failure because the new strings/functions are missing.

### 4.2 Import training planner API helpers

- [ ] Change the import at the top of `CalendarDashboard.jsx` from:

```javascript
import { getCalendarSnapshot, getUnifiedCalendar, postJarvisChat } from '../../api/client'
```

to:

```javascript
import {
  getCalendarSnapshot,
  getTrainingCalendarPlan,
  getUnifiedCalendar,
  patchTrainingCalendarBlock,
  postJarvisChat,
  postTrainingCalendarBlock,
} from '../../api/client'
```

### 4.3 Add event conversion helpers

- [ ] Add these helpers near `eventAccent`.

```javascript
function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function trainingBlockToCalendarEvent(block) {
  return {
    event_id: `training-${block.block_id}`,
    event_type: 'training',
    title: block.title || 'Training block',
    date: block.date,
    time_start: block.time_start,
    time_end: block.time_end,
    source: 'phoenix_training',
    location: block.status === 'recovery_only' ? 'Recovery only' : 'PHOENIX plan',
    training_block: block,
  };
}
```

### 4.4 Add training planner state and loader

- [ ] Inside `CalendarDashboard`, add state next to the existing calendar state.

```javascript
const [trainingPlan, setTrainingPlan] = useState(null);
const [trainingPlanError, setTrainingPlanError] = useState('');
const [trainingPlanBusy, setTrainingPlanBusy] = useState(false);
```

- [ ] Add a loader function inside `CalendarDashboard`.

```javascript
const refreshTrainingPlan = async () => {
  try {
    setTrainingPlanError('');
    const plan = await getTrainingCalendarPlan(7);
    setTrainingPlan(plan);
  } catch (error) {
    setTrainingPlanError(error.message || 'Training plan unavailable');
  }
};
```

- [ ] Call the loader in the existing calendar `useEffect` after the source calendar load starts.

```javascript
useEffect(() => {
  // existing source calendar loading remains here
  refreshTrainingPlan();
}, []);
```

If the file already has a single `useEffect` for calendar loading, keep it as one effect and add `refreshTrainingPlan();` before the effect closes.

### 4.5 Merge training blocks into calendar events

- [ ] Create derived training events and use them in the existing event lists.

```javascript
const trainingEvents = (trainingPlan?.blocks || []).map(trainingBlockToCalendarEvent);
const allEvents = [...events, ...trainingEvents];
```

- [ ] Ensure existing `displayEvents`, week maps, and day cards use this merged `allEvents` value.

### 4.6 Add local training planner controls

- [ ] Add this component in `CalendarDashboard.jsx` near `WeekCommandMap`.

```javascript
function TrainingPlanPanel({
  trainingPlan,
  trainingPlanError,
  trainingPlanBusy,
  onSaveLocalCopy,
  onMoveForward,
  onRecoveryOnly,
}) {
  const blocks = trainingPlan?.blocks || [];
  const conflicts = trainingPlan?.conflicts || [];

  return (
    <section className="data-panel training-plan-panel">
      <div className="panel-heading">
        <p className="micro-label">PHOENIX TRAINING LAYER</p>
        <strong>{blocks.length} planned blocks</strong>
        <span>{conflicts.length} conflicts</span>
      </div>
      {trainingPlanError ? <p className="data-error">{trainingPlanError}</p> : null}
      <div className="training-plan-list">
        {blocks.map((block) => {
          const isGenerated = String(block.block_id).startsWith('generated-');
          return (
            <article className="training-plan-row" key={block.block_id}>
              <div>
                <strong>{block.title}</strong>
                <span>{block.date}{block.time_start ? ` / ${block.time_start}` : ''}</span>
              </div>
              <div className="training-plan-actions">
                {isGenerated ? (
                  <button
                    className="mini-btn"
                    disabled={trainingPlanBusy}
                    onClick={() => onSaveLocalCopy(block)}
                  >
                    SAVE LOCAL COPY
                  </button>
                ) : (
                  <>
                    <button
                      className="mini-btn"
                      disabled={trainingPlanBusy}
                      onClick={() => onMoveForward(block)}
                    >
                      MOVE +1 DAY
                    </button>
                    <button
                      className="mini-btn"
                      disabled={trainingPlanBusy}
                      onClick={() => onRecoveryOnly(block)}
                    >
                      RECOVERY ONLY
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] Add these handlers inside `CalendarDashboard`.

```javascript
const saveLocalTrainingCopy = async (block) => {
  setTrainingPlanBusy(true);
  try {
    await postTrainingCalendarBlock({
      date: block.date,
      time_start: block.time_start,
      time_end: block.time_end,
      session_type: block.session_type || 'general',
      source: 'manual',
      status: 'planned',
      title: block.title || 'Training block',
      notes: block.notes || null,
    });
    await refreshTrainingPlan();
  } finally {
    setTrainingPlanBusy(false);
  }
};

const moveTrainingForward = async (block) => {
  setTrainingPlanBusy(true);
  try {
    await patchTrainingCalendarBlock(block.block_id, {
      date: addDays(block.date, 1),
      source: 'moved',
      status: 'moved',
    });
    await refreshTrainingPlan();
  } finally {
    setTrainingPlanBusy(false);
  }
};

const markTrainingRecoveryOnly = async (block) => {
  setTrainingPlanBusy(true);
  try {
    await patchTrainingCalendarBlock(block.block_id, {
      session_type: 'iso_only',
      status: 'recovery_only',
      title: block.title || 'Recovery only',
    });
    await refreshTrainingPlan();
  } finally {
    setTrainingPlanBusy(false);
  }
};
```

- [ ] Render the panel in the calendar command area near `WeekCommandMap`.

```jsx
<TrainingPlanPanel
  trainingPlan={trainingPlan}
  trainingPlanError={trainingPlanError}
  trainingPlanBusy={trainingPlanBusy}
  onSaveLocalCopy={saveLocalTrainingCopy}
  onMoveForward={moveTrainingForward}
  onRecoveryOnly={markTrainingRecoveryOnly}
/>
```

### 4.7 Add compact styles

- [ ] Add this CSS to `pwa/src/components/cockpit/cockpit.css`, where `CalendarDashboard.jsx` receives cockpit and calendar styling through `CockpitPrimitives`.

```css
.training-plan-panel {
  display: grid;
  gap: 12px;
}

.training-plan-list {
  display: grid;
  gap: 8px;
}

.training-plan-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.12));
  border-radius: 8px;
}

.training-plan-row span {
  display: block;
  margin-top: 4px;
  font-size: 0.78rem;
  opacity: 0.72;
}

.training-plan-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

@media (max-width: 720px) {
  .training-plan-row {
    grid-template-columns: 1fr;
  }

  .training-plan-actions {
    justify-content: flex-start;
  }
}
```

### 4.8 Verify calendar UI task

- [ ] Run:

```powershell
cd pwa
npm test -- src/components/calendar/calendarUiContract.test.js
```

Expected result: calendar UI contract passes.

- [ ] Run:

```powershell
cd pwa
npm test
```

Expected result: all PWA tests pass.

- [ ] Commit after this task:

```powershell
git status --short
git add pwa/src/components/calendar/CalendarDashboard.jsx pwa/src/components/calendar/calendarUiContract.test.js
git commit -m "Show editable training layer on calendar"
```

---

## Task 5: Add Training Dashboard Entry Point

**Files:**

- `pwa/src/App.jsx`
- `pwa/src/components/training/TrainingMetrics.jsx`
- `pwa/src/components/training/trainingUiContract.test.js`

### 5.1 Add failing UI contract checks

- [ ] Extend `pwa/src/components/training/trainingUiContract.test.js` with this test.

```javascript
test('training dashboard exposes calendar planner entry point', () => {
  assert.match(metrics, /OPEN CALENDAR PLAN/);
  assert.match(metrics, /onCalendarPlan/);
});
```

- [ ] Add this check to the existing `pwa/src/App.jsx` contract test if one exists. If there is no App contract test, create `pwa/src/AppContract.test.js`.

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');

test('app wires training calendar planner navigation', () => {
  assert.match(source, /onCalendarPlan/);
  assert.match(source, /switchTab\('calendar'\)/);
});
```

- [ ] Run:

```powershell
cd pwa
npm test -- src/components/training/trainingUiContract.test.js src/AppContract.test.js
```

Expected result before implementation: failure because the entry point is missing.

### 5.2 Wire App navigation

- [ ] In `pwa/src/App.jsx`, find the `TrainingMetrics` render and add this prop.

```jsx
onCalendarPlan={() => switchTab('calendar')}
```

### 5.3 Add the button in TrainingMetrics

- [ ] In `pwa/src/components/training/TrainingMetrics.jsx`, include `onCalendarPlan` in the component props.

```javascript
export default function TrainingMetrics({ onBack, onNav, onCalendarPlan }) {
```

- [ ] Near the existing `TUNE TODAY'S SESSION` action, add:

```jsx
<button className="module-action" type="button" onClick={onCalendarPlan}>
  OPEN CALENDAR PLAN
</button>
```

### 5.4 Verify training entry point task

- [ ] Run:

```powershell
cd pwa
npm test -- src/components/training/trainingUiContract.test.js src/AppContract.test.js
```

Expected result: targeted PWA tests pass.

- [ ] Run:

```powershell
cd pwa
npm test
```

Expected result: all PWA tests pass.

- [ ] Commit after this task:

```powershell
git status --short
git add pwa/src/App.jsx pwa/src/AppContract.test.js pwa/src/components/training/TrainingMetrics.jsx pwa/src/components/training/trainingUiContract.test.js
git commit -m "Link training dashboard to calendar planner"
```

---

## Task 6: End-To-End Verification

### 6.1 Backend verification

- [ ] Run targeted backend tests:

```powershell
pytest jarvis/data/tests/test_database.py jarvis/api/tests/test_training_routes.py -q
```

Expected result: targeted backend tests pass.

- [ ] Run full backend test suite:

```powershell
pytest -q
```

Expected result: full backend suite passes. Previous full-suite baseline was `783 passed` with a long runtime near six minutes.

### 6.2 Frontend verification

- [ ] Run PWA tests:

```powershell
cd pwa
npm test
```

Expected result: all PWA tests pass. Previous baseline was `46 passed`.

- [ ] Build PWA:

```powershell
cd pwa
npm run build
```

Expected result: build succeeds. A chunk-size warning is acceptable because it existed in the baseline.

### 6.3 Manual local smoke check

- [ ] Start or reuse the dev server:

```powershell
cd pwa
npm run dev -- --host 127.0.0.1
```

- [ ] Open `http://127.0.0.1:5180/`.
- [ ] Navigate to Calendar.
- [ ] Confirm the calendar still shows source opera events.
- [ ] Confirm `PHOENIX TRAINING LAYER` appears.
- [ ] Click `SAVE LOCAL COPY` on a generated block.
- [ ] Confirm the block remains visible as a local editable block.
- [ ] Click `MOVE +1 DAY`.
- [ ] Confirm the block date changes by one day.
- [ ] Click `RECOVERY ONLY`.
- [ ] Confirm the row status/location displays recovery-only treatment.
- [ ] Navigate to Training.
- [ ] Click `OPEN CALENDAR PLAN`.
- [ ] Confirm the app switches to Calendar.

### 6.4 Final status check

- [ ] Run:

```powershell
git status --short
git log --oneline -5
```

- [ ] Confirm only intentional files for this slice are changed or committed. Unrelated pre-existing dirty files can remain dirty and must not be reverted.

---

## Completion Criteria

- Local training calendar blocks persist in SQLite.
- `GET /training/calendar-plan` returns generated blocks, local blocks, merged blocks, conflict projections, and read-only source metadata.
- Users can create a local copy of generated training, move local training by one day, and mark local training recovery-only from the calendar UI.
- Training dashboard has a direct `OPEN CALENDAR PLAN` entry point.
- Targeted backend tests pass.
- Full PWA tests pass.
- PWA build passes.
- Full backend suite passes or any failure is clearly unrelated and documented with exact failing test names and output.
