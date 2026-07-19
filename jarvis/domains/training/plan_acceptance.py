"""Deterministic replay and promotion checks for adaptive Training plans."""

from __future__ import annotations

import ast
import base64
from collections import Counter
from dataclasses import replace
from hashlib import sha256
import json
import os
from pathlib import Path
from typing import Any, Mapping
import zlib

from . import adaptive_planner, engine, plan_contracts, plan_evidence, progression
from .adaptive_planner import generate_weekly_plan
from .plan_contracts import (
    TrainingPlanReplayInputs,
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
EXPECTED_HARD_VALIDATIONS = frozenset(
    {
        "seven_unique_days",
        "pain_block",
        "calendar_conflicts",
        "recovery_spacing",
    }
)
_RECEIPT_FIELDS = (
    "plan_id",
    "parent_plan_id",
    "constitution_version",
    "planner_version",
    "cycle_id",
    "days",
    "constraints",
    "validations",
    "replay_inputs",
    "created_at",
    "status",
    "input_hash",
    "receipt_hash",
)
_HIGH_NEURAL_SESSION_TYPES = frozenset({"high_intensity", "jump", "peak", "attempt"})
_RECOVERY_EXERCISE_MARKERS = frozenset({"isometric", "mobility", "flexibility", "rehab"})
_EXPLICIT_LOAD_FIELDS = ("load_kg", "weight_kg", "weight", "load")
_MINIMUM_RECOVERY_HOURS = 36
_MAX_EVIDENCE_PAYLOAD_CHARS = 131_072
_MAX_EVIDENCE_RAW_BYTES = 2_000_000
_PURE_REPLAY_MODULES = (
    adaptive_planner,
    engine,
    plan_contracts,
    plan_evidence,
    progression,
)
_FORBIDDEN_IMPORT_PREFIXES = (
    "jarvis.api",
    "jarvis.data",
    "requests",
    "http",
    "socket",
    "sqlite3",
    "subprocess",
)
_FORBIDDEN_CALLS = frozenset(
    {
        "open",
        "write",
        "write_text",
        "write_bytes",
        "execute",
        "executemany",
        "commit",
        "post",
        "put",
        "delete",
        "urlopen",
    }
)


def training_planner_mode() -> str:
    """Return the explicit planner authority mode, defaulting closed to shadow."""
    mode = os.environ.get("PHOENIX_TRAINING_PLANNER_MODE", "shadow")
    return mode if mode in {"shadow", "live"} else "shadow"


def replay_training_plan(receipt: Mapping[str, Any]) -> WeeklyPlanReceipt:
    """Rerun the planner from persisted canonical inputs and verify all identities."""
    if not isinstance(receipt, Mapping) or "replay_inputs" not in receipt:
        raise ValueError("Training plan receipt is missing canonical replay inputs")
    try:
        persisted = WeeklyPlanReceipt.from_mapping(receipt)
    except ValueError as exc:
        raise ValueError(
            "Training plan receipt identity does not match canonical replay inputs"
        ) from exc

    inputs = persisted.replay_inputs
    try:
        regenerated = generate_weekly_plan(
            inputs.constitution,
            inputs.snapshot,
            inputs.constraints,
        )
        expected = WeeklyPlanReceipt.create(
            parent_plan_id=persisted.parent_plan_id,
            constitution_version=regenerated.constitution_version,
            planner_version=regenerated.planner_version,
            cycle_id=regenerated.cycle_id,
            days=regenerated.days,
            constraints=regenerated.constraints,
            validations=regenerated.validations,
            replay_inputs=regenerated.replay_inputs,
            created_at=regenerated.created_at,
            status=persisted.status,
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Training planner replay could not regenerate the receipt") from exc

    if (
        expected.plan_id != persisted.plan_id
        or expected.input_hash != persisted.input_hash
        or expected.receipt_hash != persisted.receipt_hash
        or expected.days != persisted.days
        or expected.validations != persisted.validations
    ):
        raise ValueError("Training planner replay identities do not match persisted receipt")
    return expected


def validate_runtime_proposal(
    receipt: Mapping[str, Any],
    *,
    active_parent_id: str | None,
) -> tuple[bool, tuple[str, ...]]:
    """Validate one persisted proposal at the authority boundary."""
    if not isinstance(receipt, Mapping):
        return False, ("malformed_receipt",)

    reasons = []
    if (
        receipt.get("planner_version") != CURRENT_PLANNER_VERSION
        or receipt.get("constitution_version") != CURRENT_CONSTITUTION_VERSION
    ):
        reasons.append("version_mismatch")
    if receipt.get("status") != "proposed":
        reasons.append("non_proposal_receipt")
    if receipt.get("parent_plan_id") != active_parent_id:
        reasons.append("parent_mismatch")
    if not _validation_rows_are_acceptable(receipt):
        reasons.append("validation_failed")
    try:
        replay_training_plan(receipt)
    except (TypeError, ValueError):
        reasons.append("runtime_replay_failed")

    normalized = tuple(sorted(set(reasons)))
    return not normalized, normalized


def training_planner_acceptance_status() -> dict[str, Any]:
    """Recompute environment evidence and fail closed on any mismatch."""
    raw_evidence = os.environ.get("PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON")
    if raw_evidence is None:
        return _closed_status(("acceptance_evidence_missing",))
    try:
        parsed = json.loads(raw_evidence)
    except (TypeError, json.JSONDecodeError):
        return _closed_status(("acceptance_evidence_invalid",))
    if not isinstance(parsed, Mapping) or not isinstance(parsed.get("receipt_bundle"), Mapping):
        return _closed_status(("acceptance_evidence_invalid",))

    try:
        receipts = decode_training_evidence_receipts(parsed)
        recomputed = evaluate_training_shadow(receipts)
    except (TypeError, ValueError):
        return _closed_status(("evidence_recompute_failed",))

    if parsed != recomputed:
        return _closed_status(
            ("evidence_recompute_failed",),
            evidence_id=parsed.get("evidence_id"),
        )
    if (
        recomputed.get("accepted") is not True
        or recomputed.get("planner_version") != CURRENT_PLANNER_VERSION
        or recomputed.get("constitution_version") != CURRENT_CONSTITUTION_VERSION
        or not _valid_fixture_summary(recomputed.get("fixture_summary"))
        or not isinstance(recomputed.get("evidence_id"), str)
        or not recomputed["evidence_id"].strip()
    ):
        return _closed_status(
            tuple(recomputed.get("reasons") or ("acceptance_not_granted",)),
            evidence_id=recomputed.get("evidence_id"),
        )
    return {
        "accepted": True,
        "reasons": [],
        "planner_version": recomputed["planner_version"],
        "constitution_version": recomputed["constitution_version"],
        "evidence_id": recomputed["evidence_id"],
        "fixture_summary": recomputed["fixture_summary"],
    }


def _closed_status(reasons, *, evidence_id=None):
    return {
        "accepted": False,
        "reasons": list(reasons),
        "planner_version": None,
        "constitution_version": None,
        "evidence_id": evidence_id,
        "fixture_summary": None,
    }


def _valid_fixture_summary(value: Any) -> bool:
    return isinstance(value, Mapping) and set(value) == set(REQUIRED_FIXTURE_CATEGORIES) and all(
        type(value[category]) is int and value[category] > 0
        for category in REQUIRED_FIXTURE_CATEGORIES
    )


def _sanitize_receipt(receipt: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(receipt, Mapping):
        raise ValueError("Training evidence receipt must be a mapping")
    sanitized = {key: receipt[key] for key in _RECEIPT_FIELDS if key in receipt}
    return json.loads(json.dumps(sanitized, sort_keys=True))


def _encode_receipt_bundle(receipts: list[dict[str, Any]]) -> dict[str, Any]:
    raw = json.dumps(
        receipts,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return {
        "encoding": "zlib-base64-canonical-json-v1",
        "sha256": sha256(raw).hexdigest(),
        "count": len(receipts),
        "payload": base64.b64encode(zlib.compress(raw, level=9)).decode("ascii"),
    }


def decode_training_evidence_receipts(evidence: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Decode and authenticate the complete canonical receipt evidence bundle."""
    bundle = evidence.get("receipt_bundle") if isinstance(evidence, Mapping) else None
    expected_fields = {"encoding", "sha256", "count", "payload"}
    if (
        not isinstance(bundle, Mapping)
        or set(bundle) != expected_fields
        or bundle.get("encoding") != "zlib-base64-canonical-json-v1"
        or type(bundle.get("count")) is not int
        or bundle["count"] <= 0
        or not isinstance(bundle.get("sha256"), str)
        or not isinstance(bundle.get("payload"), str)
        or len(bundle["payload"]) > _MAX_EVIDENCE_PAYLOAD_CHARS
    ):
        raise ValueError("Malformed Training evidence receipt bundle")
    try:
        compressed = base64.b64decode(bundle["payload"], validate=True)
        inflater = zlib.decompressobj()
        raw = inflater.decompress(compressed, _MAX_EVIDENCE_RAW_BYTES + 1)
        if len(raw) > _MAX_EVIDENCE_RAW_BYTES or inflater.unconsumed_tail:
            raise ValueError("Training evidence receipt bundle is too large")
        raw += inflater.flush(_MAX_EVIDENCE_RAW_BYTES - len(raw) + 1)
    except (ValueError, zlib.error) as exc:
        if isinstance(exc, ValueError) and "too large" in str(exc):
            raise
        raise ValueError("Malformed Training evidence receipt bundle") from exc
    if len(raw) > _MAX_EVIDENCE_RAW_BYTES:
        raise ValueError("Training evidence receipt bundle is too large")
    if not inflater.eof or inflater.unused_data:
        raise ValueError("Malformed Training evidence receipt bundle")
    if sha256(raw).hexdigest() != bundle["sha256"]:
        raise ValueError("Training evidence receipt bundle hash mismatch")
    try:
        receipts = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Malformed Training evidence receipt bundle") from exc
    if not isinstance(receipts, list) or len(receipts) != bundle["count"]:
        raise ValueError("Training evidence receipt bundle count mismatch")
    return [_sanitize_receipt(receipt) for receipt in receipts]


def _validation_rows_are_acceptable(receipt: Mapping[str, Any]) -> bool:
    rows = receipt.get("validations")
    if not isinstance(rows, list) or not rows:
        return False
    rules = []
    hard_rules = set()
    expected_fields = {"rule", "passed", "severity", "detail"}
    for row in rows:
        if not isinstance(row, Mapping) or set(row) != expected_fields:
            return False
        rule = row.get("rule")
        severity = row.get("severity")
        if (
            not isinstance(rule, str)
            or not rule.strip()
            or type(row.get("passed")) is not bool
            or severity not in {"hard", "warning", "info"}
            or not isinstance(row.get("detail"), str)
        ):
            return False
        rules.append(rule)
        if severity == "hard":
            hard_rules.add(rule)
            if row["passed"] is not True:
                return False
    return len(rules) == len(set(rules)) and hard_rules == EXPECTED_HARD_VALIDATIONS


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
        day.date for day in receipt.days if day.session_type in _HIGH_NEURAL_SESSION_TYPES
    )
    return all(
        (later - earlier).total_seconds() / 3600 >= _MINIMUM_RECOVERY_HOURS
        for earlier, later in zip(high_neural_dates, high_neural_dates[1:])
    )


def _constraint_values(constraint) -> dict[str, Any]:
    return dict(constraint.values)


def _day_by_date(receipt: WeeklyPlanReceipt) -> dict[str, Any]:
    return {day.date.isoformat(): day for day in receipt.days}


def _baseline(receipt: WeeklyPlanReceipt, *, snapshot=None, constraints=()):
    inputs = receipt.replay_inputs
    return generate_weekly_plan(
        inputs.constitution,
        snapshot or inputs.snapshot,
        constraints,
    )


def _infer_fixture_categories(receipt: WeeklyPlanReceipt) -> set[str]:
    categories = set()
    inputs = receipt.replay_inputs
    days = _day_by_date(receipt)
    unconstrained = None

    for constraint in inputs.constraints:
        values = _constraint_values(constraint)
        if constraint.kind in {"move_session", "skip_session", "equipment_available"}:
            if unconstrained is None:
                unconstrained = _baseline(receipt)
            baseline_days = _day_by_date(unconstrained)
        if constraint.kind == "move_session":
            source = values.get("source_date")
            target = values.get("target_date")
            if (
                source in days
                and target in days
                and source in baseline_days
                and days[source].session_type == "rest"
                and days[source].change_reason == f"moved_to:{target}"
                and days[target].objective == baseline_days[source].objective
                and days[target].change_reason == f"moved_from:{source}"
            ):
                categories.add("move")
        elif constraint.kind == "skip_session":
            target = values.get("date")
            if (
                target in days
                and target in baseline_days
                and baseline_days[target].session_type != "rest"
                and days[target].session_type == "rest"
                and days[target].estimated_minutes == 0
                and days[target].change_reason == "user_skip"
            ):
                categories.add("skip")
        elif constraint.kind == "equipment_available":
            target = values.get("date")
            available = set(values.get("equipment", ()))
            if target in days and target in baseline_days:
                before = tuple(item.get("name") for item in baseline_days[target].exercises)
                after = tuple(item.get("name") for item in days[target].exercises)
                metadata = inputs.constitution["adaptive_planner"]["exercise_equipment"]
                supported = all(
                    name in metadata and set(metadata[name]).issubset(available)
                    for name in after
                )
                if (
                    before != after
                    and supported
                    and "equipment_substituted:" in (days[target].change_reason or "")
                ):
                    categories.add("equipment-limited")

    deload_keys = {
        "".join(character for character in str(name).casefold() if character.isalnum())
        for name, values in inputs.snapshot.progression.items()
        if isinstance(values, Mapping) and values.get("deload") is True
    }
    if deload_keys:
        neutral = _baseline(receipt, snapshot=replace(inputs.snapshot, progression={}), constraints=inputs.constraints)
        neutral_days = _day_by_date(neutral)
        for key, day in days.items():
            exercise_keys = {
                "".join(
                    character
                    for character in str(exercise.get("name", "")).casefold()
                    if character.isalnum()
                )
                for exercise in day.exercises
            }
            if (
                deload_keys & exercise_keys
                and day.estimated_minutes < neutral_days[key].estimated_minutes
                and "fatigue_reduced:progression_deload" in (day.change_reason or "")
            ):
                categories.add("fatigue-reduced")
                break

    hard_calendar_dates = {
        str(event.get("training_date", event.get("date")))
        for event in inputs.snapshot.calendar_events
        if str(event.get("severity", "")).casefold() == "hard"
        or event.get("hard_conflict") is True
        or str(event.get("event_type", "")).casefold() == "performance"
    }
    if hard_calendar_dates:
        neutral = _baseline(
            receipt,
            snapshot=replace(inputs.snapshot, calendar_events=()),
            constraints=inputs.constraints,
        )
        neutral_days = _day_by_date(neutral)
        if any(
            key in days
            and key in neutral_days
            and neutral_days[key].session_type != "recovery"
            and days[key].session_type == "recovery"
            and days[key].change_reason == "calendar_hard_conflict"
            for key in hard_calendar_dates
        ):
            categories.add("calendar-blocked")

    readiness = inputs.snapshot.readiness or {}
    has_hard_pain_input = bool(inputs.snapshot.safety_blocks) or any(
        readiness.get(flag) is True
        for flag in ("pain", "sharp_pain", "limping", "next_day_worsening")
    )
    if has_hard_pain_input:
        neutral = _baseline(
            receipt,
            snapshot=replace(inputs.snapshot, readiness=None, safety_blocks=()),
            constraints=inputs.constraints,
        )
        routed_dates = {
            day.date
            for day in receipt.days
            if day.change_reason == "hard_pain_block"
            and day.session_type == "recovery"
            and not day.exercises
        }
        baseline_work_dates = {
            day.date
            for day in neutral.days
            if day.session_type in _HIGH_NEURAL_SESSION_TYPES or bool(day.exercises)
        }
        pain_validation_passed = any(
            row.rule == "pain_block" and row.severity == "hard" and row.passed is True
            for row in receipt.validations
        )
        if (
            routed_dates & baseline_work_dates
            and _pain_fixture_is_safe(receipt)
            and pain_validation_passed
        ):
            categories.add("pain-blocked")
    return categories


def _source_side_effect_audit() -> tuple[dict[str, str], list[str]]:
    module_hashes = {}
    forbidden = []
    for module in _PURE_REPLAY_MODULES:
        path = Path(module.__file__)
        source_bytes = path.read_bytes()
        source = source_bytes.decode("utf-8")
        module_hashes[module.__name__] = sha256(source_bytes).hexdigest()
        tree = ast.parse(source, filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
                forbidden.extend(
                    f"{module.__name__}:import:{name}"
                    for name in names
                    if name.startswith(_FORBIDDEN_IMPORT_PREFIXES)
                )
            elif isinstance(node, ast.ImportFrom):
                name = node.module or ""
                if name.startswith(_FORBIDDEN_IMPORT_PREFIXES):
                    forbidden.append(f"{module.__name__}:import:{name}")
            elif isinstance(node, ast.Call):
                function = node.func
                name = function.id if isinstance(function, ast.Name) else (
                    function.attr if isinstance(function, ast.Attribute) else ""
                )
                if name in _FORBIDDEN_CALLS:
                    forbidden.append(f"{module.__name__}:call:{name}")
    return dict(sorted(module_hashes.items())), sorted(set(forbidden))


def _side_effect_proof(immutable_inputs: list[dict[str, Any]], replay_count: int):
    module_hashes, forbidden_references = _source_side_effect_audit()
    inputs_unchanged = all(
        row["input_hash_before"] == row["input_hash_after"]
        for row in immutable_inputs
    )
    return {
        "mechanism": "hashed_pure_replay_boundary_v1",
        "module_hashes": module_hashes,
        "forbidden_references": forbidden_references,
        "immutable_inputs": sorted(immutable_inputs, key=lambda row: row["plan_id"]),
        "replay_count": replay_count,
        "passed": not forbidden_references and inputs_unchanged,
    }


def evaluate_training_shadow(receipts: list[Mapping[str, Any]]) -> dict[str, Any]:
    """Replay and evaluate full receipts without granting runtime authority."""
    if not isinstance(receipts, list):
        raise ValueError("Training evidence receipts must be a list")
    sanitized_receipts = [_sanitize_receipt(receipt) for receipt in receipts]
    sanitized_receipts.sort(
        key=lambda row: (
            str(row.get("plan_id", "")),
            str(row.get("receipt_hash", "")),
        )
    )
    fixture_counts: Counter[str] = Counter()
    cycle_counts: Counter[str] = Counter()
    immutable_inputs = []
    reasons = []
    replay_count = 0

    for serialized in sanitized_receipts:
        validations_ok = _validation_rows_are_acceptable(serialized)
        if not validations_ok:
            reasons.append("malformed_validations")
        before_hash = None
        try:
            raw_inputs = TrainingPlanReplayInputs.from_mapping(serialized["replay_inputs"])
            before_hash = canonical_hash({"replay_inputs": raw_inputs})
            replayed = replay_training_plan(serialized)
        except (KeyError, TypeError, ValueError):
            reasons.append("deterministic_replay_failed")
            continue
        replay_count += 1
        immutable_inputs.append(
            {
                "plan_id": replayed.plan_id,
                "input_hash_before": before_hash,
                "input_hash_after": replayed.input_hash,
            }
        )
        if (
            replayed.planner_version != CURRENT_PLANNER_VERSION
            or replayed.constitution_version != CURRENT_CONSTITUTION_VERSION
        ):
            reasons.append("version_mismatch")
        if replayed.status != "proposed":
            reasons.append("non_proposal_receipt")
        if not _has_minimum_recovery_spacing(replayed):
            reasons.append("recovery_spacing")
        categories = _infer_fixture_categories(replayed)
        fixture_counts.update(categories)
        cycle_counts[replayed.cycle_id] += 1
    if any(count > 1 for count in cycle_counts.values()):
        reasons.append("multiple_plans_per_cycle")
    fixture_summary = {
        category: fixture_counts[category]
        for category in REQUIRED_FIXTURE_CATEGORIES
        if fixture_counts[category]
    }
    if set(fixture_summary) != set(REQUIRED_FIXTURE_CATEGORIES):
        reasons.append("fixture_coverage")
    proof = _side_effect_proof(immutable_inputs, replay_count)
    if not proof["passed"]:
        reasons.append("side_effect_proof_failed")
    reasons = sorted(set(reasons))
    evidence = {
        "accepted": not reasons,
        "reasons": reasons,
        "planner_version": CURRENT_PLANNER_VERSION,
        "constitution_version": CURRENT_CONSTITUTION_VERSION,
        "fixture_summary": fixture_summary,
        "receipt_bundle": _encode_receipt_bundle(sanitized_receipts),
        "side_effect_proof": proof,
    }
    evidence["evidence_id"] = canonical_hash(evidence)
    return evidence
