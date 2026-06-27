from pathlib import Path


WEEKLY_BRIEF = (
    Path(__file__).resolve().parents[3]
    / "pwa"
    / "src"
    / "components"
    / "finance"
    / "WeeklyBrief.jsx"
)


def _source() -> str:
    return WEEKLY_BRIEF.read_text(encoding="utf-8")


def test_checklist_offers_record_transaction_for_each_leg() -> None:
    source = _source()
    assert "RECORD TRANSACTION" in source
    assert "onRecordTransaction(item.asset)" in source


def test_actual_execution_fields_remain_required_user_inputs() -> None:
    source = _source()
    for field in ("amount_eur", "units", "price", "currency", "executed_at"):
        assert f"required data-manual-field=\"{field}\"" in source


def test_post_buy_flow_has_preview_and_explicit_apply_safety_copy() -> None:
    source = _source()
    assert "PREVIEW PORTFOLIO IMPACT" in source
    assert (
        "This updates PHOENIX portfolio_state from your manually recorded broker "
        "transaction. PHOENIX still did not execute a trade."
    ) in source


def test_post_buy_flow_does_not_present_a_buy_or_execute_button() -> None:
    source = _source()
    assert ">BUY<" not in source
    assert ">EXECUTE<" not in source
