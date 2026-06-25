"""Finance API routes. Routers call engines; no business logic lives here."""

import anthropic
from fastapi import APIRouter, Depends

from jarvis.api.dependencies import get_finance_constitution, get_portfolio_state
from jarvis.domains.finance import engine

router = APIRouter()

_CRYPTO_ASSETS = {"btc", "hype", "tao"}


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
) -> dict:
    result = engine.allocate_weekly_budget(constitution, portfolio_state)
    ticket = result["approval_ticket"]
    mandate = ticket["weekly_dual_lane_mandate"]

    recommendations = [
        {
            "asset": asset,
            "amount": amount,
            "lane": "crypto" if asset in _CRYPTO_ASSETS else "etf",
            "route": constitution["asset_routes"].get(asset),
        }
        for asset, amount in ticket["executable_allocation"].items()
        if amount > 0
    ]

    crypto = mandate["crypto_lane"]
    stock = mandate["stock_fund_etf_lane"]
    rationale_parts = []
    if crypto["status"] == "READY_FOR_MANUAL_BUY":
        rationale_parts.append(
            f"Buy {crypto['asset'].upper()} €{crypto['amount']:.2f} (crypto lane)"
        )
    if stock["status"] == "READY_FOR_MANUAL_BUY":
        rationale_parts.append(
            f"Buy {stock['asset']} €{stock['amount']:.2f} (ETF lane)"
        )

    return {
        "week_budget": ticket["weekly_budget"],
        "recommendations": recommendations,
        "rationale": "; ".join(rationale_parts) or "No buys recommended this week.",
        "portfolio_mode": result["portfolio_mode"]["mode"],
        "warnings": ticket["warnings"],
        "requires_approval": True,
    }


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
