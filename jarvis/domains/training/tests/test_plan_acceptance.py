import base64
import json
from hashlib import sha256
import zlib
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path

import pytest

import jarvis.domains.training.plan_acceptance as acceptance_module
from jarvis.domains.training.adaptive_planner import PlanningSnapshot, generate_weekly_plan
from jarvis.domains.training.plan_acceptance import (
    decode_training_evidence_receipts,
    evaluate_training_shadow,
    replay_training_plan,
    training_planner_acceptance_status,
    training_planner_mode,
    validate_runtime_proposal,
)
from jarvis.domains.training.performance_hybrid import HYBRID_SEQUENCE
from jarvis.domains.training.plan_evidence import build_planning_snapshot
from jarvis.domains.training.plan_contracts import (
    PlanValidation,
    TrainingConstraint,
    WeeklyPlanReceipt,
    canonical_hash,
)
from jarvis.domains.training.progression import calculate_progression


@pytest.fixture
def training_constitution():
    path = Path(__file__).parent.parent / "constitution.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _snapshot(week_start: date, **overrides) -> PlanningSnapshot:
    values = {
        "week_start": week_start,
        "created_at": f"{week_start.isoformat()}T06:00:00Z",
        "completed_sessions": (),
        "readiness": None,
        "calendar_events": (),
        "progression": {},
        "equipment": (),
        "preferences": (),
        "safety_blocks": (),
    }
    values.update(overrides)
    return PlanningSnapshot(**values)


def _completed_hybrid_session(receipt: WeeklyPlanReceipt, position: int) -> dict:
    planned = next(day for day in receipt.days if day.sequence_position == position)
    return {
        "date": planned.date.isoformat(),
        "session_type": planned.session_type,
        "session_intent": planned.session_intent,
        "sequence_position": planned.sequence_position,
        "sequence_length": planned.sequence_length,
        "plan_provenance": {
            "plan_id": receipt.plan_id,
            "receipt_hash": receipt.receipt_hash,
            "date": planned.date.isoformat(),
        },
        "completion_evidence": {
            "duration_seconds": 3600,
            "rpe": 8,
            "pain_confirmed": False,
            "pain_body_areas": [],
        },
        "exercises": [
            {
                "name": "bench_press",
                "target_reps": 5,
                "sets": [{"reps": 5, "weight_kg": 55, "target_reps": 5}],
            }
        ],
    }


HYBRID_REQUIRED_CATEGORIES = (
    "sequence",
    "recovery_placement",
    "time_compression",
    "equipment_substitution",
    "fatigue_deload",
    "calendar_conflict",
    "pain_block",
    "phase_peak",
    "missed_session",
    "completion_advance",
)

# Fixture weeks are the programme's consecutive weeks, derived from the
# constitution rather than written as literal dates: restarting the programme
# shifts every block, and a hardcoded peak week silently stops being the peak.
_TRAINING_CONSTITUTION = json.loads(
    (Path(__file__).parent.parent / "constitution.json").read_text(encoding="utf-8")
)
PROGRAMME_START = date.fromisoformat(_TRAINING_CONSTITUTION["start_date"])
PEAK_WEEK_START = date.fromisoformat(_TRAINING_CONSTITUTION["peak_week_start"])


def _programme_week(index: int) -> date:
    """Monday of the programme's Nth week (0-based)."""
    return PROGRAMME_START + timedelta(days=7 * index)


def _scenario_receipt(constitution, category: str, week_start: date) -> WeeklyPlanReceipt:
    snapshot = _snapshot(week_start)
    constraints = ()
    if category == "sequence":
        pass
    elif category == "recovery_placement":
        snapshot = replace(
            snapshot,
            calendar_events=(
                {
                    "event_type": "performance",
                    "date": week_start.isoformat(),
                    "severity": "hard",
                },
            ),
        )
    elif category == "time_compression":
        constraints = (
            TrainingConstraint.from_mapping(
                "time_limit",
                "user",
                {
                    "date": week_start.isoformat(),
                    "minutes": 40,
                },
            ),
        )
    elif category == "equipment_substitution":
        snapshot = replace(
            snapshot,
            equipment=(
                "dumbbells",
                "bench",
                "incline_bench",
                "cable_machine",
                "pullup_bar",
                "weight_belt",
                "hex_bar",
                "leg_press",
                "seated_calf_raise",
            ),
        )
    elif category == "fatigue_deload":
        snapshot = replace(
            snapshot,
            progression={
                "bench_press": {
                    "suggested_kg": 55,
                    "basis": "Readiness evidence requires a deload.",
                    "reason": "fatigue",
                    "deload": True,
                }
            },
        )
    elif category == "missed_session":
        completed_sessions = tuple(
            {
                "id": index,
                "date": completed_date.isoformat(),
                "session_type": "general",
                "session_intent": "push_strength",
                "sequence_position": 1,
                "sequence_length": len(HYBRID_SEQUENCE),
                "plan_provenance": {
                    "plan_id": f"hybrid-plan-{index}",
                    "receipt_hash": f"hybrid-receipt-{index}",
                    "date": completed_date.isoformat(),
                },
                "completion_evidence": {
                    "duration_seconds": 3600,
                    "rpe": 9,
                    "pain_confirmed": False,
                    "pain_body_areas": [],
                },
                "exercises": [
                    {
                        "name": "bench_press",
                        "target_reps": 5,
                        "sets": [
                            {"reps": 4, "weight_kg": 55, "target_reps": 5}
                        ],
                    }
                ],
            }
            for index, completed_date in enumerate(
                (week_start - timedelta(days=14), week_start - timedelta(days=7)),
                start=1,
            )
        )
        snapshot = replace(
            snapshot,
            completed_sessions=completed_sessions,
            progression=calculate_progression(list(completed_sessions)),
        )
    elif category == "calendar_conflict":
        snapshot = replace(
            snapshot,
            calendar_events=(
                {
                    "event_type": "performance",
                    "date": week_start.isoformat(),
                    "severity": "hard",
                },
            ),
        )
    elif category == "pain_block":
        snapshot = replace(
            snapshot,
            readiness={"pain": True, "knee": 5, "sharp_pain": True},
            safety_blocks=("knee",),
        )
    elif category == "phase_peak":
        if week_start != PEAK_WEEK_START:
            raise AssertionError("Peak fixture must use the configured peak week")
    elif category == "completion_advance":
        active = _with_receipt_values(
            generate_weekly_plan(
                constitution,
                _snapshot(week_start - timedelta(days=7)),
            ),
            status="active",
        )
        snapshot = build_planning_snapshot(
            week_start=week_start,
            created_at=f"{week_start.isoformat()}T06:00:00Z",
            sessions=[_completed_hybrid_session(active, position=1)],
            readiness=None,
            calendar_events=[],
            equipment=[],
            preferences={},
            active_plan=active.to_mapping(),
        )
    else:
        raise AssertionError(f"Unknown scenario: {category}")
    return generate_weekly_plan(constitution, snapshot, constraints)


def _required_receipts(constitution) -> list[dict]:
    fixture_weeks = {
        "sequence": _programme_week(0),
        "recovery_placement": _programme_week(1),
        "time_compression": _programme_week(2),
        "equipment_substitution": _programme_week(3),
        "fatigue_deload": _programme_week(4),
        "calendar_conflict": _programme_week(5),
        "pain_block": _programme_week(6),
        "missed_session": _programme_week(7),
        "phase_peak": _programme_week(8),
        "completion_advance": _programme_week(9),
    }
    assert fixture_weeks["phase_peak"] == PEAK_WEEK_START, (
        "peak is expected in the programme's ninth week"
    )
    return [
        _scenario_receipt(constitution, category, fixture_weeks[category]).to_mapping()
        for category in HYBRID_REQUIRED_CATEGORIES
    ]


def _incomplete_hybrid_fixture_receipts(constitution) -> list[dict]:
    return [
        receipt
        for category, receipt in zip(
            HYBRID_REQUIRED_CATEGORIES,
            _required_receipts(constitution),
        )
        if category != "equipment_substitution"
    ]


def _with_receipt_values(receipt: WeeklyPlanReceipt, **overrides) -> WeeklyPlanReceipt:
    values = {
        "parent_plan_id": receipt.parent_plan_id,
        "constitution_version": receipt.constitution_version,
        "planner_version": receipt.planner_version,
        "cycle_id": receipt.cycle_id,
        "days": receipt.days,
        "constraints": receipt.constraints,
        "validations": receipt.validations,
        "replay_inputs": receipt.replay_inputs,
        "created_at": receipt.created_at,
        "status": receipt.status,
    }
    values.update(overrides)
    return WeeklyPlanReceipt.create(**values)


def test_serialized_plan_reruns_actual_planner_to_identical_identities(
    monkeypatch, training_constitution
):
    receipt = _scenario_receipt(training_constitution, "sequence", _programme_week(2))
    active = _with_receipt_values(receipt, status="active")
    calls = []
    real_generate = acceptance_module.generate_weekly_plan

    def spy(constitution, snapshot, constraints=()):
        calls.append((constitution, snapshot, tuple(constraints)))
        return real_generate(constitution, snapshot, constraints)

    monkeypatch.setattr(acceptance_module, "generate_weekly_plan", spy)

    replayed = replay_training_plan(json.loads(json.dumps(active.to_mapping())))

    assert len(calls) == 1
    assert calls[0][1] == active.replay_inputs.snapshot
    assert calls[0][2] == active.replay_inputs.constraints
    assert replayed.plan_id == active.plan_id
    assert replayed.input_hash == active.input_hash
    assert replayed.receipt_hash == active.receipt_hash


def test_replay_rejects_legacy_receipt_without_replay_inputs(training_constitution):
    serialized = _scenario_receipt(
        training_constitution, "sequence", _programme_week(2)
    ).to_mapping()
    serialized.pop("replay_inputs")

    with pytest.raises(ValueError, match="replay inputs"):
        replay_training_plan(serialized)


def test_replay_rejects_tampered_canonical_inputs(training_constitution):
    serialized = _scenario_receipt(
        training_constitution, "sequence", _programme_week(2)
    ).to_mapping()
    serialized["replay_inputs"]["snapshot"]["readiness"] = {"knee": 4}

    with pytest.raises(ValueError, match="identity|replay"):
        replay_training_plan(serialized)


def test_replay_rejects_resigned_output_not_generated_from_inputs(training_constitution):
    receipt = _scenario_receipt(training_constitution, "sequence", _programme_week(2))
    tampered_day = replace(receipt.days[0], objective="self_attested_output")
    resigned = _with_receipt_values(
        receipt,
        days=(tampered_day, *receipt.days[1:]),
    )

    with pytest.raises(ValueError, match="planner replay"):
        replay_training_plan(resigned.to_mapping())


def test_replay_rejects_planner_drift_or_nondeterminism(
    monkeypatch, training_constitution
):
    receipt = _scenario_receipt(training_constitution, "sequence", _programme_week(2))
    real_generate = acceptance_module.generate_weekly_plan

    def drifted_generate(constitution, snapshot, constraints=()):
        generated = real_generate(constitution, snapshot, constraints)
        drifted_day = replace(generated.days[-1], objective="drifted")
        return _with_receipt_values(
            generated,
            days=(*generated.days[:-1], drifted_day),
        )

    monkeypatch.setattr(
        acceptance_module,
        "generate_weekly_plan",
        drifted_generate,
    )

    with pytest.raises(ValueError, match="planner replay"):
        replay_training_plan(receipt.to_mapping())


def test_shadow_gate_infers_real_fixture_behavior_and_ignores_caller_labels(
    training_constitution,
):
    receipts = _required_receipts(training_constitution)
    for receipt in receipts:
        receipt["fixture_category"] = "caller-controlled-lie"
        receipt["side_effects"] = {"direct_execution_count": 999}

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is True
    assert set(result["fixture_summary"]) == set(HYBRID_REQUIRED_CATEGORIES)
    assert all(
        result["fixture_summary"][category] > 0
        for category in HYBRID_REQUIRED_CATEGORIES
    )
    assert result["side_effect_proof"]["passed"] is True
    assert result["side_effect_proof"]["replay_count"] == 10
    assert all(
        row["input_hash_before"] == row["input_hash_after"]
        for row in result["side_effect_proof"]["immutable_inputs"]
    )


def test_acceptance_requires_all_hybrid_behavior_categories(training_constitution):
    result = evaluate_training_shadow(
        _incomplete_hybrid_fixture_receipts(training_constitution)
    )

    assert result["accepted"] is False
    assert "equipment_substitution" not in result["fixture_summary"]
    assert "fixture_coverage" in result["reasons"]


def test_ordinary_recovery_annotation_cannot_grant_recovery_placement(
    training_constitution,
):
    receipt = _scenario_receipt(
        training_constitution, "sequence", _programme_week(2)
    )

    categories = acceptance_module._infer_fixture_categories(receipt)

    assert "recovery_placement" not in categories


def test_synthetic_cursor_and_unrelated_calendar_cannot_grant_recovery_placement(
    training_constitution,
):
    synthetic = generate_weekly_plan(
        training_constitution,
        _snapshot(
            _programme_week(2),
            calendar_events=(
                {
                    "event_type": "information",
                    "date": "2099-01-01",
                    "severity": "info",
                },
            ),
            sequence_cursor=2,
            sequence_source_plan_id="synthetic-active-plan",
        ),
    )

    categories = acceptance_module._infer_fixture_categories(synthetic)

    assert "recovery_placement" not in categories


def test_synthetic_cursor_and_unrelated_readiness_cannot_grant_recovery_placement(
    training_constitution,
):
    synthetic = generate_weekly_plan(
        training_constitution,
        _snapshot(
            _programme_week(2),
            readiness={"fatigue_score": 9},
            sequence_cursor=2,
            sequence_source_plan_id="synthetic-active-plan",
        ),
    )

    categories = acceptance_module._infer_fixture_categories(synthetic)

    assert "recovery_placement" not in categories


def test_calendar_alone_can_prove_moved_recovery_placement(training_constitution):
    calendar_receipt = _scenario_receipt(
        training_constitution,
        "recovery_placement",
        date(2026, 7, 13),
    )

    categories = acceptance_module._infer_fixture_categories(calendar_receipt)

    assert "recovery_placement" in categories


def test_linked_sequence_advance_alone_can_prove_moved_recovery_placement(
    training_constitution,
):
    sequence_receipt = _scenario_receipt(
        training_constitution,
        "completion_advance",
        date(2026, 9, 7),
    )

    categories = acceptance_module._infer_fixture_categories(sequence_receipt)

    assert "completion_advance" in categories
    assert "recovery_placement" in categories


def test_synthetic_cursor_without_linked_completion_cannot_grant_advance(
    training_constitution,
):
    synthetic = generate_weekly_plan(
        training_constitution,
        _snapshot(
            _programme_week(2),
            sequence_cursor=2,
            sequence_source_plan_id="synthetic-active-plan",
        ),
    )

    categories = acceptance_module._infer_fixture_categories(synthetic)

    assert "completion_advance" not in categories


def test_older_linked_completion_cannot_override_newer_sequence_evidence(
    training_constitution,
):
    active = generate_weekly_plan(
        training_constitution,
        _snapshot(_programme_week(2)),
    )
    latest = _completed_hybrid_session(active, position=2)
    older = _completed_hybrid_session(active, position=1)
    inconsistent = generate_weekly_plan(
        training_constitution,
        _snapshot(
            date(2026, 7, 27),
            completed_sessions=(latest, older),
            sequence_cursor=2,
            sequence_source_plan_id=active.plan_id,
        ),
    )

    categories = acceptance_module._infer_fixture_categories(inconsistent)

    assert "completion_advance" not in categories


def test_peak_reason_label_without_peak_transform_cannot_grant_phase_coverage(
    training_constitution,
):
    ordinary = _scenario_receipt(
        training_constitution, "sequence", _programme_week(2)
    )
    labeled_day = replace(
        ordinary.days[0],
        decision_reasons=(
            *ordinary.days[0].decision_reasons,
            "phase_maintenance:peak",
        ),
    )
    mislabeled = _with_receipt_values(
        ordinary,
        days=(labeled_day, *ordinary.days[1:]),
    )

    categories = acceptance_module._infer_fixture_categories(mislabeled)

    assert "phase_peak" not in categories


def test_caller_labels_cannot_fake_required_fixture_coverage(training_constitution):
    receipts = []
    for index, label in enumerate(HYBRID_REQUIRED_CATEGORIES):
        receipt = _scenario_receipt(
            training_constitution,
            "sequence",
            date(2026, 7, 6) + timedelta(weeks=index),
        ).to_mapping()
        receipt["fixture_category"] = label
        receipts.append(receipt)

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is False
    assert set(result["fixture_summary"]) < set(HYBRID_REQUIRED_CATEGORIES)
    assert "fixture_coverage" in result["reasons"]


def test_shadow_gate_certifies_engine_without_embedding_proposal_ids(training_constitution):
    receipts = _required_receipts(training_constitution)

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is True
    assert "accepted_proposals" not in result
    assert decode_training_evidence_receipts(result) == sorted(
        receipts, key=lambda row: row["plan_id"]
    )
    assert len(json.dumps(result)) < 32767


def test_runtime_validation_accepts_fresh_deterministic_receipt(training_constitution):
    receipt = _scenario_receipt(
        training_constitution, "sequence", _programme_week(2)
    ).to_mapping()

    accepted, reasons = validate_runtime_proposal(receipt, active_parent_id=None)

    assert accepted is True
    assert reasons == ()


def test_runtime_validation_rejects_tampered_days(training_constitution):
    receipt = _scenario_receipt(
        training_constitution, "sequence", _programme_week(2)
    ).to_mapping()
    receipt["days"][0]["objective"] = "tampered"

    accepted, reasons = validate_runtime_proposal(receipt, active_parent_id=None)

    assert accepted is False
    assert "runtime_replay_failed" in reasons


def test_runtime_validation_rejects_stale_version(training_constitution):
    receipt = _scenario_receipt(
        training_constitution, "sequence", _programme_week(2)
    ).to_mapping()
    receipt["planner_version"] = "adaptive-v0"

    accepted, reasons = validate_runtime_proposal(receipt, active_parent_id=None)

    assert accepted is False
    assert "version_mismatch" in reasons


def test_runtime_validation_rejects_parent_mismatch(training_constitution):
    receipt = _scenario_receipt(
        training_constitution, "sequence", _programme_week(2)
    ).to_mapping()

    accepted, reasons = validate_runtime_proposal(
        receipt, active_parent_id="different-active-plan"
    )

    assert accepted is False
    assert "parent_mismatch" in reasons


def test_evidence_decoder_avoids_unbounded_decompression(
    training_constitution, monkeypatch
):
    evidence = evaluate_training_shadow(_required_receipts(training_constitution))

    def reject_unbounded_decompress(*_args, **_kwargs):
        raise AssertionError("unbounded zlib.decompress must not be used")

    monkeypatch.setattr(acceptance_module.zlib, "decompress", reject_unbounded_decompress)

    assert len(decode_training_evidence_receipts(evidence)) == 10


def test_evidence_decoder_rejects_oversized_expanded_payload():
    raw = b"[" + (b" " * 2_000_000) + b"]"
    bundle = {
        "encoding": "zlib-base64-canonical-json-v1",
        "sha256": sha256(raw).hexdigest(),
        "count": 1,
        "payload": base64.b64encode(zlib.compress(raw, level=9)).decode("ascii"),
    }

    with pytest.raises(ValueError, match="too large"):
        decode_training_evidence_receipts({"receipt_bundle": bundle})


def test_shadow_gate_rejects_non_current_constitution(training_constitution):
    stale_constitution = json.loads(json.dumps(training_constitution))
    stale_constitution["version"] = "0"
    receipts = _required_receipts(training_constitution)
    receipts[0] = _scenario_receipt(
        stale_constitution, "sequence", _programme_week(2)
    ).to_mapping()

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is False
    assert "version_mismatch" in result["reasons"]


def test_shadow_gate_rejects_failed_pure_replay_boundary_audit(
    training_constitution, monkeypatch
):
    monkeypatch.setattr(
        acceptance_module,
        "_source_side_effect_audit",
        lambda: ({"planner.py": "source-hash"}, ["planner.py:call:commit"]),
    )

    result = evaluate_training_shadow(_required_receipts(training_constitution))

    assert result["accepted"] is False
    assert result["side_effect_proof"]["passed"] is False
    assert "side_effect_proof_failed" in result["reasons"]


def test_acceptance_status_recomputes_complete_evidence(training_constitution, monkeypatch):
    evidence = evaluate_training_shadow(_required_receipts(training_constitution))
    monkeypatch.setenv(
        "PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON",
        json.dumps(evidence),
    )

    status = training_planner_acceptance_status()

    assert status["accepted"] is True
    assert status["evidence_id"] == evidence["evidence_id"]
    assert "accepted_proposals" not in status


def test_acceptance_status_accepts_equivalent_cross_platform_compression(
    training_constitution,
    monkeypatch,
):
    evidence = evaluate_training_shadow(_required_receipts(training_constitution))
    receipts = decode_training_evidence_receipts(evidence)
    raw = json.dumps(
        receipts,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    alternate_payload = base64.b64encode(zlib.compress(raw, level=1)).decode("ascii")
    assert alternate_payload != evidence["receipt_bundle"]["payload"]
    evidence["receipt_bundle"] = {
        **evidence["receipt_bundle"],
        "payload": alternate_payload,
    }
    unsigned = {key: value for key, value in evidence.items() if key != "evidence_id"}
    evidence["evidence_id"] = canonical_hash(unsigned)
    monkeypatch.setenv(
        "PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON",
        json.dumps(evidence),
    )

    status = training_planner_acceptance_status()

    assert status["accepted"] is True
    assert status["evidence_id"] == evidence["evidence_id"]


def test_acceptance_diagnostics_exposes_safe_source_mismatch_names(
    training_constitution,
    monkeypatch,
):
    evidence = evaluate_training_shadow(_required_receipts(training_constitution))
    module_name = next(iter(evidence["side_effect_proof"]["module_hashes"]))
    evidence["side_effect_proof"]["module_hashes"][module_name] = "different-runtime-source"
    unsigned = {key: value for key, value in evidence.items() if key != "evidence_id"}
    evidence["evidence_id"] = canonical_hash(unsigned)
    monkeypatch.setenv(
        "PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON",
        json.dumps(evidence),
    )

    diagnostics = acceptance_module.training_planner_acceptance_diagnostics()

    assert diagnostics["signature_valid"] is True
    assert diagnostics["receipt_identity_match"] is True
    assert diagnostics["source_audit_match"] is False
    assert diagnostics["source_mismatch_modules"] == [module_name]
    assert diagnostics["current_source_hashes"][module_name] != "different-runtime-source"
    assert "receipt_bundle" not in diagnostics


def test_source_audit_hash_is_independent_of_platform_line_endings():
    lf_source = "def example():\n    return 1\n"
    crlf_source = lf_source.replace("\n", "\r\n")

    assert acceptance_module._canonical_source_hash(lf_source) == (
        acceptance_module._canonical_source_hash(crlf_source)
    )


@pytest.mark.parametrize(
    "tamper",
    (
        lambda evidence: evidence.update(accepted=False),
        lambda evidence: evidence["fixture_summary"].update(sequence=99),
        lambda evidence: evidence["side_effect_proof"].update(passed=False),
        lambda evidence: evidence.update(evidence_id="attacker-supplied"),
        lambda evidence: evidence["receipt_bundle"].update(payload="tampered"),
    ),
)
def test_acceptance_status_rejects_any_tampered_evidence(
    training_constitution, monkeypatch, tamper
):
    evidence = evaluate_training_shadow(_required_receipts(training_constitution))
    tamper(evidence)
    monkeypatch.setenv(
        "PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON",
        json.dumps(evidence),
    )

    status = training_planner_acceptance_status()

    assert status["accepted"] is False
    assert "evidence_recompute_failed" in status["reasons"]


@pytest.mark.parametrize("passed", (0, 1, "true", None, [], {}))
def test_shadow_gate_rejects_malformed_hard_validation_rows(
    training_constitution, passed
):
    receipt = _scenario_receipt(training_constitution, "sequence", _programme_week(2))
    malformed = tuple(
        PlanValidation(row.rule, passed, row.severity, row.detail)
        if row.severity == "hard"
        else row
        for row in receipt.validations
    )
    signed = _with_receipt_values(receipt, validations=malformed).to_mapping()

    result = evaluate_training_shadow([signed])

    assert result["accepted"] is False
    assert "malformed_validations" in result["reasons"]


def test_shadow_gate_rejects_empty_validation_set(training_constitution):
    receipt = _scenario_receipt(training_constitution, "sequence", _programme_week(2))
    signed = _with_receipt_values(receipt, validations=()).to_mapping()

    result = evaluate_training_shadow([signed])

    assert result["accepted"] is False
    assert "malformed_validations" in result["reasons"]


def test_shadow_gate_requires_all_expected_hard_rules(training_constitution):
    receipt = _scenario_receipt(training_constitution, "sequence", _programme_week(2))
    validations = tuple(
        row for row in receipt.validations if row.rule != "pain_block"
    )
    signed = _with_receipt_values(receipt, validations=validations).to_mapping()

    result = evaluate_training_shadow([signed])

    assert result["accepted"] is False
    assert "malformed_validations" in result["reasons"]


def test_shadow_gate_rejects_multiple_plans_for_one_cycle(training_constitution):
    receipts = _required_receipts(training_constitution)
    same_cycle = _programme_week(2)
    receipts[1] = _scenario_receipt(
        training_constitution, "sequence", same_cycle
    ).to_mapping()

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is False
    assert "multiple_plans_per_cycle" in result["reasons"]


def test_training_planner_mode_defaults_and_fails_closed_to_shadow(monkeypatch):
    monkeypatch.delenv("PHOENIX_TRAINING_PLANNER_MODE", raising=False)
    assert training_planner_mode() == "shadow"

    monkeypatch.setenv("PHOENIX_TRAINING_PLANNER_MODE", "LIVE")
    assert training_planner_mode() == "shadow"

    monkeypatch.setenv("PHOENIX_TRAINING_PLANNER_MODE", "live")
    assert training_planner_mode() == "live"


@pytest.mark.parametrize("raw", (None, "not-json", "{}", "[]"))
def test_acceptance_status_fails_closed_without_recomputable_evidence(monkeypatch, raw):
    if raw is None:
        monkeypatch.delenv("PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON", raising=False)
    else:
        monkeypatch.setenv("PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON", raw)

    assert training_planner_acceptance_status()["accepted"] is False
