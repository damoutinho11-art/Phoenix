"""Deterministic replay and promotion checks for adaptive Training plans."""

from __future__ import annotations

from collections import Counter
from datetime import date
import json
import os
from typing import Any, Mapping

from .plan_contracts import (
    PlanDay,
    PlanValidation,
    TrainingConstraint,
    WeeklyPlanReceipt,
    canonical_hash,
)

CURRENT_PLANNER_VERSION = "adaptive-v1"
CURRENT_CONSTITUTION_VERSION = "1"
REQUIRED_FIXTURE_CATEGORIES = (
    "move",
    "skip",
    "equipment-limited",
    "fatigue-reduced",
    "calendar-blocked",
    "pain-blocked",
)
_SIDE_EFFECT_FIELDS = (
    "direct_execution_count",
    "session_log_write_count",
    "calendar_action_write_count",
)
_HIGH_NEURAL_SESSION_TYPES = frozenset({"high_intensity", "jump", "peak", "attempt"})
_RECOVERY_EXERCISE_MARKERS = frozenset({"isometric", "mobility", "flexibility", "rehab"})
_EXPLICIT_LOAD_FIELDS = ("load_kg", "weight_kg", "weight", "load")
_MINIMUM_RECOVERY_HOURS = 36


def training_planner_mode() -> str:
    """Return the explicit planner authority mode, defaulting closed to shadow."""
    mode = os.environ.get("PHOENIX_TRAINING_PLANNER_MODE", "shadow")
    return mode if mode in {"shadow", "live"} else "shadow"


def replay_training_plan(receipt: Mapping[str, Any]) -> WeeklyPlanReceipt:
    """Reconstruct a serialized receipt through the canonical plan contract."""
    days = tuple(
        PlanDay(
            date=date.fromisoformat(day["date"]),
            session_type=day["session_type"],
            objective=day["objective"],
            exercises=tuple(day["exercises"]),
            estimated_minutes=day["estimated_minutes"],
            change_reason=day.get("change_reason"),
        )
        for day in receipt["days"]
    )
    constraints = tuple(
        TrainingConstraint.from_mapping(
            constraint["kind"], constraint["source"], constraint["values"]
        )
        for constraint in receipt["constraints"]
    )
    validations = tuple(
        PlanValidation(
            rule=validation["rule"],
            passed=validation["passed"],
            severity=validation["severity"],
            detail=validation["detail"],
        )
        for validation in receipt["validations"]
    )
    replayed = WeeklyPlanReceipt.create(
        parent_plan_id=receipt["parent_plan_id"],
        constitution_version=receipt["constitution_version"],
        planner_version=receipt["planner_version"],
        cycle_id=receipt["cycle_id"],
        days=days,
        constraints=constraints,
        validations=validations,
        created_at=receipt["created_at"],
        status=receipt["status"],
    )
    if (
        replayed.plan_id != receipt["plan_id"]
        or replayed.input_hash != receipt["input_hash"]
        or replayed.receipt_hash != receipt["receipt_hash"]
    ):
        raise ValueError("Training plan receipt hashes do not match canonical replay")
    return replayed


def training_planner_acceptance_status() -> dict[str, Any]:
    """Validate explicit, version-matched promotion evidence from the environment."""
    raw_evidence = os.environ.get("PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON")
    evidence: Mapping[str, Any] = {}
    reasons = []
    if raw_evidence is None:
        reasons.append("acceptance_evidence_missing")
    else:
        try:
            parsed = json.loads(raw_evidence)
        except (TypeError, json.JSONDecodeError):
            reasons.append("acceptance_evidence_invalid")
        else:
            if isinstance(parsed, Mapping):
                evidence = parsed
            else:
                reasons.append("acceptance_evidence_invalid")

    if evidence.get("accepted") is not True:
        reasons.append("acceptance_not_granted")
    if evidence.get("planner_version") != CURRENT_PLANNER_VERSION:
        reasons.append("planner_version_mismatch")
    if evidence.get("constitution_version") != CURRENT_CONSTITUTION_VERSION:
        reasons.append("constitution_version_mismatch")
    evidence_id = evidence.get("evidence_id")
    if not isinstance(evidence_id, str) or not evidence_id.strip():
        reasons.append("evidence_id_missing")
    fixture_summary = evidence.get("fixture_summary")
    if not _valid_fixture_summary(fixture_summary):
        reasons.append("fixture_summary_missing")

    return {
        "accepted": not reasons,
        "reasons": reasons,
        "planner_version": evidence.get("planner_version"),
        "constitution_version": evidence.get("constitution_version"),
        "evidence_id": evidence.get("evidence_id"),
        "fixture_summary": evidence.get("fixture_summary"),
    }


def _valid_fixture_summary(value: Any) -> bool:
    return bool(value) and isinstance(value, Mapping) and all(
        isinstance(category, str)
        and bool(category.strip())
        and type(count) is int
        and count > 0
        for category, count in value.items()
    )


def _side_effects_are_zero(receipt: Mapping[str, Any]) -> bool:
    side_effects = receipt.get("side_effects")
    return isinstance(side_effects, Mapping) and all(
        type(side_effects.get(field)) is int and side_effects[field] == 0
        for field in _SIDE_EFFECT_FIELDS
    )


def _has_explicit_load(exercise: Mapping[str, Any]) -> bool:
    for field in _EXPLICIT_LOAD_FIELDS:
        try:
            if float(exercise.get(field, 0)) > 0:
                return True
        except (TypeError, ValueError):
            return True
    return False


def _pain_fixture_is_safe(receipt: WeeklyPlanReceipt) -> bool:
    for day in receipt.days:
        if day.session_type in _HIGH_NEURAL_SESSION_TYPES:
            return False
        for exercise in day.exercises:
            if _has_explicit_load(exercise):
                return False
            name = str(exercise.get("name", "")).casefold().strip()
            if name and not any(marker in name for marker in _RECOVERY_EXERCISE_MARKERS):
                return False
    return True


def _has_minimum_recovery_spacing(receipt: WeeklyPlanReceipt) -> bool:
    high_neural_dates = sorted(
        day.date
        for day in receipt.days
        if day.session_type in _HIGH_NEURAL_SESSION_TYPES
    )
    return all(
        (later - earlier).total_seconds() / 3600 >= _MINIMUM_RECOVERY_HOURS
        for earlier, later in zip(high_neural_dates, high_neural_dates[1:])
    )


def evaluate_training_shadow(receipts: list[Mapping[str, Any]]) -> dict[str, Any]:
    """Evaluate replayable shadow receipts without granting plan authority."""
    fixture_counts = Counter(
        receipt.get("fixture_category")
        for receipt in receipts
        if isinstance(receipt.get("fixture_category"), str)
    )
    fixture_summary = {
        category: fixture_counts[category]
        for category in REQUIRED_FIXTURE_CATEGORIES
        if fixture_counts[category]
    }
    replay_failed = False
    version_mismatch = False
    hard_rule_violations = False
    pain_blocked_work = False
    recovery_spacing = False
    side_effects_detected = False
    cycle_counts: Counter[str] = Counter()

    for serialized in receipts:
        if not _side_effects_are_zero(serialized):
            side_effects_detected = True
        try:
            replayed = replay_training_plan(serialized)
        except (KeyError, TypeError, ValueError):
            replay_failed = True
            continue
        if (
            replayed.planner_version != CURRENT_PLANNER_VERSION
            or replayed.constitution_version != CURRENT_CONSTITUTION_VERSION
        ):
            version_mismatch = True
        if any(
            validation.severity == "hard" and validation.passed is not True
            for validation in replayed.validations
        ):
            hard_rule_violations = True
        if not _has_minimum_recovery_spacing(replayed):
            recovery_spacing = True
        if (
            serialized.get("fixture_category") == "pain-blocked"
            and not _pain_fixture_is_safe(replayed)
        ):
            pain_blocked_work = True
        if replayed.status in {"active", "proposed"}:
            cycle_counts[replayed.cycle_id] += 1

    reasons = []
    if replay_failed:
        reasons.append("deterministic_replay_failed")
    if version_mismatch:
        reasons.append("version_mismatch")
    if hard_rule_violations:
        reasons.append("hard_rule_violations")
    if pain_blocked_work:
        reasons.append("pain_blocked_work")
    if recovery_spacing:
        reasons.append("recovery_spacing")
    if any(count > 1 for count in cycle_counts.values()):
        reasons.append("multiple_plans_per_cycle")
    if side_effects_detected:
        reasons.append("side_effects_detected")
    if set(fixture_summary) != set(REQUIRED_FIXTURE_CATEGORIES):
        reasons.append("fixture_coverage")

    evidence_rows = sorted(
        (
            str(receipt.get("fixture_category", "")),
            str(receipt.get("receipt_hash", "")),
        )
        for receipt in receipts
    )
    evidence_id = canonical_hash(
        {
            "planner_version": CURRENT_PLANNER_VERSION,
            "constitution_version": CURRENT_CONSTITUTION_VERSION,
            "fixtures": evidence_rows,
            "fixture_summary": fixture_summary,
        }
    )
    return {
        "accepted": not reasons,
        "reasons": reasons,
        "evidence_id": evidence_id,
        "planner_version": CURRENT_PLANNER_VERSION,
        "constitution_version": CURRENT_CONSTITUTION_VERSION,
        "fixture_summary": fixture_summary,
    }
