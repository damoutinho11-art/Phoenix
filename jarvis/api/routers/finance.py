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


class DraftMemoPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    asset: str = Field(min_length=1)
    sleeve: str | None = None
    title: str | None = None
    source_context: str | None = None


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

_DRAFT_SAFETY_FLAGS = {
    **_RESEARCH_SAFETY_FLAGS,
    "draft_only": True,
}

_CRYPTO_DRAFT_RISKS = [
    "Price volatility — high correlation to broader crypto market",
    "Regulatory risk — evolving regulatory environment",
    "Liquidity risk — market depth may be thin",
    "Insufficient research — draft generated from portfolio context only",
]

_ETF_DRAFT_RISKS = [
    "Market risk — exposure to equity market drawdowns",
    "Tracking error — possible divergence from benchmark",
    "Currency risk — exposure to non-EUR assets",
    "Insufficient research — draft generated from portfolio context only",
]

_GENERIC_DRAFT_RISKS = [
    "Insufficient research — draft generated from portfolio context only",
    "No external source validation performed",
]


def _build_draft_memo_content(
    asset: str,
    sleeve: str | None,
    title: str | None,
    source_context: str | None,
    constitution: dict,
    portfolio_state: dict,
) -> dict:
    """Build draft memo fields from local PHOENIX context only.

    Does NOT call external APIs, does NOT mutate state, does NOT execute trades.
    Returns a payload dict suitable for create_research_memo().
    """
    holdings = portfolio_state.get("holdings", {})
    current_eur = holdings.get(asset, 0.0) or 0.0
    all_values = [v for v in holdings.values() if isinstance(v, (int, float))]
    total_eur = sum(all_values) if all_values else 0.0

    target_weights = constitution.get("target_weights", {})
    target_weight_pct = round((target_weights.get(asset, 0.0) or 0.0) * 100, 1)
    current_weight_pct = round((current_eur / total_eur * 100) if total_eur > 0 else 0.0, 1)
    gap_pct = round(target_weight_pct - current_weight_pct, 1)
    route = constitution.get("asset_routes", {}).get(asset, "unknown")
    portfolio_as_of = portfolio_state.get("as_of", "unknown")

    existing_memo = database.find_active_research_memo_for_leg(asset, sleeve)
    existing_note = (
        f"Existing active memo found: '{existing_memo['title']}' (id={existing_memo['id']})."
        if existing_memo
        else "No existing active research memo found."
    )

    context_lines = [
        f"Asset: {asset}",
        f"Portfolio sleeve/lane: {sleeve or asset}",
        f"Current allocation: €{current_eur:.2f} ({current_weight_pct:.1f}% of portfolio as of {portfolio_as_of})",
        f"Target weight: {target_weight_pct:.1f}%",
        f"Allocation gap: {gap_pct:+.1f}%",
        f"Route: {route}",
        existing_note,
    ]
    if source_context:
        context_lines.append(f"Analyst note: {source_context}")

    thesis = (
        "[GENERATED DRAFT — REQUIRES HUMAN REVIEW]\n\n"
        + "\n".join(context_lines)
        + "\n\nThis draft was generated from local PHOENIX portfolio context only. "
        "No external sources were checked. Human review and evidence validation are required before use."
    )

    if asset in _CRYPTO_ASSETS:
        risks = _CRYPTO_DRAFT_RISKS
    elif route and route != "unknown":
        risks = _ETF_DRAFT_RISKS
    else:
        risks = _GENERIC_DRAFT_RISKS

    return {
        "asset": asset,
        "sleeve": sleeve,
        "title": title or f"Draft: {asset} research memo",
        "thesis": thesis,
        "risks": list(risks),
        "data_confidence": "LOW",
        "verdict": "INSUFFICIENT_DATA",
        "sources": [],
        "validation": {},
        "status": "draft",
        "notes": "Generated draft. Requires human review.",
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


@router.post("/research/draft-memo")
def finance_draft_research_memo(
    payload: DraftMemoPayload,
    constitution: dict = Depends(get_finance_constitution),
    portfolio_state: dict = Depends(get_portfolio_state),
) -> dict:
    """Generate a structured draft research memo from local PHOENIX context.

    Advisory only — no trades, no state mutations, no external API calls.
    The draft is stored with status=draft and must be reviewed and promoted by the user.
    """
    content = _build_draft_memo_content(
        asset=payload.asset,
        sleeve=payload.sleeve,
        title=payload.title,
        source_context=payload.source_context,
        constitution=constitution,
        portfolio_state=portfolio_state,
    )
    memo_id = database.create_research_memo(content)
    memo = database.get_research_memo(memo_id)
    return {
        "memo_id": memo_id,
        "memo": memo,
        **_DRAFT_SAFETY_FLAGS,
    }


_QUALITY_GATE_SAFETY_FLAGS = {
    "research_only": True,
    "quality_gate_only": True,
    "investment_approval": False,
    "trades_executed": False,
    "broker_connection": False,
    "portfolio_state_updated": False,
    "recommendation_overridden": False,
}


@router.post("/research/memos/{memo_id}/quality-gate")
def finance_research_memo_quality_gate(memo_id: int) -> dict:
    """Run the research quality gate for one memo.

    Evaluates memo + validation records against hard gates.
    May promote status to 'active' if all gates pass (VALIDATED).
    Advisory only — does not approve trades or mutate portfolio state.
    """
    try:
        result = database.evaluate_research_memo_quality(memo_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Research memo {memo_id} not found")
    return {**result, **_QUALITY_GATE_SAFETY_FLAGS}


class GenerateEvidencePayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    run_quality_gate_after: bool = False


_GENERATE_EVIDENCE_SAFETY_FLAGS: dict = {
    "evidence_generation_only": True,
    "research_only": True,
    "investment_approval": False,
    "trades_executed": False,
    "broker_connection": False,
    "portfolio_state_updated": False,
    "recommendation_overridden": False,
}


_PHOENIX_GENERATOR_MARKER = "PHOENIX_EVIDENCE_GENERATOR_V1"


def _is_phoenix_generated(record: dict) -> bool:
    """Return True if the record was created by the PHOENIX evidence generator.

    Accepts records with the explicit generated_by marker (new records) or with
    a source_primary starting with "PHOENIX" (legacy production records before the marker
    was introduced). Manual/user records neither carry the marker nor use PHOENIX source prefixes.
    """
    raw = record.get("raw_json") or {}
    if raw.get("generated_by") == _PHOENIX_GENERATOR_MARKER:
        return True
    return (record.get("source_primary") or "").startswith("PHOENIX")


def _check_content_changed(existing: dict, new_check: dict) -> bool:
    """Return True if any content field differs between the existing DB record and new check."""
    compare_fields = (
        "status", "confidence", "primary_value", "secondary_value",
        "consensus_value", "notes", "source_primary", "source_secondary",
    )
    for field in compare_fields:
        if existing.get(field) != new_check.get(field):
            return True
    # Compare raw_json by value (ignoring key order)
    existing_raw = existing.get("raw_json") or {}
    new_raw = new_check.get("raw_json") or {}
    if existing_raw != new_raw:
        return True
    return False


def _generate_evidence_records(
    memo_id: int,
    memo: dict,
    constitution: dict,
    portfolio_state: dict,
    profile: dict,
) -> tuple[list[dict], int, int]:  # (created, skipped, updated)
    """Build validation records from local PHOENIX data only.

    Four checks per memo (market_data_source, broker_source, recommendation_leg_mapping,
    portfolio_allocation_context). No external APIs, no broker execution, no portfolio mutation.
    Returns (created_records, skipped_count).
    """
    asset = memo.get("asset") or ""
    target_weights = constitution.get("target_weights", {})
    asset_routes = constitution.get("asset_routes", {})
    holdings = portfolio_state.get("holdings", {})

    try:
        regime = detect_market_regime(portfolio_state)
    except Exception:
        regime = "neutral"
    mandate: dict = {}
    try:
        result = engine.allocate_weekly_budget(
            constitution, portfolio_state, regime=regime, profile=profile
        )
        ticket = result.get("approval_ticket", {})
        exec_alloc: dict = ticket.get("executable_allocation", {})
        mandate = ticket.get("weekly_dual_lane_mandate", {})

        # Normalise to lowercase keys; only include amounts > 0 (same filter as recommendation endpoint)
        rec_by_asset: dict = {
            k.strip().lower(): {
                "asset": k,
                "amount": v,
                "route": asset_routes.get(k),
            }
            for k, v in exec_alloc.items()
            if (v or 0) > 0
        }
        # Supplement from both mandate lanes (catches assets not yet in exec_alloc for any reason)
        for _lane_key in ("crypto_lane", "stock_fund_etf_lane"):
            _lane = mandate.get(_lane_key, {})
            _la = (_lane.get("asset") or "").strip().lower()
            if _la and _la not in rec_by_asset and (_lane.get("amount") or 0) > 0:
                rec_by_asset[_la] = {
                    "asset": _lane.get("asset"),
                    "amount": _lane.get("amount", 0),
                    "route": asset_routes.get(_lane.get("asset", "")),
                }
    except Exception:
        rec_by_asset = {}

    # Check A — SOURCE_CONFIDENCE: market_data_source
    if asset in _CRYPTO_ASSETS:
        check_a: dict = {
            "memo_id": memo_id, "asset": asset,
            "check_type": "SOURCE_CONFIDENCE", "field_name": "market_data_source",
            "source_primary": "PHOENIX internal knowledge", "source_secondary": None,
            "primary_value": None, "secondary_value": None, "consensus_value": None,
            "tolerance_pct": None, "deviation_pct": None,
            "status": "UNVERIFIED", "confidence": "medium",
            "notes": (
                f"Crypto asset '{asset}': no yfinance market data in PHOENIX. "
                "Verify price data source manually."
            ),
            "raw_json": {
                "asset": asset, "asset_type": "crypto",
                "market_data_source": None, "source": "PHOENIX_internal",
            },
        }
    else:
        check_a = {
            "memo_id": memo_id, "asset": asset,
            "check_type": "SOURCE_CONFIDENCE", "field_name": "market_data_source",
            "source_primary": "PHOENIX ETF universe / yfinance", "source_secondary": None,
            "primary_value": "yfinance", "secondary_value": None, "consensus_value": "yfinance",
            "tolerance_pct": None, "deviation_pct": None,
            "status": "PASS", "confidence": "medium",
            "notes": f"ETF/fund asset '{asset}': yfinance is the market data source in PHOENIX.",
            "raw_json": {
                "asset": asset, "asset_type": "etf_or_fund",
                "market_data_source": "yfinance", "source": "PHOENIX_ETF_universe",
            },
        }

    # Check B — SOURCE_CONFIDENCE: broker_source
    route = asset_routes.get(asset)
    if route:
        check_b: dict = {
            "memo_id": memo_id, "asset": asset,
            "check_type": "SOURCE_CONFIDENCE", "field_name": "broker_source",
            "source_primary": "PHOENIX constitution asset_routes", "source_secondary": None,
            "primary_value": route, "secondary_value": None, "consensus_value": route,
            "tolerance_pct": None, "deviation_pct": None,
            "status": "PASS", "confidence": "high",
            "notes": (
                f"Route '{route}' confirmed in PHOENIX constitution. "
                "Broker/platform routing verified."
            ),
            "raw_json": {"asset": asset, "route": route, "source": "constitution_asset_routes"},
        }
    else:
        check_b = {
            "memo_id": memo_id, "asset": asset,
            "check_type": "SOURCE_CONFIDENCE", "field_name": "broker_source",
            "source_primary": "PHOENIX constitution asset_routes", "source_secondary": None,
            "primary_value": None, "secondary_value": None, "consensus_value": None,
            "tolerance_pct": None, "deviation_pct": None,
            "status": "UNVERIFIED", "confidence": "low",
            "notes": (
                f"No route found for '{asset}' in PHOENIX constitution. "
                "Cannot verify broker/platform."
            ),
            "raw_json": {"asset": asset, "route": None, "source": "constitution_asset_routes"},
        }

    # Check C — CROSS_SOURCE: recommendation_leg_mapping
    # Normalize asset and sleeve for case-insensitive matching
    asset_lower = asset.strip().lower()
    sleeve_lower = (memo.get("sleeve") or "").strip().lower()
    matching_action = rec_by_asset.get(asset_lower)
    # Sleeve fallback: memo.sleeve can match recommendation.asset (e.g. quality_etf) or lane name
    if not matching_action and sleeve_lower:
        matching_action = rec_by_asset.get(sleeve_lower)
        if not matching_action:
            for _lane_key in ("crypto_lane", "stock_fund_etf_lane"):
                _lane = mandate.get(_lane_key, {})
                if (_lane.get("asset") or "").strip().lower() == sleeve_lower:
                    matching_action = rec_by_asset.get((_lane.get("asset") or "").strip().lower())
                    break
    in_targets = asset in target_weights and (target_weights.get(asset) or 0) > 0
    if matching_action:
        check_c: dict = {
            "memo_id": memo_id, "asset": asset,
            "check_type": "CROSS_SOURCE", "field_name": "recommendation_leg_mapping",
            "source_primary": "PHOENIX recommendation engine",
            "source_secondary": "PHOENIX constitution target_weights",
            "primary_value": f"amount={matching_action.get('amount', 0):.2f}",
            "secondary_value": str(target_weights[asset]) if asset in target_weights else None,
            "consensus_value": f"amount={matching_action.get('amount', 0):.2f}",
            "tolerance_pct": None, "deviation_pct": None,
            "status": "PASS", "confidence": "high",
            "notes": (
                f"Asset '{asset}' matched active recommendation leg: "
                f"€{matching_action.get('amount', 0):.2f} via route '{matching_action.get('route')}'."
            ),
            "raw_json": {
                "asset": asset, "in_recommendation": True,
                "amount": matching_action.get("amount"),
                "route": matching_action.get("route"),
                "target_weight": target_weights.get(asset),
                "recommendation_assets": sorted(rec_by_asset.keys()),
            },
        }
    elif in_targets:
        check_c = {
            "memo_id": memo_id, "asset": asset,
            "check_type": "CROSS_SOURCE", "field_name": "recommendation_leg_mapping",
            "source_primary": "PHOENIX recommendation engine",
            "source_secondary": "PHOENIX constitution target_weights",
            "primary_value": None,
            "secondary_value": str(target_weights[asset]),
            "consensus_value": None,
            "tolerance_pct": None, "deviation_pct": None,
            "status": "WARNING", "confidence": "medium",
            "notes": (
                f"Asset '{asset}' has target weight {target_weights[asset]} but is not in "
                "current week's executable allocation. May be deferred or in a future cycle."
            ),
            "raw_json": {
                "asset": asset, "in_recommendation": False,
                "target_weight": target_weights.get(asset),
                "recommendation_assets": list(rec_by_asset.keys()),
            },
        }
    else:
        check_c = {
            "memo_id": memo_id, "asset": asset,
            "check_type": "CROSS_SOURCE", "field_name": "recommendation_leg_mapping",
            "source_primary": "PHOENIX recommendation engine",
            "source_secondary": "PHOENIX constitution target_weights",
            "primary_value": None, "secondary_value": None, "consensus_value": None,
            "tolerance_pct": None, "deviation_pct": None,
            "status": "UNVERIFIED", "confidence": "low",
            "notes": (
                f"Asset '{asset}' not found in PHOENIX recommendations or "
                "constitution target weights."
            ),
            "raw_json": {
                "asset": asset, "in_recommendation": False,
                "target_weight": None,
                "recommendation_assets": list(rec_by_asset.keys()),
            },
        }

    # Check D — MANUAL_REVIEW: portfolio_allocation_context
    target_weight = target_weights.get(asset)
    current_value = holdings.get(asset)
    if target_weight is not None and current_value is not None:
        check_d: dict = {
            "memo_id": memo_id, "asset": asset,
            "check_type": "MANUAL_REVIEW", "field_name": "portfolio_allocation_context",
            "source_primary": "PHOENIX portfolio_state holdings",
            "source_secondary": "PHOENIX constitution target_weights",
            "primary_value": str(current_value),
            "secondary_value": str(target_weight),
            "consensus_value": f"target={target_weight},current={current_value}",
            "tolerance_pct": None, "deviation_pct": None,
            "status": "PASS", "confidence": "high",
            "notes": (
                f"Allocation context confirmed: target_weight={target_weight}, "
                f"current_value=€{current_value}."
            ),
            "raw_json": {
                "asset": asset,
                "target_weight": target_weight,
                "current_value_eur": current_value,
                "portfolio_as_of": portfolio_state.get("as_of"),
            },
        }
    elif target_weight is not None:
        check_d = {
            "memo_id": memo_id, "asset": asset,
            "check_type": "MANUAL_REVIEW", "field_name": "portfolio_allocation_context",
            "source_primary": "PHOENIX portfolio_state holdings",
            "source_secondary": "PHOENIX constitution target_weights",
            "primary_value": None,
            "secondary_value": str(target_weight),
            "consensus_value": None,
            "tolerance_pct": None, "deviation_pct": None,
            "status": "WARNING", "confidence": "medium",
            "notes": (
                f"Target weight {target_weight} found for '{asset}' but no current holdings. "
                "Asset may not yet be in portfolio."
            ),
            "raw_json": {
                "asset": asset,
                "target_weight": target_weight,
                "current_value_eur": None,
                "portfolio_as_of": portfolio_state.get("as_of"),
            },
        }
    else:
        check_d = {
            "memo_id": memo_id, "asset": asset,
            "check_type": "MANUAL_REVIEW", "field_name": "portfolio_allocation_context",
            "source_primary": "PHOENIX portfolio_state holdings",
            "source_secondary": "PHOENIX constitution target_weights",
            "primary_value": None, "secondary_value": None, "consensus_value": None,
            "tolerance_pct": None, "deviation_pct": None,
            "status": "UNVERIFIED", "confidence": "low",
            "notes": f"No target weight or holding data found for '{asset}' in PHOENIX.",
            "raw_json": {
                "asset": asset,
                "target_weight": None,
                "current_value_eur": None,
                "portfolio_as_of": portfolio_state.get("as_of"),
            },
        }

    # Stamp generator marker so records can be identified for safe repair later
    for _check in (check_a, check_b, check_c, check_d):
        _check["raw_json"]["generated_by"] = _PHOENIX_GENERATOR_MARKER

    created: list[dict] = []
    skipped = 0
    updated = 0
    for check in (check_a, check_b, check_c, check_d):
        existing = database.get_research_validation_record_by_memo_check_field(
            memo_id, check["check_type"], check["field_name"]
        )
        if existing is None:
            record_id = database.create_research_validation_record(check)
            record = database.get_research_validation_record(record_id)
            if record is not None:
                created.append(record)
        elif _is_phoenix_generated(existing):
            if _check_content_changed(existing, check):
                database.update_research_validation_record(existing["id"], check)
                record = database.get_research_validation_record(existing["id"])
                if record is not None:
                    created.append(record)  # include updated record in records list
                updated += 1
            else:
                skipped += 1
        else:
            # Manual/user record — never overwrite
            skipped += 1

    return created, skipped, updated


class SynthesizeFromEvidencePayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    run_quality_gate_after: bool = False


_SYNTHESIS_SAFETY_FLAGS: dict = {
    "research_only": True,
    "synthesis_only": True,
    "investment_approval": False,
    "trades_executed": False,
    "broker_connection": False,
    "portfolio_state_updated": False,
    "recommendation_overridden": False,
}

_SYNTHESIS_EVIDENCE_RISKS = {
    "fail": "Validation check(s) FAILED — do not act without resolution",
    "warning": "Unresolved WARNING evidence — further review required",
    "unverified": "UNVERIFIED evidence records — external confirmation needed",
    "insufficient": "Insufficient validated evidence — fewer than 2 PASS records",
    "no_records": "No validation records — insufficient evidence for any assessment",
    "local_only": "All evidence is local PHOENIX data only — no external sources checked",
}


def _synthesize_memo_from_evidence(
    memo: dict,
    records: list[dict],
) -> tuple[dict, dict]:
    """Derive verdict, data_confidence, thesis, risks, and notes from linked evidence records.

    Returns (synthesis_result, new_fields).
    Pure function — no DB reads or writes.
    """
    asset = memo.get("asset") or ""
    pass_count = sum(1 for r in records if r["status"] == "PASS")
    fail_count = sum(1 for r in records if r["status"] == "FAIL")
    warning_count = sum(1 for r in records if r["status"] == "WARNING")
    unverified_count = sum(1 for r in records if r["status"] == "UNVERIFIED")
    total = len(records)

    evidence_counts = {
        "total": total,
        "pass": pass_count,
        "fail": fail_count,
        "warning": warning_count,
        "unverified": unverified_count,
    }

    # Base asset risks (drop the generic "insufficient research" placeholder from draft)
    if asset in _CRYPTO_ASSETS:
        base_risks = [r for r in _CRYPTO_DRAFT_RISKS if "Insufficient research" not in r]
    elif asset:
        base_risks = [r for r in _ETF_DRAFT_RISKS if "Insufficient research" not in r]
    else:
        base_risks = []

    # Always append local-only limitation risk
    evidence_risks = [_SYNTHESIS_EVIDENCE_RISKS["local_only"]]

    # --- Apply synthesis rules in priority order ---
    if total == 0:
        # Rule E: no records
        verdict = "INSUFFICIENT_DATA"
        data_confidence = "LOW"
        rule_applied = "E"
        rule_reason = "No validation records attached. Cannot synthesize."
        verdict_line = "No evidence records linked to this memo. Verdict cannot be determined."
        evidence_risks = [_SYNTHESIS_EVIDENCE_RISKS["no_records"]] + evidence_risks

    elif fail_count > 0:
        # Rule A: any FAIL → REJECT
        verdict = "REJECT"
        data_confidence = "MEDIUM"
        rule_applied = "A"
        rule_reason = (
            f"{fail_count} FAIL validation record(s). "
            "Asset flagged by evidence — treat as rejected until resolved."
        )
        verdict_line = (
            f"REJECTED by evidence: {fail_count} FAIL record(s) detected. "
            "Do not proceed until failed checks are resolved."
        )
        evidence_risks = [
            f"{fail_count} validation check(s) FAILED — resolve before acting",
        ] + evidence_risks

    elif warning_count > 0 or unverified_count > 0:
        # Rule B: any WARNING or UNVERIFIED → INSUFFICIENT_DATA
        verdict = "INSUFFICIENT_DATA"
        data_confidence = "LOW"
        rule_applied = "B"
        rule_reason = (
            f"{warning_count} WARNING and {unverified_count} UNVERIFIED record(s). "
            "Evidence is incomplete — resolve before advancing."
        )
        verdict_line = (
            f"Evidence incomplete: {warning_count} WARNING, {unverified_count} UNVERIFIED. "
            "Resolve open checks before re-synthesizing."
        )
        evidence_risks = [_SYNTHESIS_EVIDENCE_RISKS["warning"]] + evidence_risks

    elif pass_count < 2:
        # Rule C: fewer than 2 PASS
        verdict = "INSUFFICIENT_DATA"
        data_confidence = "LOW"
        rule_applied = "C"
        rule_reason = f"Only {pass_count} PASS record(s). Minimum 2 required."
        verdict_line = (
            f"Insufficient PASS records: {pass_count} of 2 required. "
            "Generate more evidence records or add manual validation."
        )
        evidence_risks = [_SYNTHESIS_EVIDENCE_RISKS["insufficient"]] + evidence_risks

    else:
        # Rule D: ≥2 PASS, 0 FAIL, 0 WARNING, 0 UNVERIFIED → WATCH
        # v1: never auto-set BUY_CANDIDATE
        verdict = "WATCH"
        all_high = all(r.get("confidence") == "high" for r in records)
        data_confidence = "HIGH" if all_high else "MEDIUM"
        rule_applied = "D"
        rule_reason = (
            f"All {pass_count} PASS records, no FAIL/WARNING/UNVERIFIED. "
            f"Data confidence: {data_confidence}."
        )
        verdict_line = (
            f"Evidence supports WATCH: {pass_count} PASS records, all clean. "
            "BUY_CANDIDATE requires external research and is not auto-assigned."
        )

    thesis = (
        f"PHOENIX Autonomous Synthesis — generated from {total} linked validation record(s).\n\n"
        f"Evidence summary: {pass_count} PASS · {fail_count} FAIL · "
        f"{warning_count} WARNING · {unverified_count} UNVERIFIED\n\n"
        f"Assessment: {verdict_line}\n\n"
        "Source limitation: Evidence derived from local PHOENIX data only "
        "(recommendation context, constitution routing, portfolio state). "
        "No external market research, analyst reports, or third-party sources were checked.\n\n"
        "This synthesis does not constitute investment approval or a trade signal. "
        "Manual review required before any action."
    )

    risks = base_risks + evidence_risks

    notes = (
        f"[PHOENIX Synthesis · Rule {rule_applied}] {rule_reason} "
        "Synthesis only — not an investment approval."
    )

    synthesis_result = {
        "rule_applied": rule_applied,
        "rule_reason": rule_reason,
        "evidence_counts": evidence_counts,
        "verdict": verdict,
        "data_confidence": data_confidence,
        "source_limitation": (
            "Local PHOENIX data only. No external research sources checked."
        ),
        "buy_candidate_auto_assigned": False,
        "synthesis_only": True,
        "investment_approval": False,
    }

    new_fields = {
        "thesis": thesis,
        "risks": risks,
        "verdict": verdict,
        "data_confidence": data_confidence,
        "notes": notes,
    }

    return synthesis_result, new_fields


@router.post("/research/memos/{memo_id}/synthesize-from-evidence")
def finance_research_synthesize_from_evidence(
    memo_id: int,
    payload: SynthesizeFromEvidencePayload,
) -> dict:
    """Synthesize memo thesis/verdict/data_confidence from linked validation records.

    Updates thesis, risks, verdict, data_confidence, notes only.
    Never mutates portfolio_state, recommendation amounts, or lifecycle status.
    Quality gate must still be run separately (or via run_quality_gate_after=true).
    """
    memo = database.get_research_memo(memo_id)
    if memo is None:
        raise HTTPException(status_code=404, detail=f"Research memo {memo_id} not found")

    records = database.list_research_validation_records_by_memo_id(memo_id)
    synthesis_result, new_fields = _synthesize_memo_from_evidence(memo, records)

    database.update_research_memo_content(
        memo_id=memo_id,
        thesis=new_fields["thesis"],
        risks=new_fields["risks"],
        verdict=new_fields["verdict"],
        data_confidence=new_fields["data_confidence"],
        notes=new_fields["notes"],
    )

    updated_memo = database.get_research_memo(memo_id)
    response: dict = {
        "memo_id": memo_id,
        "synthesis_result": synthesis_result,
        "memo": updated_memo,
        **_SYNTHESIS_SAFETY_FLAGS,
    }

    if payload.run_quality_gate_after:
        gate_result = database.evaluate_research_memo_quality(memo_id)
        response["quality_gate_result"] = gate_result

    return response


@router.post("/research/memos/{memo_id}/generate-evidence")
def finance_research_generate_evidence(
    memo_id: int,
    payload: GenerateEvidencePayload,
    constitution: dict = Depends(get_finance_constitution),
    portfolio_state: dict = Depends(get_portfolio_state),
    profile: dict = Depends(get_finance_profile),
) -> dict:
    """Generate validation records from local PHOENIX data.

    Checks: market_data_source, broker_source, recommendation_leg_mapping,
    portfolio_allocation_context. No external APIs. No broker execution. No state mutation.
    Quality gate is separate — triggered only when run_quality_gate_after=true.
    """
    memo = database.get_research_memo(memo_id)
    if memo is None:
        raise HTTPException(status_code=404, detail=f"Research memo {memo_id} not found")

    created_records, skipped_count, updated_count = _generate_evidence_records(
        memo_id=memo_id,
        memo=memo,
        constitution=constitution,
        portfolio_state=portfolio_state,
        profile=profile,
    )

    response: dict = {
        "memo_id": memo_id,
        "generated_count": len(created_records) - updated_count,
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "records": created_records,
        **_GENERATE_EVIDENCE_SAFETY_FLAGS,
    }

    if payload.run_quality_gate_after:
        gate_result = database.evaluate_research_memo_quality(memo_id)
        response["quality_gate_result"] = gate_result

    return response


@router.post("/research/quality-gate/run")
def finance_research_quality_gate_run() -> dict:
    """Run the research quality gate for all non-archived memos.

    Advisory only — does not approve trades or mutate portfolio state.
    """
    results = database.run_quality_gate_for_all()
    return {
        "results": results,
        "total_evaluated": len(results),
        **_QUALITY_GATE_SAFETY_FLAGS,
    }


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
