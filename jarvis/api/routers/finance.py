"""Finance API routes. Routers call engines; no business logic lives here."""

import copy
import json
from datetime import date, datetime, timezone
from typing import Literal
import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from jarvis.api.dependencies import get_finance_constitution, get_finance_profile, get_portfolio_state
from jarvis.domains.finance import engine
from jarvis.domains.finance.etf_scoring import load_etf_universe
from jarvis.domains.finance.market_data import (
    detect_market_regime,
    resolve_best_etf_candidate_with_broker_check,
    update_portfolio_state_prices,
)
from jarvis.data import database

router = APIRouter()


def _iso_week_label() -> str:
    """Return e.g. 'W26 2026' for the current ISO week."""
    today = date.today()
    iso = today.isocalendar()
    return f"W{iso[1]} {iso[0]}"

_CRYPTO_ASSETS = {"btc", "hype", "tao"}


class ManualFinanceTransaction(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    brief_id: int | None = Field(default=None, gt=0)
    asset: str = Field(min_length=1)
    symbol: str | None = None
    platform: str = Field(min_length=1)
    side: Literal["buy"]
    amount_eur: float = Field(gt=0)
    units: float = Field(gt=0)
    price: float = Field(gt=0)
    currency: str = Field(min_length=1)
    fee_eur: float = Field(default=0, ge=0)
    executed_at: str = Field(min_length=1)
    notes: str | None = None


class ResearchMemoPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    asset: str | None = None
    sleeve: str | None = None
    title: str = Field(min_length=1)
    thesis: str = Field(min_length=1)
    risks: list[str] = Field(min_length=1)
    data_confidence: str = Field(min_length=1)
    verdict: Literal["BUY_CANDIDATE", "WATCH", "REJECT", "INSUFFICIENT_DATA"]
    sources: list[dict] = Field(default_factory=list)
    validation: dict = Field(default_factory=dict)
    status: Literal["draft", "active", "archived"]
    notes: str | None = None


class ResearchValidationRecordPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    memo_id: int | None = Field(default=None, gt=0)
    asset: str | None = None
    check_type: Literal[
        "MARKET_CAP",
        "VALUATION",
        "CROSS_SOURCE",
        "SOURCE_CONFIDENCE",
        "MANUAL_REVIEW",
    ]
    field_name: str = Field(min_length=1)
    source_primary: str | None = None
    source_secondary: str | None = None
    primary_value: str | None = None
    secondary_value: str | None = None
    consensus_value: str | None = None
    tolerance_pct: float | None = Field(default=None, ge=0)
    deviation_pct: float | None = Field(default=None, ge=0)
    status: Literal["PASS", "WARNING", "FAIL", "UNVERIFIED"]
    confidence: Literal["high", "medium", "low"]
    notes: str | None = None
    raw_json: dict = Field(default_factory=dict)


_RESEARCH_EVIDENCE_WARNINGS: dict[str, str | None] = {
    "NO_EVIDENCE": "No active research memo attached.",
    "NEEDS_RESEARCH": "Research evidence is incomplete or contains warnings.",
    "BLOCKED_BY_FAIL": "Research validation failed. Manual review required before acting.",
    "EVIDENCE_STRONG": None,
}


def _build_research_leg_context(asset: str, lane: str) -> dict:
    """Build advisory-only research context for one recommendation leg.

    Never overrides allocations, mutates portfolio state, or triggers trades.
    """
    sleeve = asset if lane == "etf" else None
    memo = database.find_active_research_memo_for_leg(asset, sleeve)

    if memo is None:
        return {
            "asset": asset,
            "sleeve": sleeve,
            "memo_id": None,
            "memo_title": None,
            "verdict": None,
            "data_confidence": None,
            "evidence_status": "NO_EVIDENCE",
            "evidence_summary": None,
            "research_warning": _RESEARCH_EVIDENCE_WARNINGS["NO_EVIDENCE"],
        }

    evidence_summary = database.get_research_memo_evidence_summary(memo["id"])
    evidence_status = evidence_summary["evidence_status"]
    return {
        "asset": asset,
        "sleeve": sleeve,
        "memo_id": memo["id"],
        "memo_title": memo["title"],
        "verdict": memo["verdict"],
        "data_confidence": memo["data_confidence"],
        "evidence_status": evidence_status,
        "evidence_summary": evidence_summary,
        "research_warning": _RESEARCH_EVIDENCE_WARNINGS.get(evidence_status),
    }


_RESEARCH_SAFETY_FLAGS = {
    "research_only": True,
    "trades_executed": False,
    "broker_connection": False,
    "portfolio_state_updated": False,
    "recommendation_overridden": False,
}

_CRYPTO_INSTRUMENTS = {
    "btc": {
        "display_name": "Bitcoin",
        "ticker": "BTC",
        "isin": None,
        "exchange": None,
        "platform": "LHV Crypto",
        "confirmation_required": False,
    },
    "hype": {
        "display_name": "Hyperliquid",
        "ticker": "HYPE",
        "isin": None,
        "exchange": None,
        "platform": "LHV Crypto",
        "confirmation_required": False,
    },
    "tao": {
        "display_name": "Bittensor",
        "ticker": "TAO",
        "isin": None,
        "exchange": None,
        "platform": "LHV Crypto",
        "confirmation_required": False,
    },
}


def _instrument_for(
    asset: str,
    etf_universe: dict,
    etf_resolutions: dict[str, dict] | None = None,
) -> dict:
    if asset in _CRYPTO_INSTRUMENTS:
        return dict(_CRYPTO_INSTRUMENTS[asset])
    instrument = etf_universe.get(asset, {}).get("instrument")
    metadata = dict(instrument) if isinstance(instrument, dict) else {}
    resolution = (etf_resolutions or {}).get(asset)
    if resolution is None:
        return metadata
    return {
        **metadata,
        "resolved_candidate": resolution.get("selected_candidate"),
        "candidates": resolution.get("candidates") or [],
        "market_data_source": resolution.get("source", "yfinance"),
        "broker_source": resolution.get(
            "broker_source", "lightyear_public_fund_screener"
        ),
        "broker_verification": resolution.get("broker_verification", "not_verified"),
        "confirmation_required": resolution.get("confirmation_required", True),
        "resolution_reason": resolution.get("reason"),
    }


def _safe_etf_resolution(sleeve_key: str) -> dict:
    try:
        return resolve_best_etf_candidate_with_broker_check(sleeve_key)
    except Exception as exc:
        return {
            "selected_candidate": None,
            "candidates": [],
            "source": "yfinance",
            "broker_source": "lightyear_public_fund_screener",
            "broker_verification": "not_verified",
            "confirmation_required": True,
            "lightyear_available": "unknown",
            "confidence": "unresolved",
            "reason": "ETF candidate resolution failed softly; manual confirmation required.",
            "error": str(exc),
        }


@router.get("/summary")
def finance_summary(
    constitution: dict = Depends(get_finance_constitution),
    portfolio_state: dict = Depends(get_portfolio_state),
) -> dict:
    holdings = engine.investable_holdings(constitution, portfolio_state)
    statuses = engine.current_statuses(constitution, holdings)
    staleness = engine.portfolio_state_staleness_warning(portfolio_state)

    return {
        "as_of": portfolio_state.get("as_of"),
        "total_invested": engine.euros(sum(holdings.values())),
        "sleeve_summary": [
            {
                "name": s.name,
                "value": engine.euros(s.current_value_cents),
                "current_weight": round(s.current_weight, 4),
                "target_weight": s.target_weight,
                "gap": round(s.gap, 4),
                "band_status": s.band_status,
            }
            for s in statuses
        ],
        "staleness_warning": staleness,
        "constitution_valid": True,
    }


@router.get("/recommendation")
def finance_recommendation(
    constitution: dict = Depends(get_finance_constitution),
    portfolio_state: dict = Depends(get_portfolio_state),
    profile: dict = Depends(get_finance_profile),
) -> dict:
    regime = detect_market_regime(portfolio_state)
    result = engine.allocate_weekly_budget(
        constitution, portfolio_state, regime=regime, profile=profile
    )
    ticket = result["approval_ticket"]
    mandate = ticket["weekly_dual_lane_mandate"]
    etf_universe = load_etf_universe(engine.DEFAULT_ETF_UNIVERSE_PATH)
    verdict = result.get("etf_scoring_verdict") or {}
    etf_resolutions = {
        sleeve.get("sleeve"): _safe_etf_resolution(sleeve.get("sleeve", ""))
        for sleeve in (verdict.get("sleeves") or [])
        if sleeve.get("sleeve")
    }

    recommendations = [
        {
            "asset": asset,
            "amount": amount,
            "lane": "crypto" if asset in _CRYPTO_ASSETS else "etf",
            "route": constitution["asset_routes"].get(asset),
            "instrument": _instrument_for(asset, etf_universe, etf_resolutions),
        }
        for asset, amount in ticket["executable_allocation"].items()
        if amount > 0
    ]

    crypto = mandate["crypto_lane"]
    stock = mandate["stock_fund_etf_lane"]
    rationale_parts = []
    if crypto["status"] == "READY_FOR_MANUAL_BUY":
        rationale_parts.append(
            f"Buy {crypto['asset'].upper()} \u20ac{crypto['amount']:.2f} (crypto lane)"
        )
    if stock["status"] == "READY_FOR_MANUAL_BUY":
        rationale_parts.append(
            f"Buy {stock['asset']} \u20ac{stock['amount']:.2f} (ETF lane)"
        )

    rationale = "; ".join(rationale_parts) or "No buys recommended this week."
    dyn = result.get("dynamic_context", {})
    news_thesis = ""
    verdict_with_instruments = {
        **verdict,
        "sleeves": [
            {
                **sleeve,
                "instrument": _instrument_for(
                    sleeve.get("sleeve", ""), etf_universe, etf_resolutions
                ),
            }
            for sleeve in (verdict.get("sleeves") or [])
        ],
    }
    response = {
        "week_budget": ticket["weekly_budget"],
        "recommendations": recommendations,
        "rationale": rationale,
        "portfolio_mode": result["portfolio_mode"]["mode"],
        "regime": dyn.get("regime", regime),
        "phase": dyn.get("phase"),
        "phase_label": dyn.get("phase_label"),
        "dynamic_targets": dyn.get("asset_targets_pct"),
        "sleeve_targets": dyn.get("sleeve_targets_pct"),
        "warnings": ticket["warnings"],
        "news_thesis": news_thesis,
        "requires_approval": True,
        "etf_scoring_verdict": verdict_with_instruments,
        "weekly_dual_lane_mandate": result.get("weekly_dual_lane_mandate") or {},
        "portfolio_mode_details": result.get("portfolio_mode") or {},
        "approval_ticket_summary": {
            "blocked_actions": ticket.get("blocked_actions") or [],
            "fallback_actions": ticket.get("fallback_actions") or [],
            "reserve_actions": ticket.get("reserve_actions") or [],
            "safety_checks": ticket.get("safety_checks") or [],
        },
    }

    # Research context — advisory only; never overrides amounts or routes
    research_legs = [
        _build_research_leg_context(r["asset"], r["lane"])
        for r in recommendations
    ]
    legs_with_research = sum(1 for leg in research_legs if leg["memo_id"] is not None)
    legs_blocked = sum(
        1 for leg in research_legs if leg["evidence_status"] == "BLOCKED_BY_FAIL"
    )
    response["research_context"] = research_legs
    response["research_gate_summary"] = {
        "total_recommendation_legs": len(recommendations),
        "legs_with_research": legs_with_research,
        "legs_without_research": len(recommendations) - legs_with_research,
        "legs_blocked_by_failed_research": legs_blocked,
        "advisory_only": True,
        "recommendation_overridden": False,
        "trades_executed": False,
    }

    # Auto-save brief (once per ISO week — idempotent on repeated calls)
    week_label = _iso_week_label()
    if not database.brief_exists_for_week(week_label, "finance"):
        primary = recommendations[0] if recommendations else None
        database.save_brief(
            week_label=week_label,
            domain="finance",
            action="BUY" if recommendations else "HOLD",
            asset=primary["asset"] if primary else "portfolio",
            amount_eur=sum(r["amount"] for r in recommendations) or None,
            route=primary["route"] if primary else None,
            thesis=rationale,
            full_brief_json=json.dumps(response),
        )

    latest_brief = database.get_latest_brief_for_week(week_label, "finance")
    response["brief_id"] = latest_brief["id"] if latest_brief else None
    response["brief_status"] = latest_brief["status"] if latest_brief else None
    if latest_brief and latest_brief.get("user_action") is not None:
        response["brief_user_action"] = latest_brief["user_action"]
    response["week_label"] = week_label
    return response


_ASSET_DISPLAY_NAMES = {
    "btc": "Bitcoin",
    "hype": "Hyperliquid",
    "tao": "Bittensor",
    "global_core_etf": "Global Core ETF",
    "growth_nasdaq_etf": "Growth Nasdaq ETF",
    "quality_etf": "Quality ETF",
    "discovery": "Discovery",
    "tactical_reserve": "Tactical Reserve",
}

_LEGACY_DISPLAY_NAMES = {
    "lhv_growth_cash_pending_settlement": "LHV Cash (Pending)",
    "lhv_growth_euro_bond": "LHV Euro Bond",
    "lhv_growth_iemm": "LHV Emerging Markets",
    "lhv_growth_sxr8": "LHV S&P 500 (SXR8)",
    "lhv_growth_world_equities": "LHV World Equities",
    "lhv_growth_xcha": "LHV Corporate Bond (XCHA)",
}


@router.get("/holdings")
def finance_holdings(
    constitution: dict = Depends(get_finance_constitution),
    portfolio_state: dict = Depends(get_portfolio_state),
) -> dict:
    holdings = engine.investable_holdings(constitution, portfolio_state)
    statuses = engine.current_statuses(constitution, holdings)
    status_map = {s.name: s for s in statuses}

    active = []
    for key, value in portfolio_state.get("holdings", {}).items():
        s = status_map.get(key)
        active.append({
            "key": key,
            "display_name": _ASSET_DISPLAY_NAMES.get(key, key.replace("_", " ").title()),
            "amount": value,
            "sleeve": key,
            "route": constitution.get("asset_routes", {}).get(key),
            "band_status": s.band_status if s else "unknown",
            "current_weight": round(s.current_weight, 4) if s else 0.0,
            "target_weight": s.target_weight if s else 0.0,
            "is_crypto": key in _CRYPTO_ASSETS,
        })

    legacy = []
    for key, value in portfolio_state.get("legacy_holdings", {}).items():
        policy = constitution.get("legacy_holding_policy", {}).get(key, {})
        legacy.append({
            "key": key,
            "display_name": _LEGACY_DISPLAY_NAMES.get(key, key.replace("_", " ").title()),
            "amount": value,
            "maps_to": policy.get("maps_to"),
            "classification": policy.get("classification"),
        })

    return {
        "as_of": portfolio_state.get("as_of"),
        "holdings": active,
        "legacy_holdings": legacy,
        "note": "Prices not live — update portfolio_state.json for current values",
    }


_BRIEF_SYSTEM_PROMPT = """\
You are J.A.R.V.I.S., a personal investment assistant. You are concise, precise, and direct. No fluff. You reason about portfolio allocation and surface what matters.

Rules:
- Maximum 4 sentences
- Always end with "Requires your approval before any action."
- Never invent data — only use what is provided
- Reference the constitution rules where relevant
- If nothing needs buying this week, say so clearly\
"""


@router.get("/brief")
def finance_brief(
    constitution: dict = Depends(get_finance_constitution),
    portfolio_state: dict = Depends(get_portfolio_state),
) -> dict:
    result = engine.allocate_weekly_budget(constitution, portfolio_state)
    ticket = result["approval_ticket"]
    holdings = engine.investable_holdings(constitution, portfolio_state)
    statuses = engine.current_statuses(constitution, holdings)

    sleeve_lines = "\n".join(
        f"  {s.name}: €{engine.euros(s.current_value_cents):.2f}, "
        f"gap={s.gap:+.2%}, status={s.band_status}"
        for s in statuses
    )

    rec_lines = "\n".join(
        f"  {asset.upper()}: €{amount:.2f} via {constitution['asset_routes'].get(asset)} "
        f"({'crypto' if asset in _CRYPTO_ASSETS else 'etf'} lane)"
        for asset, amount in ticket["executable_allocation"].items()
        if amount > 0
    ) or "  None"

    mandate = ticket["weekly_dual_lane_mandate"]
    rationale_parts = []
    if mandate["crypto_lane"]["status"] == "READY_FOR_MANUAL_BUY":
        c = mandate["crypto_lane"]
        rationale_parts.append(f"Buy {c['asset'].upper()} €{c['amount']:.2f} (crypto lane)")
    if mandate["stock_fund_etf_lane"]["status"] == "READY_FOR_MANUAL_BUY":
        s = mandate["stock_fund_etf_lane"]
        rationale_parts.append(f"Buy {s['asset']} €{s['amount']:.2f} (ETF lane)")
    rationale = "; ".join(rationale_parts) or "No buys recommended this week."

    warnings_text = "; ".join(ticket["warnings"]) if ticket["warnings"] else "None"

    user_message = f"""\
Portfolio state as of {portfolio_state.get('as_of')}:
Total invested: €{engine.euros(sum(holdings.values())):.2f}
Weekly budget: €{ticket['weekly_budget']:.2f}
Portfolio mode: {result['portfolio_mode']['mode']}

Sleeve status:
{sleeve_lines}

Recommended actions:
{rec_lines}

Rationale from engine: {rationale}

Warnings: {warnings_text}

Constitution key rules:
- Dual lane mandate: crypto lane and ETF lane run independently
- Performance day heavy training blocked
- No API keys stored
- Manual approval required for all actions

Provide a brief, direct investment summary for this week.\
"""

    try:
        client = anthropic.Anthropic()
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=256,
            system=_BRIEF_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        brief_text = message.content[0].text
    except Exception:
        brief_text = (
            "Unable to generate brief. "
            "Raw recommendation available via /finance/recommendation."
        )

    return {"brief": brief_text, "requires_approval": True}


@router.post("/refresh-prices")
def finance_refresh_prices() -> dict:
    """Fetch live market prices via yfinance and update portfolio_state.json.

    This endpoint reads prices only — no trades are executed.
    Holdings with a ``units`` entry in portfolio_state.json are updated to
    reflect the current market value (units × live EUR price).
    Holdings without units are left unchanged; their key appears in
    ``needs_units`` so the user knows to add a unit count.
    """
    portfolio_state = engine.load_json(engine.DEFAULT_PORTFOLIO_STATE_PATH)
    constitution = engine.load_json(engine.DEFAULT_CONSTITUTION_PATH)

    updated_state, meta = update_portfolio_state_prices(portfolio_state, constitution)

    engine.DEFAULT_PORTFOLIO_STATE_PATH.write_text(
        json.dumps(updated_state, indent=2),
        encoding="utf-8",
    )

    return {
        "updated": True,
        "as_of": updated_state["as_of"],
        "prices_fetched": meta["prices_fetched"],
        "holdings_updated": meta["holdings_updated"],
        "needs_units": meta["needs_units"],
        "failed": meta["failed"],
        "requires_approval": False,
    }


def _brief_action(brief_id: int, status: str, user_action: str) -> dict:
    found = database.update_brief_status(brief_id, status, user_action)
    if not found:
        raise HTTPException(status_code=404, detail=f"Brief {brief_id} not found")
    week = _iso_week_label()
    return {
        "status": status,
        "brief_id": brief_id,
        "week_label": week,
        "requires_approval": False,
        "trades_executed": False,
        "broker_connection": False,
        "manual_record_only": True,
    }


@router.get("/ledger")
def finance_ledger() -> dict:
    transactions = [
        {
            **row,
            "manual_record_only": bool(row["manual_record_only"]),
            "trades_executed": bool(row["trades_executed"]),
            "broker_connection": bool(row["broker_connection"]),
        }
        for row in database.get_finance_transactions(limit=50)
    ]
    return {
        "transactions": transactions,
        "count": len(transactions),
        "manual_record_only": True,
        "trades_executed": False,
        "broker_connection": False,
    }


@router.post("/ledger/manual-transaction")
def finance_manual_transaction(payload: ManualFinanceTransaction) -> dict:
    if payload.brief_id is not None and not database.brief_exists_by_id(payload.brief_id):
        raise HTTPException(status_code=404, detail=f"Brief {payload.brief_id} not found")

    transaction_id = database.save_finance_transaction(payload.model_dump())
    return {
        "transaction_id": transaction_id,
        "manual_record_only": True,
        "trades_executed": False,
        "broker_connection": False,
        "portfolio_state_updated": False,
        "message": (
            "Manual record saved. PHOENIX did not execute a trade. "
            "Portfolio state was not updated automatically."
        ),
    }


@router.post("/brief/{brief_id}/approve")
def finance_brief_approve(brief_id: int) -> dict:
    return _brief_action(brief_id, "approved", "approved")


@router.post("/brief/{brief_id}/defer")
def finance_brief_defer(brief_id: int) -> dict:
    return _brief_action(brief_id, "deferred", "deferred")


@router.post("/brief/{brief_id}/reject")
def finance_brief_reject(brief_id: int) -> dict:
    return _brief_action(brief_id, "rejected", "rejected")


@router.get("/brief/history")
def finance_brief_history() -> dict:
    rows = database.get_brief_history(limit=50)
    return {"history": rows, "count": len(rows)}


@router.get("/research/memos")
def finance_research_memos() -> dict:
    memos = database.list_research_memos(limit=50)
    for memo in memos:
        memo["evidence_summary"] = database.get_research_memo_evidence_summary(
            memo["id"]
        )
    return {"memos": memos, "count": len(memos), **_RESEARCH_SAFETY_FLAGS}


@router.get("/research/memos/{memo_id}")
def finance_research_memo(memo_id: int) -> dict:
    memo = database.get_research_memo(memo_id)
    if memo is None:
        raise HTTPException(status_code=404, detail=f"Research memo {memo_id} not found")
    validation_records = database.list_research_validation_records_by_memo_id(memo_id)
    evidence_summary = database.get_research_memo_evidence_summary(memo_id)
    return {
        "memo": memo,
        "validation_records": validation_records,
        "evidence_summary": evidence_summary,
        **_RESEARCH_SAFETY_FLAGS,
    }


@router.post("/research/memos")
def finance_create_research_memo(payload: ResearchMemoPayload) -> dict:
    memo_id = database.create_research_memo(payload.model_dump())
    memo = database.get_research_memo(memo_id)
    return {"memo_id": memo_id, "memo": memo, **_RESEARCH_SAFETY_FLAGS}


@router.get("/research/validation-records")
def finance_research_validation_records() -> dict:
    records = database.list_research_validation_records(limit=100)
    return {"records": records, "count": len(records), **_RESEARCH_SAFETY_FLAGS}


@router.get("/research/validation-records/{record_id}")
def finance_research_validation_record(record_id: int) -> dict:
    record = database.get_research_validation_record(record_id)
    if record is None:
        raise HTTPException(
            status_code=404, detail=f"Research validation record {record_id} not found"
        )
    return {"record": record, **_RESEARCH_SAFETY_FLAGS}


@router.post("/research/validation-records")
def finance_create_research_validation_record(
    payload: ResearchValidationRecordPayload,
) -> dict:
    record_id = database.create_research_validation_record(payload.model_dump())
    record = database.get_research_validation_record(record_id)
    return {"record_id": record_id, "record": record, **_RESEARCH_SAFETY_FLAGS}


@router.get("/performance/history")
def finance_performance_history() -> dict:
    """Return real recorded performance snapshots, newest first."""
    snapshots = database.list_finance_portfolio_snapshots(limit=100)
    for snapshot in snapshots:
        snapshot["trades_executed"] = False
        snapshot["broker_connection"] = False
    return {
        "snapshots": snapshots,
        "count": len(snapshots),
        "source": "real_sqlite",
        "message": (
            "Real performance snapshots recorded from explicit portfolio applies."
            if snapshots
            else "No real performance snapshots recorded yet."
        ),
        "mock_data": False,
    }


# ---------------------------------------------------------------------------
# Apply-gate helpers (pure — never touch the filesystem)
# ---------------------------------------------------------------------------

def _build_transaction_apply_preview(
    transaction: dict, portfolio_state: dict
) -> tuple[dict, dict]:
    """Return (before, after) snapshots for a buy transaction applied to portfolio_state.

    Does NOT mutate either input.  Raises HTTPException on unsupported cases.
    """
    asset = transaction["asset"]
    holdings = portfolio_state.get("holdings", {})

    if asset not in holdings:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Asset '{asset}' not found in portfolio_state holdings. "
                "Only assets already tracked in portfolio_state are supported in v1."
            ),
        )

    before_holdings = copy.deepcopy(holdings)
    before_units = copy.deepcopy(portfolio_state.get("units", {}))

    after_holdings = copy.deepcopy(before_holdings)
    after_holdings[asset] = round(
        (after_holdings.get(asset) or 0.0) + transaction["amount_eur"], 10
    )

    after_units = copy.deepcopy(before_units)
    if asset in after_units:
        current = after_units[asset]
        if current is None:
            current = 0.0
        after_units[asset] = round(current + transaction["units"], 10)

    before: dict = {
        "holdings": before_holdings,
        "units": before_units,
        "as_of": portfolio_state.get("as_of"),
    }
    after: dict = {
        "holdings": after_holdings,
        "units": after_units,
        "as_of": datetime.now(timezone.utc).date().isoformat(),
    }
    return before, after


def _apply_transaction_to_portfolio_state(
    transaction: dict, portfolio_state: dict
) -> tuple[dict, dict, dict]:
    """Return (updated_portfolio_state, before, after).

    Does NOT write files. Does NOT mutate the input portfolio_state.
    """
    before, after = _build_transaction_apply_preview(transaction, portfolio_state)

    new_state = copy.deepcopy(portfolio_state)
    new_state["holdings"] = after["holdings"]
    if after["units"]:
        new_state["units"] = after["units"]
    new_state["as_of"] = after["as_of"]

    return new_state, before, after


# ---------------------------------------------------------------------------
# Apply-gate routes
# ---------------------------------------------------------------------------

@router.get("/ledger/{transaction_id}/apply-preview")
def finance_ledger_apply_preview(transaction_id: int) -> dict:
    transaction = database.get_finance_transaction(transaction_id)
    if transaction is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found")
    if database.finance_transaction_is_applied(transaction_id):
        raise HTTPException(
            status_code=409,
            detail=f"Transaction {transaction_id} has already been applied to portfolio_state.",
        )

    portfolio_state = engine.load_json(engine.DEFAULT_PORTFOLIO_STATE_PATH)
    before, after = _build_transaction_apply_preview(transaction, portfolio_state)

    return {
        "transaction_id": transaction_id,
        "asset": transaction["asset"],
        "symbol": transaction.get("symbol"),
        "side": transaction["side"],
        "units_delta": transaction["units"],
        "amount_eur_delta": transaction["amount_eur"],
        "fee_eur": transaction.get("fee_eur", 0),
        "before": before,
        "after": after,
        "portfolio_state_updated": False,
        "requires_explicit_apply": True,
        "manual_record_only": True,
        "trades_executed": False,
        "broker_connection": False,
    }


@router.post("/ledger/{transaction_id}/apply")
def finance_ledger_apply(transaction_id: int) -> dict:
    transaction = database.get_finance_transaction(transaction_id)
    if transaction is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found")
    if database.finance_transaction_is_applied(transaction_id):
        raise HTTPException(
            status_code=409,
            detail=f"Transaction {transaction_id} has already been applied to portfolio_state.",
        )

    portfolio_state = engine.load_json(engine.DEFAULT_PORTFOLIO_STATE_PATH)
    new_state, before, after = _apply_transaction_to_portfolio_state(transaction, portfolio_state)

    engine.DEFAULT_PORTFOLIO_STATE_PATH.write_text(
        json.dumps(new_state, indent=2), encoding="utf-8"
    )

    snapshot = json.dumps({"before": before, "after": after})
    database.mark_finance_transaction_applied(transaction_id, snapshot)
    performance_snapshot = database.create_finance_portfolio_snapshot(
        trigger="ledger_apply",
        transaction_id=transaction_id,
        notes="Created after explicit manual transaction apply.",
    )

    applied_row = database.get_finance_transaction(transaction_id)
    return {
        "transaction_id": transaction_id,
        "applied_at": applied_row.get("applied_at") if applied_row else None,
        "portfolio_state_updated": True,
        "manual_record_only": True,
        "trades_executed": False,
        "broker_connection": False,
        "performance_snapshot_id": performance_snapshot["id"],
        "before": before,
        "after": after,
        "message": (
            "Manual transaction applied to portfolio_state.json. "
            "PHOENIX did not execute a trade."
        ),
    }
