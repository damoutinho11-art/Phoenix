"""Training API routes. Routers call engines; no business logic lives here."""

from datetime import date

import anthropic
from fastapi import APIRouter, Depends

from jarvis.api.dependencies import get_training_constitution
from jarvis.domains.calendar.tests.fixtures import LIVE_SNAPSHOT_RAW
from jarvis.domains.training import engine
from jarvis.domains.training.data_contracts import (
    PlannedSession,
    TrainingConflict,
    TrainingStatus,
)

router = APIRouter()

_TRAINING_BRIEF_SYSTEM = """\
You are J.A.R.V.I.S., a personal training assistant following the Isiah Rivera Long Conjugate Sequence System. You are concise, direct, and motivating without being cheesy. Maximum 4 sentences. Always end with the session type for today. Never invent data.\
"""


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
    return {
        "date": s.date.isoformat(),
        "session_type": s.session_type.value,
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
    status = engine.check_training(
        constitution,
        today=date.today(),
        opera_snapshot_raw=LIVE_SNAPSHOT_RAW,
    )
    return _serialize_status(status)


@router.get("/brief")
def training_brief(
    constitution: dict = Depends(get_training_constitution),
) -> dict:
    status = engine.check_training(
        constitution,
        today=date.today(),
        opera_snapshot_raw=LIVE_SNAPSHOT_RAW,
    )
    status_dict = _serialize_status(status)
    user_message = _build_brief_user_message(status_dict)

    try:
        client = anthropic.Anthropic()
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=256,
            system=_TRAINING_BRIEF_SYSTEM,
            messages=[{"role": "user", "content": user_message}],
        )
        brief_text = message.content[0].text
    except Exception:
        brief_text = (
            "Unable to generate brief. "
            "Raw training status available via /training/status."
        )

    return {"brief": brief_text, "requires_approval": True}
