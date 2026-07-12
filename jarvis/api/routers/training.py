"""Training API routes. Routers call engines; no business logic lives here."""

from datetime import date, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from jarvis.api.dependencies import get_training_constitution
from jarvis.api import ai_gateway
from jarvis.core import clock
from jarvis.data import database
from jarvis.domains.calendar.tests.fixtures import LIVE_SNAPSHOT_RAW
from jarvis.domains.training import engine, joint_capacity, progression
from jarvis.domains.training.data_contracts import (
    BodyAreaDiscomfort,
    PlannedSession,
    ReadinessScan,
    TrainingConflict,
    TrainingStatus,
)

router = APIRouter()

_SESSION_DISPLAY = {
    "high_intensity": "HIGH INTENSITY (Lower)",
    "general": "UPPER BODY (General)",
    "jump": "JUMP SESSION",
    "iso_only": "ISO ONLY",
    "rest": "REST",
    "deload": "DELOAD",
    "peak": "PEAK SESSION",
    "attempt": "DUNK ATTEMPT",
}


class ExerciseSetLog(BaseModel):
    reps: int = Field(ge=0)
    weight_kg: float = Field(ge=0)
    target_reps: int | None = Field(default=None, ge=1)


class ExerciseLog(BaseModel):
    name: str = Field(min_length=1)
    sets: list[ExerciseSetLog] = Field(min_length=1)
    target_reps: int | None = Field(default=None, ge=1)
    body_region: Literal["upper", "lower"] | None = None


class SessionLogRequest(BaseModel):
    date: date
    session_type: Literal["Push", "Pull", "Legs", "Upper", "Lower"]
    week_number: int | None = Field(default=None, ge=1, le=10)
    exercises: list[ExerciseLog] = Field(min_length=1)
    notes: str | None = None


class JumpLogRequest(BaseModel):
    date: date
    jump_type: Literal["approach", "standing"]
    height_cm: float = Field(gt=0, le=200)
    notes: str | None = None


class ReadinessScanRequest(BaseModel):
    knee: int = Field(ge=0, le=10)
    ankle: int = Field(ge=0, le=10)
    hip: int = Field(ge=0, le=10)
    hamstring: int = Field(ge=0, le=10)
    calf_achilles: int = Field(ge=0, le=10)
    lower_back_pelvic: int = Field(ge=0, le=10)
    note: str | None = Field(default=None, max_length=500)
    sharp_pain: bool = False
    limping: bool = False
    next_day_worsening: bool = False


class CapacityBlockLogRequest(BaseModel):
    block_key: Literal[
        "sled_balance", "squat_balance", "pelvic_control", "jump_balance", "recovery_reset"
    ]
    completed: bool
    minutes: int | None = Field(default=None, ge=1, le=180)
    notes: str | None = Field(default=None, max_length=500)


class JumpBalanceLogRequest(BaseModel):
    plant_pattern: Literal[
        "one_foot_left", "one_foot_right", "two_foot_left_right", "two_foot_right_left"
    ]
    rep_count: int = Field(ge=1, le=10)
    jump_variant: Literal["arms_free", "ball_in_hand"]
    height_cm: float | None = Field(default=None, gt=0, le=400)
    video_note: str | None = Field(default=None, max_length=500)
    quality: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = Field(default=None, max_length=500)

_TRAINING_BRIEF_SYSTEM = """\
You are PHOENIX, a personal training assistant following the Isiah Rivera Long Conjugate Sequence System. You are concise, direct, and motivating without being cheesy. Maximum 4 sentences. Always end with the session type for today. Never invent data.\
"""


def _fmt(name: str) -> str:
    """snake_case → Title Case display name."""
    return name.replace("_", " ").title()


def _resolve_exercises(session: dict, constitution: dict) -> list[dict]:
    """Build a display-ready exercise list from a serialized session + constitution."""
    stype = session.get("session_type", "")
    ww = session.get("working_weights")
    phase = session.get("phase", "month_1")
    meso = constitution.get("mesocycle_progression", {}).get(phase, {})

    if stype == "high_intensity" and ww:
        sets = ww["sets"]
        reps = ww["reps"]
        return [
            {"name": _fmt(ww["explosive_exercise"]),       "label": f'{ww["explosive_kg"]}kg',       "sets_reps": f'{sets}×{reps}'},
            {"name": _fmt(ww["knee_extension_exercise"]),  "label": f'{ww["knee_extension_kg"]}kg',  "sets_reps": f'{sets}×{reps}'},
            {"name": _fmt(ww["posterior_chain_exercise"]), "label": f'{ww["posterior_chain_kg"]}kg', "sets_reps": f'{sets}×{reps}'},
            {"name": _fmt(ww["lower_leg_exercise"]),       "label": f'{ww["lower_leg_kg"]}kg',       "sets_reps": f'{sets}×{reps}'},
        ]

    if stype == "general":
        iso = constitution.get("iso_protocol", {})
        iso_label = f'{iso.get("sets","3-5")}×{iso.get("duration_seconds","30")}s'
        return [
            {"name": "Shoulder Rehab",                           "label": "Pre-hab",   "sets_reps": iso_label},
            {"name": _fmt(meso.get("general_push", "bench_press")), "label": "Hypertrophy", "sets_reps": "3×10"},
            {"name": _fmt(meso.get("general_pull", "lat_pulldown")), "label": "Hypertrophy", "sets_reps": "3×10"},
            {"name": _fmt(meso.get("general_shoulder", "lateral_raise")), "label": "Hypertrophy", "sets_reps": "3×15"},
        ]

    if stype in ("iso_only", "peak", "attempt"):
        iso = constitution.get("iso_protocol", {})
        iso_label = f'{iso.get("sets","3-5")}×{iso.get("duration_seconds","30")}s @ {iso.get("effort_pct",70)}%'
        return [{"name": "Knee Extension Isometrics", "label": iso_label, "sets_reps": ""}]

    if stype == "jump":
        return [
            {"name": "Knee Extension ISO",    "label": "Activation", "sets_reps": ""},
            {"name": "Dynamic Flexibility",   "label": "Warmup",     "sets_reps": ""},
            {"name": "Sprint Development",    "label": "CNS Primer", "sets_reps": ""},
            {"name": "Jumps 10→100%",         "label": "Ramp",       "sets_reps": ""},
            {"name": "Max Approach Jumps",    "label": "MAX",        "sets_reps": ""},
        ]

    return []


def _serialize_working_weights(ww) -> dict | None:
    if ww is None:
        return None
    return {
        "explosive_exercise": ww.explosive_exercise,
        "explosive_kg": ww.explosive_kg,
        "knee_extension_exercise": ww.knee_extension_exercise,
        "knee_extension_kg": ww.knee_extension_kg,
        "posterior_chain_exercise": ww.posterior_chain_exercise,
        "posterior_chain_kg": ww.posterior_chain_kg,
        "lower_leg_exercise": ww.lower_leg_exercise,
        "lower_leg_kg": ww.lower_leg_kg,
        "sets": ww.sets,
        "reps": ww.reps,
        "intensity_pct": ww.intensity_pct,
        "top_set_note": ww.top_set_note,
    }


def _serialize_session(s: PlannedSession) -> dict:
    v = s.session_type.value
    return {
        "date": s.date.isoformat(),
        "session_type": v,
        "display_name": _SESSION_DISPLAY.get(v, v.upper()),
        "phase": s.phase.value,
        "week_of_mesocycle": s.week_of_mesocycle,
        "working_weights": _serialize_working_weights(s.working_weights),
        "session_order": s.session_order,
        "notes": s.notes,
    }


def _serialize_conflict(c: TrainingConflict) -> dict:
    return {
        "conflict_type": c.conflict_type,
        "severity": c.severity,
        "training_date": c.training_date.isoformat(),
        "session_type": c.session_type.value,
        "opera_event_title": c.opera_event_title,
        "opera_event_date": c.opera_event_date.isoformat(),
        "detail": c.detail,
        "suggestion": c.suggestion,
    }


def _serialize_status(status: TrainingStatus) -> dict:
    g = status.dunk_goal
    c = status.cut_status
    return {
        "as_of": status.as_of.isoformat(),
        "dunk_goal": {
            "deadline": g.deadline.isoformat(),
            "attempt_window_start": g.attempt_window_start.isoformat(),
            "days_to_attempt": g.days_to_attempt,
            "days_to_deadline": g.days_to_deadline,
            "weeks_to_attempt": round(g.weeks_to_attempt, 2),
            "current_phase": g.current_phase.value,
            "current_mesocycle_week": g.current_mesocycle_week,
            "on_track": g.on_track,
        },
        "cut_status": {
            "active": c.active,
            "end_date": c.end_date.isoformat(),
            "days_remaining": c.days_remaining,
            "current_bodyweight_kg": c.current_bodyweight_kg,
            "current_bf_pct": c.current_bf_pct,
            "target_bf_pct": c.target_bf_pct,
            "estimated_fat_to_lose_kg": c.estimated_fat_to_lose_kg,
        },
        "today_session": _serialize_session(status.today_session),
        "week_sessions": [_serialize_session(s) for s in status.week_sessions],
        "conflicts": [_serialize_conflict(c) for c in status.conflicts],
        "has_hard_conflicts": status.has_hard_conflicts,
        "fatigue_warning": status.fatigue_warning,
    }


def _scan_from_values(values: dict[str, Any] | ReadinessScanRequest) -> ReadinessScan:
    get = values.get if isinstance(values, dict) else lambda key, default=None: getattr(values, key, default)
    return ReadinessScan(
        discomfort=BodyAreaDiscomfort(
            knee=get("knee"),
            ankle=get("ankle"),
            hip=get("hip"),
            hamstring=get("hamstring"),
            calf_achilles=get("calf_achilles"),
            lower_back_pelvic=get("lower_back_pelvic"),
        ),
        note=get("note"),
        sharp_pain=bool(get("sharp_pain", False)),
        limping=bool(get("limping", False)),
        next_day_worsening=bool(get("next_day_worsening", False)),
    )


def _serialize_route(result) -> dict:
    return {
        "readiness_status": result.readiness_status.value,
        "readiness_required": result.readiness_required,
        "high_neural_allowed": result.high_neural_allowed,
        "planned_session": result.planned_session,
        "capacity_blocks": [
            {
                "key": block.key,
                "label": block.label,
                "purpose": block.purpose,
                "exercises": list(block.exercises),
            }
            for block in result.capacity_blocks
        ],
        "substitutions": [
            {"area": item.area, "reason": item.reason, "action": item.action}
            for item in result.substitutions
        ],
        "show_jump_balance": result.show_jump_balance,
        "show_recovery_reset": result.show_recovery_reset,
        "safety_note": result.safety_note,
    }


def _current_status(constitution: dict) -> tuple[TrainingStatus, dict]:
    latest_kg = database.get_latest_weight_kg()
    effective = (
        {**constitution, "current_bodyweight_kg": latest_kg} if latest_kg else constitution
    )
    status = engine.check_training(
        effective,
        today=clock.today(),
        opera_snapshot_raw=LIVE_SNAPSHOT_RAW,
    )
    return status, effective


def _build_brief_user_message(status: dict) -> str:
    g = status["dunk_goal"]
    c = status["cut_status"]
    sess = status["today_session"]
    ww = sess.get("working_weights")

    lines = [
        f"Training status as of {status['as_of']}:",
        f"Phase: {g['current_phase']}, week {g['current_mesocycle_week']} of mesocycle",
        f"Days to dunk attempt: {g['days_to_attempt']} ({g['weeks_to_attempt']:.1f} weeks)",
        "",
        f"Today: {sess['session_type'].upper()} session",
    ]

    if ww:
        lines += [
            f"Working weights ({ww['intensity_pct']}% intensity, {ww['sets']}×{ww['reps']}):",
            f"  {ww['explosive_exercise']}: {ww['explosive_kg']}kg",
            f"  {ww['knee_extension_exercise']}: {ww['knee_extension_kg']}kg",
            f"  {ww['posterior_chain_exercise']}: {ww['posterior_chain_kg']}kg",
            f"  {ww['lower_leg_exercise']}: {ww['lower_leg_kg']}kg",
            f"  {ww['top_set_note']}",
        ]

    lines += [
        "",
        f"Cut: {'active' if c['active'] else 'ended'}. {c['days_remaining']} days remaining.",
        f"Body fat: {c['current_bf_pct']}% → target {c['target_bf_pct']}%"
        f" ({c['estimated_fat_to_lose_kg']}kg to lose)",
    ]

    if status["has_hard_conflicts"]:
        lines.append(f"⚠ CONFLICT: {status['conflicts'][0]['detail']}")
    elif status["fatigue_warning"]:
        lines.append(f"Note: {status['fatigue_warning']}")

    lines += ["", "Provide a brief, direct training summary for today."]
    return "\n".join(lines)


@router.get("/status")
def training_status(
    constitution: dict = Depends(get_training_constitution),
) -> dict:
    status, constitution = _current_status(constitution)
    result = _serialize_status(status)
    result["today_session"]["exercises"] = _resolve_exercises(result["today_session"], constitution)

    weight_history_raw = database.get_weight_history(days=90)
    wh = [{"date": e["log_date"], "weight_kg": e["weight_kg"]} for e in weight_history_raw]
    result["cut_status"]["weight_history"] = wh

    weekly_delta_kg = None
    avg_weekly_loss_kg = None
    if len(wh) >= 2:
        latest_w = wh[-1]["weight_kg"]
        cutoff_date = (clock.today() - timedelta(days=8)).isoformat()
        older_w = next((e["weight_kg"] for e in reversed(wh[:-1]) if e["date"] <= cutoff_date), None)
        if older_w is not None:
            weekly_delta_kg = round(latest_w - older_w, 2)
        days_span = (date.fromisoformat(wh[-1]["date"]) - date.fromisoformat(wh[0]["date"])).days
        if days_span >= 7:
            avg_weekly_loss_kg = round((wh[0]["weight_kg"] - latest_w) / (days_span / 7), 2)
    result["cut_status"]["weekly_delta_kg"] = weekly_delta_kg
    result["cut_status"]["avg_weekly_loss_kg"] = avg_weekly_loss_kg

    return result


@router.post("/readiness-scan")
def create_readiness_scan(request: ReadinessScanRequest) -> dict:
    scan = _scan_from_values(request)
    status = joint_capacity.classify_readiness(scan)
    payload = request.model_dump()
    payload.update(
        {
            "scan_date": clock.today().isoformat(),
            "readiness_status": status.value,
        }
    )
    scan_id = database.save_training_readiness_scan(payload)
    return {"status": "logged", "scan_id": scan_id, **payload}


@router.get("/routed-session")
def routed_training_session(
    explicit_reset: bool = False,
    constitution: dict = Depends(get_training_constitution),
) -> dict:
    status, effective = _current_status(constitution)
    session = _serialize_session(status.today_session)
    session["exercises"] = _resolve_exercises(session, effective)
    row = database.get_latest_training_readiness_scan(clock.today().isoformat())
    scan = _scan_from_values(row) if row else None
    route = joint_capacity.route_session(session, scan, explicit_reset=explicit_reset)
    result = _serialize_route(route)
    result["readiness_scan"] = row
    return result


@router.post("/log/session")
def create_session_log(request: SessionLogRequest) -> dict:
    session_id = database.log_session(
        session_date=request.date,
        session_type=request.session_type,
        week_number=request.week_number,
        exercises=[exercise.model_dump(exclude_none=True) for exercise in request.exercises],
        notes=request.notes,
    )
    return {
        "status": "logged",
        "session_id": session_id,
        "date": request.date.isoformat(),
    }


@router.post("/log/jump")
def create_jump_log(request: JumpLogRequest) -> dict:
    jump_id = database.log_jump(
        jump_date=request.date,
        jump_type=request.jump_type,
        height_cm=request.height_cm,
        notes=request.notes,
    )
    return {
        "status": "logged",
        "jump_id": jump_id,
        "date": request.date.isoformat(),
    }


@router.post("/log/capacity-block")
def create_capacity_block_log(request: CapacityBlockLogRequest) -> dict:
    capacity_log_id = database.save_training_capacity_log(
        {
            "log_date": clock.today().isoformat(),
            "block_key": request.block_key,
            "completion": {
                "completed": request.completed,
                **({"minutes": request.minutes} if request.minutes is not None else {}),
            },
            "notes": request.notes,
        }
    )
    return {"status": "logged", "capacity_log_id": capacity_log_id}


@router.post("/log/jump-balance")
def create_jump_balance_log(request: JumpBalanceLogRequest) -> dict:
    jump_balance_log_id = database.save_training_jump_balance_log(
        {
            "log_date": clock.today().isoformat(),
            **request.model_dump(),
        }
    )
    return {"status": "logged", "jump_balance_log_id": jump_balance_log_id}


@router.get("/history")
def training_history() -> dict:
    sessions = database.get_sessions()
    jumps = database.get_jumps()
    return {
        "sessions": sessions,
        "jump_progression": progression.build_jump_progression(jumps),
        "next_week_suggestions": progression.get_next_week_suggestions(sessions),
        "readiness_scans": database.list_training_readiness_scans(),
        "capacity_logs": database.list_training_capacity_logs(),
        "jump_balance_logs": database.list_training_jump_balance_logs(),
    }


@router.get("/brief")
def training_brief(
    constitution: dict = Depends(get_training_constitution),
) -> dict:
    status = engine.check_training(
        constitution,
        today=clock.today(),
        opera_snapshot_raw=LIVE_SNAPSHOT_RAW,
    )
    status_dict = _serialize_status(status)
    user_message = _build_brief_user_message(status_dict)

    try:
        result = ai_gateway.generate_text(
            system_prompt=_TRAINING_BRIEF_SYSTEM,
            messages=[{"role": "user", "content": user_message}],
            max_tokens=256,
        )
        brief_text = result.text if result.ok else (
            "AI training brief unavailable. Raw training status available via /training/status."
        )
    except Exception:
        brief_text = (
            "Unable to generate brief. "
            "Raw training status available via /training/status."
        )

    return {"brief": brief_text, "requires_approval": True}


class SleepLogRequest(BaseModel):
    event_type: Literal["bedtime", "wakeup"]


class SleepDurationRequest(BaseModel):
    minutes: int = Field(ge=60, le=960)


class SorenessLogRequest(BaseModel):
    score: int = Field(ge=0, le=5)


@router.post("/log/sleep")
def log_sleep(request: SleepLogRequest) -> dict:
    event_id = database.log_sleep_event(request.event_type)
    return {"status": "logged", "event_type": request.event_type, "id": event_id}


@router.post("/log/sleep-duration")
def log_sleep_duration(request: SleepDurationRequest) -> dict:
    """Duration-based sleep log: stores a backdated bedtime→wakeup pair."""
    pair = database.log_sleep_duration(request.minutes)
    return {"status": "logged", "minutes": request.minutes, **pair}


@router.post("/log/soreness")
def log_soreness(request: SorenessLogRequest) -> dict:
    row_id = database.log_soreness(request.score)
    return {"status": "logged", "score": request.score, "id": row_id}


@router.get("/recovery")
def get_recovery() -> dict:
    sleep = database.get_last_sleep()
    soreness = database.get_last_soreness()
    sleep_score = sleep["score"] if sleep else None
    soreness_score = soreness["pct"] if soreness else None
    scores = [s for s in [sleep_score, soreness_score] if s is not None]
    overall = int(sum(scores) / len(scores)) if scores else None
    return {
        "overall": overall,
        "sleep": {"available": bool(sleep), **(sleep or {})},
        "soreness": {"available": bool(soreness), **(soreness or {})},
    }
