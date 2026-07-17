import json
from datetime import date, timedelta

import pytest

from jarvis.domains.training.plan_acceptance import (
    evaluate_training_shadow,
    replay_training_plan,
    training_planner_acceptance_status,
    training_planner_mode,
)
from jarvis.domains.training.plan_contracts import (
    PlanDay,
    PlanValidation,
    TrainingConstraint,
    WeeklyPlanReceipt,
    iso_cycle_id,
)


REQUIRED_FIXTURE_CATEGORIES = (
    "move",
    "skip",
    "equipment-limited",
    "fatigue-reduced",
    "calendar-blocked",
    "pain-blocked",
)


def _serialize_receipt(receipt: WeeklyPlanReceipt, *, fixture_category: str) -> dict:
    return {
        "plan_id": receipt.plan_id,
        "parent_plan_id": receipt.parent_plan_id,
        "constitution_version": receipt.constitution_version,
        "planner_version": receipt.planner_version,
        "cycle_id": receipt.cycle_id,
        "days": [
            {
                "date": day.date.isoformat(),
                "session_type": day.session_type,
                "objective": day.objective,
                "exercises": [dict(exercise) for exercise in day.exercises],
                "estimated_minutes": day.estimated_minutes,
                "change_reason": day.change_reason,
            }
            for day in receipt.days
        ],
        "constraints": [
            {
                "kind": constraint.kind,
                "source": constraint.source,
                "values": dict(constraint.values),
            }
            for constraint in receipt.constraints
        ],
        "validations": [
            {
                "rule": validation.rule,
                "passed": validation.passed,
                "severity": validation.severity,
                "detail": validation.detail,
            }
            for validation in receipt.validations
        ],
        "created_at": receipt.created_at,
        "status": receipt.status,
        "input_hash": receipt.input_hash,
        "receipt_hash": receipt.receipt_hash,
        "fixture_category": fixture_category,
        "side_effects": {
            "direct_execution_count": 0,
            "session_log_write_count": 0,
            "calendar_action_write_count": 0,
        },
    }


def shadow_receipt(
    *,
    fixture_category: str = "move",
    week_start: date = date(2026, 7, 20),
    hard_failure: bool = False,
    hard_validation_passed=None,
    status: str = "proposed",
    planner_version: str = "adaptive-v1",
    constitution_version: str = "1",
    pain_blocked_work: bool = False,
    recovery_violation: bool = False,
) -> dict:
    high_neural_offsets = {0, 2, 5}
    if recovery_violation:
        high_neural_offsets.add(1)
    constraints_by_category = {
        "move": TrainingConstraint.from_mapping(
            "move_session",
            "user",
            {
                "source_date": week_start.isoformat(),
                "target_date": (week_start + timedelta(days=1)).isoformat(),
            },
        ),
        "skip": TrainingConstraint.from_mapping(
            "skip_session", "user", {"date": week_start.isoformat()}
        ),
        "equipment-limited": TrainingConstraint.from_mapping(
            "equipment_available",
            "user",
            {"date": week_start.isoformat(), "equipment": ("barbell",)},
        ),
        "fatigue-reduced": TrainingConstraint.from_mapping(
            "time_limit", "phoenix", {"date": week_start.isoformat(), "minutes": 30}
        ),
    }

    def plan_day(offset: int) -> PlanDay:
        day = week_start + timedelta(days=offset)
        if fixture_category == "pain-blocked" and not pain_blocked_work:
            return PlanDay(
                date=day,
                session_type="recovery",
                objective="pain_safe_recovery",
                exercises=(),
                estimated_minutes=0,
                change_reason="hard_pain_block" if offset == 0 else None,
            )
        if fixture_category == "pain-blocked" and pain_blocked_work and offset == 0:
            return PlanDay(
                date=day,
                session_type="general",
                objective="general_strength",
                exercises=({"name": "bench_press", "load_kg": 40},),
                estimated_minutes=60,
                change_reason="hard_pain_block",
            )
        if fixture_category == "calendar-blocked" and offset == 0:
            return PlanDay(
                date=day,
                session_type="recovery",
                objective="calendar_recovery",
                exercises=(),
                estimated_minutes=0,
                change_reason="calendar_hard_conflict",
            )
        if offset in high_neural_offsets:
            return PlanDay(
                date=day,
                session_type="high_intensity" if offset != 5 else "jump",
                objective="jump_strength",
                exercises=({"name": "hex_bar_jump"},),
                estimated_minutes=60,
            )
        return PlanDay(
            date=day,
            session_type="rest",
            objective="recovery",
            exercises=(),
            estimated_minutes=0,
        )

    receipt = WeeklyPlanReceipt.create(
        parent_plan_id=None,
        constitution_version=constitution_version,
        planner_version=planner_version,
        cycle_id=iso_cycle_id(week_start),
        days=tuple(plan_day(offset) for offset in range(7)),
        constraints=(constraints_by_category[fixture_category],)
        if fixture_category in constraints_by_category
        else (),
        validations=(
            PlanValidation(
                rule="seven_unique_days",
                passed=(
                    not hard_failure
                    if hard_validation_passed is None
                    else hard_validation_passed
                ),
                severity="hard",
                detail="Plan contains seven unique dates",
            ),
        ),
        created_at="2026-07-20T06:00:00+00:00",
        status=status,
    )
    return _serialize_receipt(receipt, fixture_category=fixture_category)


def required_shadow_receipts() -> list[dict]:
    return [
        shadow_receipt(
            fixture_category=category,
            week_start=date(2026, 7, 20) + timedelta(weeks=index),
        )
        for index, category in enumerate(REQUIRED_FIXTURE_CATEGORIES)
    ]


def acceptance_evidence(**overrides) -> dict:
    evidence = {
        "accepted": True,
        "planner_version": "adaptive-v1",
        "constitution_version": "1",
        "evidence_id": "training-shadow-2026-07-17",
        "fixture_summary": {category: 1 for category in REQUIRED_FIXTURE_CATEGORIES},
    }
    evidence.update(overrides)
    return evidence


@pytest.fixture
def active_plan_fixture() -> dict:
    return shadow_receipt(status="active")


def test_serialized_plan_replays_to_identical_hash(active_plan_fixture):
    replayed = replay_training_plan(json.loads(json.dumps(active_plan_fixture)))
    assert replayed.receipt_hash == active_plan_fixture["receipt_hash"]
    assert replayed.input_hash == active_plan_fixture["input_hash"]


def test_replay_rejects_tampered_serialized_receipt(active_plan_fixture):
    active_plan_fixture["days"][0]["objective"] = "tampered"

    with pytest.raises(ValueError, match="canonical replay"):
        replay_training_plan(active_plan_fixture)


def test_live_mode_requires_accepted_current_versions(monkeypatch):
    monkeypatch.setenv("PHOENIX_TRAINING_PLANNER_MODE", "live")
    monkeypatch.delenv("PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON", raising=False)
    assert training_planner_acceptance_status()["accepted"] is False


@pytest.mark.parametrize(
    "evidence",
    (
        "not-json",
        "{}",
        "[]",
        json.dumps(acceptance_evidence(accepted=False)),
        json.dumps(acceptance_evidence(planner_version="adaptive-v0")),
        json.dumps(acceptance_evidence(constitution_version="0")),
        json.dumps(acceptance_evidence(evidence_id=" ")),
        json.dumps(acceptance_evidence(fixture_summary={})),
        json.dumps(acceptance_evidence(fixture_summary={"move": 0})),
    ),
)
def test_acceptance_json_fails_closed_for_invalid_evidence(monkeypatch, evidence):
    monkeypatch.setenv("PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON", evidence)

    assert training_planner_acceptance_status()["accepted"] is False


def test_acceptance_json_accepts_exact_current_evidence(monkeypatch):
    monkeypatch.setenv(
        "PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON",
        json.dumps(acceptance_evidence()),
    )

    status = training_planner_acceptance_status()

    assert status["accepted"] is True
    assert status["evidence_id"] == "training-shadow-2026-07-17"


def test_training_planner_mode_defaults_and_fails_closed_to_shadow(monkeypatch):
    monkeypatch.delenv("PHOENIX_TRAINING_PLANNER_MODE", raising=False)
    assert training_planner_mode() == "shadow"

    monkeypatch.setenv("PHOENIX_TRAINING_PLANNER_MODE", "LIVE")
    assert training_planner_mode() == "shadow"

    monkeypatch.setenv("PHOENIX_TRAINING_PLANNER_MODE", "live")
    assert training_planner_mode() == "live"


def test_shadow_gate_rejects_hard_rule_violation():
    result = evaluate_training_shadow([shadow_receipt(hard_failure=True)])
    assert result["accepted"] is False
    assert "hard_rule_violations" in result["reasons"]


def test_shadow_gate_requires_literal_true_for_hard_validation():
    receipts = required_shadow_receipts()
    receipts[0] = shadow_receipt(hard_validation_passed=0)

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is False
    assert "hard_rule_violations" in result["reasons"]


def test_shadow_gate_accepts_complete_current_side_effect_free_evidence():
    result = evaluate_training_shadow(required_shadow_receipts())

    assert result["accepted"] is True
    assert result["reasons"] == []
    assert result["fixture_summary"] == {
        category: 1 for category in REQUIRED_FIXTURE_CATEGORIES
    }
    assert result["evidence_id"]


def test_shadow_gate_requires_all_fixture_categories():
    result = evaluate_training_shadow(required_shadow_receipts()[:-1])

    assert result["accepted"] is False
    assert "fixture_coverage" in result["reasons"]


def test_shadow_gate_rejects_non_current_versions():
    receipts = required_shadow_receipts()
    receipts[0] = shadow_receipt(planner_version="adaptive-v0")

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is False
    assert "version_mismatch" in result["reasons"]


def test_shadow_gate_rejects_pain_blocked_loaded_work():
    receipts = required_shadow_receipts()
    receipts[-1] = shadow_receipt(
        fixture_category="pain-blocked",
        week_start=date(2026, 8, 24),
        pain_blocked_work=True,
    )

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is False
    assert "pain_blocked_work" in result["reasons"]


def test_shadow_gate_rejects_insufficient_recovery_spacing():
    receipts = required_shadow_receipts()
    receipts[0] = shadow_receipt(recovery_violation=True)

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is False
    assert "recovery_spacing" in result["reasons"]


def test_shadow_gate_rejects_multiple_plans_for_one_cycle():
    receipts = required_shadow_receipts()
    receipts[1] = shadow_receipt(
        fixture_category="skip",
        week_start=date(2026, 7, 20),
    )

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is False
    assert "multiple_plans_per_cycle" in result["reasons"]


@pytest.mark.parametrize(
    "side_effect_field",
    (
        "direct_execution_count",
        "session_log_write_count",
        "calendar_action_write_count",
    ),
)
def test_shadow_gate_rejects_side_effect_evidence(side_effect_field):
    receipts = required_shadow_receipts()
    receipts[0]["side_effects"][side_effect_field] = 1

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is False
    assert "side_effects_detected" in result["reasons"]


def test_shadow_gate_fails_closed_without_side_effect_evidence():
    receipts = required_shadow_receipts()
    receipts[0].pop("side_effects")

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is False
    assert "side_effects_detected" in result["reasons"]


def test_shadow_gate_rejects_receipt_that_cannot_replay():
    receipts = required_shadow_receipts()
    receipts[0]["input_hash"] = "tampered"

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is False
    assert "deterministic_replay_failed" in result["reasons"]
