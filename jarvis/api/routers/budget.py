"""Budget API — parse, save, and summarise personal bank transactions."""

import io
import hashlib
import json
import math
import re
import unicodedata
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, field_validator
from pypdf import PdfReader

from jarvis.api import ai_gateway
from jarvis.core import clock
from jarvis.data import database
from jarvis.domains.finance.cashflow_authority import (
    MAX_SAFE_EUROS,
    calculate_cashflow_authority,
    cashflow_authority_structural_blockers,
    valid_recurring_obligations,
)

router = APIRouter()

MAX_PDF_BYTES = 8 * 1024 * 1024
MAX_PDF_PAGES = 40
STATEMENT_RECEIPT_INVALID = "STATEMENT_RECEIPT_INVALID"

CATEGORIES = [
    "Housing", "Food & Groceries", "Eating Out", "Transport",
    "Subscriptions", "Health & Sport", "Shopping", "Investment",
    "Emergency Fund", "Transfers", "Income", "Banking & Fees", "Other",
]

NON_SPENDING_CATEGORIES = {"Income", "Investment", "Emergency Fund", "Transfers"}
FIXED_COST_CATEGORIES = {"Housing"}

DEFAULT_BUDGET_MEMORY = {
    "version": 2,
    "savings_target_pct": 25,
    "salary_day_cutoff": 25,
    "emergency_fund_floor_eur": 5000,
    "emergency_fund_balance_eur": 5000,
    "checking_buffer_eur": 300,
    "food_budget_eur": 200,
    "essential_spending_ceiling_eur": 950,
    "recurring_obligations": [],
    "salary_next_month": True,
    "fixed_categories": sorted(FIXED_COST_CATEGORIES),
    "non_spending_categories": sorted(NON_SPENDING_CATEGORIES),
    "flexible_categories": [
        "Eating Out", "Food & Groceries", "Transport", "Subscriptions",
        "Shopping", "Health & Sport", "Banking & Fees", "Other",
    ],
    "merchant_rules": [
        {"contains": ["rahvusooper estonia", "töötasu", "tootasu"], "category": "Income", "is_income": 1, "budget_month": "salary_next_month"},
        {"contains": ["cash deposit", "from account"], "category": "Transfers", "is_income": 0},
        {"contains": ["emergency fund"], "category": "Emergency Fund", "is_income": 0},
        {"contains": ["erik oü", "rent"], "category": "Housing", "is_income": 0, "fixed": True},
        {"contains": ["alexela", "electricity"], "category": "Housing", "is_income": 0, "fixed": True},
        {"contains": ["elisa", "internet"], "category": "Housing", "is_income": 0, "fixed": True},
        {"contains": ["pärnu mnt 131", "parnu mnt 131", "utilities"], "category": "Housing", "is_income": 0, "fixed": True},
        {"contains": ["lightyear", "crypto", "growth account", "microinvestment"], "category": "Investment", "is_income": 0},
        {"contains": ["wolt", "caffeine", "coffee", "restoran", "restaurant", "mcdonald", "hesburger", "kohvik"], "category": "Eating Out", "is_income": 0},
        {"contains": ["selver", "rimi", "lidl", "toidupood", "prisma", "maxima"], "category": "Food & Groceries", "is_income": 0},
        {"contains": ["bolt.eu", "pilet.ee", "toilet service paygo", "parking"], "category": "Transport", "is_income": 0},
        {"contains": ["openai", "anthropic", "elevenlabs", "microsoft 365", "google play", "supercell"], "category": "Subscriptions", "is_income": 0},
    ],
}

APPROVED_CASH_POLICY_VERSION = 2
DEFAULT_UTILITY_OBLIGATION = {
    "name": "Utilities",
    "amount_eur": 150.0,
    "contains": ["utility", "electric", "water"],
    "enabled": True,
}
_AUTHORITY_MONEY_FIELDS = (
    "emergency_fund_floor_eur",
    "emergency_fund_balance_eur",
    "checking_buffer_eur",
    "food_budget_eur",
    "essential_spending_ceiling_eur",
)
_CATEGORY_LIST_FIELDS = (
    "fixed_categories",
    "non_spending_categories",
    "flexible_categories",
)
_BUDGET_MEMORY_PROFILE_FIELDS = frozenset(DEFAULT_BUDGET_MEMORY)

class ParseRequest(BaseModel):
    raw_text: str
    source: str = "text"


class StatementSavePayload(BaseModel):
    filename: str
    parser: str
    quality: dict


class SaveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transactions: list[dict]
    statement_receipt_id: str | None = None


class BudgetMemoryRequest(BaseModel):
    profile: object


class CategoryCorrectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    statement_import_id: str
    expected_revision: str
    merchant_key: str
    ordinals: list[int]
    corrected_category: str
    remember_merchant: bool = True

    @field_validator("merchant_key")
    @classmethod
    def merchant_key_must_be_canonical(cls, value: str) -> str:
        normalized = database.normalize_budget_merchant(value)
        if not normalized or value != normalized:
            raise ValueError("merchant_key must be a nonempty canonical merchant key")
        return value

    @field_validator("ordinals")
    @classmethod
    def ordinals_must_be_unique_nonnegative_integers(cls, value: list[int]) -> list[int]:
        if (
            not value
            or any(type(ordinal) is not int or ordinal < 0 for ordinal in value)
            or len(set(value)) != len(value)
        ):
            raise ValueError("ordinals must be unique non-negative integers")
        return value

    @field_validator("corrected_category")
    @classmethod
    def corrected_category_must_be_known(cls, value: str) -> str:
        if value not in CATEGORIES:
            raise ValueError("corrected_category must be a known category")
        return value


def _deepcopy_default_budget_memory() -> dict:
    return json.loads(json.dumps(DEFAULT_BUDGET_MEMORY))


def _budget_memory_profile() -> dict:
    stored = database.get_budget_memory_profile()
    profile = _deepcopy_default_budget_memory()
    if isinstance(stored, dict):
        for key, value in stored.items():
            if value is not None:
                profile[key] = value
    return profile


def _budget_memory_editor_payload() -> dict:
    """Return display-safe version 2 values plus explicit migration status."""
    raw_profile = database._get_budget_memory_profile_raw()
    migration_required = False
    if raw_profile is not None:
        try:
            stored = json.loads(raw_profile)
        except (RecursionError, TypeError, ValueError):
            stored = None
        migration_required = (
            not isinstance(stored, dict)
            or stored.get("version") != APPROVED_CASH_POLICY_VERSION
        )

    profile = _budget_memory_profile()
    profile["version"] = APPROVED_CASH_POLICY_VERSION
    if not profile.get("recurring_obligations"):
        profile["recurring_obligations"] = [dict(DEFAULT_UTILITY_OBLIGATION)]
    return {
        "profile": profile,
        "migration_required": migration_required,
    }


def _is_valid_authority_money(value: object) -> bool:
    if type(value) not in (int, float):
        return False
    try:
        amount = Decimal(str(value))
        cents = amount * 100
    except (InvalidOperation, TypeError, ValueError):
        return False
    return (
        amount.is_finite()
        and amount >= 0
        and amount <= MAX_SAFE_EUROS
        and cents == cents.to_integral_value(rounding=ROUND_HALF_UP)
    )


def _validate_merchant_rules(merchant_rules: object) -> None:
    if not isinstance(merchant_rules, list):
        raise ValueError("merchant_rules must be a list of objects")
    for rule in merchant_rules:
        if not isinstance(rule, dict):
            raise ValueError("merchant_rules must be a list of objects")
        contains = rule.get("contains")
        if not isinstance(contains, list) or not contains or any(
            not isinstance(token, str) or not token.strip() for token in contains
        ):
            raise ValueError("merchant_rules contains must be a non-empty list of strings")
        if rule.get("category") not in CATEGORIES:
            raise ValueError("merchant_rules category must be a known category")
        if type(rule.get("is_income")) is not int or rule["is_income"] not in (0, 1):
            raise ValueError("merchant_rules is_income must be 0 or 1")
        if "fixed" in rule and type(rule["fixed"]) is not bool:
            raise ValueError("merchant_rules fixed must be a boolean")
        if "budget_month" in rule and rule["budget_month"] != "salary_next_month":
            raise ValueError("merchant_rules budget_month must be salary_next_month")


def _validated_budget_memory_for_save(profile: object) -> dict:
    """Return canonical version 2 memory or raise ValueError with a stable field message."""
    if not isinstance(profile, dict):
        raise ValueError("profile must be an object")
    unknown_fields = set(profile) - _BUDGET_MEMORY_PROFILE_FIELDS
    if unknown_fields:
        raise ValueError(f"profile contains unknown field {sorted(unknown_fields)[0]}")

    canonical = _deepcopy_default_budget_memory()
    canonical.update(profile)
    for field in _AUTHORITY_MONEY_FIELDS:
        if not _is_valid_authority_money(canonical.get(field)):
            raise ValueError(
                f"{field} must be a finite non-negative exact-cent JSON number"
            )

    cutoff = canonical.get("salary_day_cutoff")
    if type(cutoff) is not int or not 1 <= cutoff <= 31:
        raise ValueError("salary_day_cutoff must be an integer from 1 through 31")

    obligations = canonical.get("recurring_obligations")
    if isinstance(obligations, list):
        canonical["recurring_obligations"] = [
            {
                **obligation,
                "name": obligation["name"].strip(),
                "contains": [token.strip() for token in obligation["contains"]],
            }
            if (
                isinstance(obligation, dict)
                and isinstance(obligation.get("name"), str)
                and isinstance(obligation.get("contains"), list)
                and all(isinstance(token, str) for token in obligation["contains"])
            )
            else obligation
            for obligation in obligations
        ]
    if not valid_recurring_obligations(canonical.get("recurring_obligations")):
        raise ValueError("recurring_obligations must be valid recurring obligations")

    for field in _CATEGORY_LIST_FIELDS:
        categories = canonical.get(field)
        if not isinstance(categories, list) or any(
            not isinstance(category, str) for category in categories
        ):
            raise ValueError(f"{field} must be a list of category names")

    _validate_merchant_rules(canonical.get("merchant_rules"))

    canonical["version"] = APPROVED_CASH_POLICY_VERSION
    return canonical


def _cashflow_authority_policy() -> dict | None:
    """Read authority policy strictly without changing generic memory consumers."""
    raw_profile = database._get_budget_memory_profile_raw()
    if raw_profile is None:
        return _deepcopy_default_budget_memory()
    try:
        stored = json.loads(raw_profile)
    except (RecursionError, TypeError, ValueError):
        return None
    if not isinstance(stored, dict):
        return None
    profile = dict(stored)
    if "version" not in profile:
        profile["version"] = DEFAULT_BUDGET_MEMORY["version"]
    return profile


def _validated_budget_month(month: str) -> str:
    if not isinstance(month, str) or not re.fullmatch(r"\d{4}-\d{2}", month):
        raise HTTPException(status_code=422, detail="month must use YYYY-MM format")
    try:
        normalized = date.fromisoformat(f"{month}-01").strftime("%Y-%m")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="month must use YYYY-MM format") from exc
    if normalized != month:
        raise HTTPException(status_code=422, detail="month must use YYYY-MM format")
    return month


def _previous_budget_months(month: str, count: int) -> list[str]:
    year, month_number = (int(part) for part in month.split("-"))
    result: list[str] = []
    for _ in range(count):
        month_number -= 1
        if month_number == 0:
            year -= 1
            month_number = 12
        result.append(f"{year:04d}-{month_number:02d}")
    return list(reversed(result))


def _inferred_recurring_obligations(
    profile: dict, statement_transactions: object, target_month: str
) -> list[dict] | None:
    """Infer only stable fixed bills paid in each of the prior three months."""
    if not isinstance(profile, dict) or not isinstance(statement_transactions, list):
        return None
    fixed_categories = profile.get("fixed_categories", [])
    if not isinstance(fixed_categories, list) or any(
        not isinstance(category, str) for category in fixed_categories
    ):
        return None
    configured = profile.get("recurring_obligations", [])
    if not valid_recurring_obligations(configured):
        return None

    evidence_months = _previous_budget_months(target_month, 3)
    monthly: dict[str, dict[str, object]] = {}
    for row in statement_transactions:
        if not isinstance(row, dict):
            return None
        month = row.get("month")
        if month not in evidence_months:
            continue
        merchant = row.get("merchant")
        description = row.get("description")
        category = row.get("effective_category", row.get("category"))
        if (
            not isinstance(merchant, str)
            or not isinstance(description, str)
            or category not in fixed_categories
            or row.get("is_income") != 0
        ):
            continue
        merchant_key = database.normalize_budget_merchant(merchant)
        if not merchant_key:
            continue
        try:
            amount = Decimal(str(row.get("amount_eur")))
        except (InvalidOperation, TypeError, ValueError):
            return None
        if not amount.is_finite() or amount <= 0:
            return None
        amount = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        group = monthly.setdefault(
            merchant_key,
            {"name": merchant.strip(), "searchable": set(), "amounts": {}},
        )
        group["searchable"].add(f"{merchant} {description}".lower())
        amounts = group["amounts"]
        amounts[month] = amounts.get(month, Decimal("0")) + amount

    inferred: list[dict] = []
    for merchant_key, group in sorted(monthly.items()):
        amounts = group["amounts"]
        observed_months = sorted(amounts)
        stable_monthly_history = observed_months == evidence_months
        rent_evidence = any(
            re.search(r"\b(?:rent|lease|mortgage)\b", searchable)
            for searchable in group["searchable"]
        )
        fixed_rent_rule = any(
            rule.get("fixed") is True
            and isinstance(rule.get("contains"), list)
            and any(
                isinstance(token, str)
                and any(token.lower() in searchable for searchable in group["searchable"])
                for token in rule["contains"]
            )
            for rule in profile.get("merchant_rules", [])
            if isinstance(rule, dict)
        )
        verified_rent_bootstrap = (
            observed_months == [evidence_months[-1]]
            and rent_evidence
            and fixed_rent_rule
        )
        if not stable_monthly_history and not verified_rent_bootstrap:
            continue
        values = sorted(amounts.values())
        median = values[len(values) // 2]
        tolerance = max(Decimal("1.00"), median * Decimal("0.05"))
        if values[-1] - values[0] > tolerance:
            continue
        inferred.append(
            {
                "name": group["name"],
                "amount_eur": float(median),
                "contains": [merchant_key],
                "enabled": True,
                "source": "verified_statement_history",
                "evidence_months": observed_months,
            }
        )
    return inferred


def _merge_recurring_obligations(
    configured: list[dict], inferred: list[dict]
) -> list[dict]:
    """Keep explicit obligations as overrides without hiding inferred evidence."""
    merged = list(configured)
    for candidate in inferred:
        candidate_text = " ".join(
            [candidate.get("name", ""), *candidate.get("contains", [])]
        ).lower()
        overridden = any(
            any(token.lower() in candidate_text for token in obligation["contains"])
            for obligation in configured
        )
        if not overridden:
            merged.append(candidate)
    return merged


def _unpaid_recurring_bills(
    profile: dict,
    transactions: object,
    statement_transactions: object | None = None,
    target_month: str | None = None,
) -> float | None:
    if not isinstance(profile, dict) or not isinstance(transactions, list):
        return None
    searchable: list[str] = []
    for row in transactions:
        if not isinstance(row, dict):
            return None
        merchant = row.get("merchant", "")
        description = row.get("description", "")
        if not isinstance(merchant, str) or not isinstance(description, str):
            return None
        searchable.append(f"{merchant} {description}".lower())
    total = Decimal("0")
    obligations = profile.get("recurring_obligations", [])
    if not valid_recurring_obligations(obligations):
        return None
    if statement_transactions is not None or target_month is not None:
        if statement_transactions is None or target_month is None:
            return None
        inferred = _inferred_recurring_obligations(
            profile, statement_transactions, target_month
        )
        if inferred is None:
            return None
        obligations = _merge_recurring_obligations(obligations, inferred)
    for obligation in obligations:
        if not obligation["enabled"]:
            continue
        tokens = [token.lower() for token in obligation["contains"]]
        try:
            amount = Decimal(str(obligation["amount_eur"]))
        except (InvalidOperation, TypeError, ValueError):
            return None
        if not amount.is_finite() or amount < 0:
            return None
        if any(any(token in row for token in tokens) for row in searchable):
            continue
        total += amount
    try:
        result = float(total)
    except (OverflowError, ValueError):
        return None
    if not math.isfinite(result):
        return None
    rounded = total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    try:
        return float(rounded)
    except (OverflowError, ValueError):
        return None


def _cashflow_input_hash(
    *,
    policy: dict,
    snapshot: dict | None,
    month_summary: dict,
    unpaid_bills_eur: float | None,
    correction_revision: str,
    today: date,
    week_closed: bool,
) -> str:
    fingerprint = json.dumps(
        {
            "policy": policy,
            "snapshot": snapshot,
            "month_summary": month_summary,
            "unpaid_bills_eur": unpaid_bills_eur,
            "correction_revision": correction_revision,
            "today": today.isoformat(),
            "week_closed": week_closed,
        },
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )
    return hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()


def _build_cashflow_authority(
    month: str, week_closed: bool = False, *, today: date | None = None
) -> dict:
    decision_today = today if today is not None else clock.today()
    target_month = _validated_budget_month(month)
    profile = _cashflow_authority_policy()
    if profile is None:
        return {
            "data_ready": False,
            "blockers": ["Cash-flow policy is invalid."],
            "weekly_budget_eur": 0.0,
        }
    snapshot = database.get_latest_reconciled_budget_statement()
    if snapshot is None:
        return {
            "data_ready": False,
            "blockers": ["No reconciled checking-account statement is available."],
            "weekly_budget_eur": 0.0,
        }
    if type(snapshot.get("receipt_verified")) is not int or snapshot["receipt_verified"] != 1:
        return {
            "data_ready": False,
            "blockers": ["Cash-flow statement receipt is invalid."],
            "weekly_budget_eur": 0.0,
        }
    statement_import_id = snapshot.get("statement_import_id")
    parsed_rows = snapshot.get("parsed_rows")
    if (
        not isinstance(statement_import_id, str)
        or not statement_import_id
        or type(parsed_rows) is not int
        or parsed_rows < 0
    ):
        return {
            "data_ready": False,
            "blockers": ["Cash-flow statement transaction provenance is invalid."],
            "weekly_budget_eur": 0.0,
        }
    immutable_transactions = database.get_budget_statement_import_transactions(
        statement_import_id
    )
    if not isinstance(immutable_transactions, list):
        return {
            "data_ready": False,
            "blockers": ["Cash-flow statement transaction provenance is invalid."],
            "weekly_budget_eur": 0.0,
        }
    if len(immutable_transactions) != parsed_rows or any(
        row.get("statement_import_id") != statement_import_id
        for row in immutable_transactions
        if isinstance(row, dict)
    ) or any(not isinstance(row, dict) for row in immutable_transactions):
        return {
            "data_ready": False,
            "blockers": ["Cash-flow statement transaction provenance is invalid."],
            "weekly_budget_eur": 0.0,
        }
    imported_transactions = database.get_effective_budget_statement_transactions(
        statement_import_id
    )
    if not isinstance(imported_transactions, list) or len(imported_transactions) != parsed_rows or any(
        row.get("statement_import_id") != statement_import_id
        for row in imported_transactions
        if isinstance(row, dict)
    ) or any(not isinstance(row, dict) for row in imported_transactions):
        return {
            "data_ready": False,
            "blockers": ["Cash-flow statement transaction provenance is invalid."],
            "weekly_budget_eur": 0.0,
        }
    transactions = [
        row for row in imported_transactions if row.get("month") == target_month
    ]
    summary = database.get_budget_statement_import_summary(
        statement_import_id, target_month
    )
    correction_revision = database.get_budget_correction_revision(statement_import_id)
    policy_blockers = cashflow_authority_structural_blockers(
        policy=profile,
        snapshot=snapshot,
        month_summary=summary,
        unpaid_bills_eur=0.0,
        today=decision_today,
        week_closed=week_closed,
    )
    if policy_blockers:
        return {
            "data_ready": False,
            "blockers": policy_blockers,
            "weekly_budget_eur": 0.0,
        }
    verified_history = database.get_verified_budget_statement_history()
    inferred_obligations = _inferred_recurring_obligations(
        profile, verified_history, target_month
    )
    if inferred_obligations is None:
        return {
            "data_ready": False,
            "blockers": [
                "Verified statement history is invalid for recurring-bill inference."
            ],
            "weekly_budget_eur": 0.0,
        }
    resolved_profile = {
        **profile,
        "recurring_obligations": _merge_recurring_obligations(
            profile.get("recurring_obligations", []), inferred_obligations
        ),
    }
    unpaid_bills_eur = _unpaid_recurring_bills(resolved_profile, transactions)
    if unpaid_bills_eur is None:
        return {
            "data_ready": False,
            "blockers": ["Cash-flow policy has invalid recurring_obligations."],
            "weekly_budget_eur": 0.0,
        }
    structural_blockers = cashflow_authority_structural_blockers(
        policy=profile,
        snapshot=snapshot,
        month_summary=summary,
        unpaid_bills_eur=unpaid_bills_eur,
        today=decision_today,
        week_closed=week_closed,
    )
    if structural_blockers:
        return {
            "data_ready": False,
            "blockers": structural_blockers,
            "weekly_budget_eur": 0.0,
        }
    try:
        input_hash = _cashflow_input_hash(
            policy=profile,
            snapshot=snapshot,
            month_summary=summary,
            unpaid_bills_eur=unpaid_bills_eur,
            correction_revision=correction_revision,
            today=decision_today,
            week_closed=week_closed,
        )
    except (RecursionError, OverflowError, TypeError, ValueError):
        return {
            "data_ready": False,
            "blockers": ["Cash-flow authority inputs are not JSON-safe."],
            "weekly_budget_eur": 0.0,
        }
    result = calculate_cashflow_authority(
        policy=profile,
        snapshot=snapshot,
        month_summary=summary,
        unpaid_bills_eur=unpaid_bills_eur,
        today=decision_today,
        week_closed=week_closed,
    )
    source = dict(snapshot)
    source["receipt_verified"] = True
    return {
        **result,
        "policy": profile,
        "policy_version": profile["version"],
        "inferred_recurring_obligations": inferred_obligations,
        "source": source,
        "input_hash": input_hash,
    }


def _budget_category_review_payload(month: str) -> dict:
    target_month = _validated_budget_month(month)
    source = database.get_budget_category_review_source(target_month)
    learned_rules = database.get_active_budget_learned_merchant_rules()
    if source is None:
        return {
            "data_ready": False,
            "blockers": [
                "No receipt-verified, reconciled PDF statement is available for this month."
            ],
            "statement_import_id": None,
            "revision": None,
            "unresolved_count": 0,
            "unresolved_amount_eur": 0.0,
            "merchant_groups": [],
            "learned_merchants": learned_rules,
        }

    statement_import_id = source["statement_import_id"]
    unresolved_rows = [
        row
        for row in database.get_effective_budget_statement_transactions(
            statement_import_id
        )
        if row.get("month") == target_month and row.get("effective_category") == "Other"
    ]
    grouped: dict[tuple[str, int], dict] = {}
    for row in unresolved_rows:
        merchant_key = database.normalize_budget_merchant(row.get("merchant", ""))
        if not merchant_key:
            continue
        direction = int(row.get("is_income") or 0)
        group_key = (merchant_key, direction)
        group = grouped.setdefault(
            group_key,
            {
                "merchant_key": merchant_key,
                "merchant": row["merchant"],
                "direction": direction,
                "ordinals": [],
                "transactions": [],
            },
        )
        group["ordinals"].append(row["ordinal"])
        group["transactions"].append(
            {
                "ordinal": row["ordinal"],
                "date": row["date"],
                "merchant": row["merchant"],
                "amount_eur": abs(float(row["amount_eur"])),
                "description": row["description"],
                "is_income": int(row["is_income"]),
                "category": row["category"],
            }
        )
    merchant_groups = [grouped[key] for key in sorted(grouped)]
    return {
        "data_ready": True,
        "blockers": [],
        "statement_import_id": statement_import_id,
        "revision": database.get_budget_correction_revision(statement_import_id),
        "unresolved_count": len(unresolved_rows),
        "unresolved_amount_eur": round(
            sum(abs(float(row["amount_eur"])) for row in unresolved_rows), 2
        ),
        "merchant_groups": merchant_groups,
        "learned_merchants": learned_rules,
    }


def _text_matches_rule(text: str, rule: dict) -> bool:
    tokens = [str(token).lower() for token in rule.get("contains", []) if str(token).strip()]
    return bool(tokens) and any(token in text for token in tokens)


def _budget_memory_rule_for_transaction(merchant: str, description: str, profile: dict | None = None) -> dict | None:
    budget_profile = profile or _budget_memory_profile()
    text = f"{merchant} {description}".lower()
    for rule in budget_profile.get("merchant_rules", []):
        if isinstance(rule, dict) and _text_matches_rule(text, rule):
            return rule
    merchant_key = database.normalize_budget_merchant(merchant)
    if merchant_key:
        for learned_rule in database.get_active_budget_learned_merchant_rules():
            if learned_rule.get("normalized_merchant") == merchant_key:
                return {"category": learned_rule["category"]}
    return None


def _extract_income_flag_from_rule(rule: dict | None, default: int) -> int:
    if isinstance(rule, dict) and "is_income" in rule:
        return int(rule.get("is_income") or 0)
    return int(default)


def _extract_category_from_rule(rule: dict | None, default: str) -> str:
    if isinstance(rule, dict):
        category = str(rule.get("category") or "").strip()
        if category in CATEGORIES:
            return category
    return default


def _direction_compatible_memory_rule(
    rule: dict | None, bank_is_credit: int
) -> dict | None:
    if not isinstance(rule, dict):
        return None
    category = _extract_category_from_rule(rule, "")
    if not category:
        return None
    if bank_is_credit:
        if category not in {"Income", "Transfers"}:
            return None
        if "is_income" in rule and int(rule.get("is_income") or 0) != int(category == "Income"):
            return None
    elif category == "Income" or int(rule.get("is_income") or 0) == 1:
        return None
    return rule


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    """Extract machine-readable text from an uploaded PDF statement.

    The PDF is never persisted to disk. This intentionally supports text PDFs
    such as LHV account statements; scanned image-only PDFs need OCR and fail
    closed with a clear 422 response instead of sending empty text to AI.
    """
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Uploaded PDF is empty")

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except Exception as exc:  # pypdf raises a few parser-specific exceptions.
        raise HTTPException(status_code=400, detail="Could not read PDF file") from exc

    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception as exc:
            raise HTTPException(status_code=422, detail="Encrypted PDFs are not supported") from exc

    pages = reader.pages[:MAX_PDF_PAGES]
    text_parts: list[str] = []
    for page in pages:
        try:
            page_text = page.extract_text() or ""
        except Exception:
            page_text = ""
        if page_text.strip():
            text_parts.append(page_text)

    extracted = "\n".join(text_parts).strip()
    if not extracted:
        raise HTTPException(
            status_code=422,
            detail="No selectable text found in PDF. Export/download the bank statement as a text PDF, or use Paste Text.",
        )
    return extracted



def _clean_statement_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" /\\-")


def _parse_statement_money(value: str) -> float:
    return float(value.replace(" ", "").replace("\u00a0", ""))


_LHV_DATE_RE = re.compile(r"^\d{2}\.\d{2}\.\d{4}\b")
_LHV_MONEY_RE = r"-?(?:\d{1,3}(?:[ \u00a0]\d{3})+|\d+)\.\d{2}"
_LHV_TAIL_RE = re.compile(
    rf"(?P<bank_reference>\d{{10}})\s+"
    rf"(?P<bank_amount>{_LHV_MONEY_RE})\s+"
    rf"(?P<balance>{_LHV_MONEY_RE})(?=\s|$)"
)


def _lhv_statement_rows(raw_text: str) -> list[str]:
    rows: list[str] = []
    current: list[str] = []
    for raw_line in raw_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if _LHV_DATE_RE.match(line):
            if current:
                rows.append(" ".join(current))
            current = [line]
        elif current:
            current.append(line)
    if current:
        rows.append(" ".join(current))
    return rows


def _lhv_statement_quality(raw_text: str, parsed_rows: int) -> dict:
    rows = _lhv_statement_rows(raw_text)
    transaction_rows = [
        row for row in rows if "Starting balance" not in row and "Final balance" not in row
    ]
    transaction_row_matches = [
        (row, _LHV_TAIL_RE.search(row)) for row in transaction_rows
    ]
    matched = [match for _, match in transaction_row_matches if match]
    unmatched_rows = [
        re.sub(r"\s+", " ", row).strip()[:240]
        for row, match in transaction_row_matches
        if match is None
    ][:25]
    opening_match = next(
        (re.search(rf"Starting balance\s+(?P<value>{_LHV_MONEY_RE})", row) for row in rows if "Starting balance" in row),
        None,
    )
    closing_row = next((row for row in rows if "Final balance" in row), None)
    closing_match = (
        re.search(rf"Final balance\s+(?P<value>{_LHV_MONEY_RE})", closing_row)
        if closing_row
        else None
    )
    opening = _parse_statement_money(opening_match.group("value")) if opening_match else None
    closing = _parse_statement_money(closing_match.group("value")) if closing_match else None
    statement_end_date = None
    statement_end_date_invalid = False
    if closing_row and _LHV_DATE_RE.match(closing_row):
        try:
            statement_end_date = datetime.strptime(
                closing_row[:10], "%d.%m.%Y"
            ).date().isoformat()
        except ValueError:
            statement_end_date_invalid = True
    movement = round(sum(_parse_statement_money(match.group("bank_amount")) for match in matched), 2)
    difference = round(closing - (opening + movement), 2) if opening is not None and closing is not None else None

    warnings: list[str] = []
    if opening is None or closing is None:
        warnings.append("Opening or closing balance was not found.")
    if statement_end_date_invalid:
        warnings.append("Statement end date is invalid.")
    elif statement_end_date is None:
        warnings.append("Statement end date was not found.")
    if len(matched) != len(transaction_rows):
        warnings.append(f"Parsed {len(matched)} of {len(transaction_rows)} statement rows.")
    if parsed_rows != len(matched):
        warnings.append(f"Returned {parsed_rows} transactions for {len(matched)} matched rows.")
    if difference is not None and difference != 0:
        warnings.append(f"Statement balance differs by EUR {abs(difference):.2f}.")

    return {
        "status": "reconciled" if not warnings else "review_required",
        "statement_rows": len(transaction_rows),
        "parsed_rows": parsed_rows,
        "opening_balance_eur": opening,
        "closing_balance_eur": closing,
        "statement_end_date": statement_end_date,
        "net_movement_eur": movement,
        "balance_difference_eur": difference,
        "warnings": warnings,
        "unmatched_rows": unmatched_rows,
    }


def _validated_statement_snapshot(statement: StatementSavePayload) -> dict:
    """Create a storage-safe snapshot only from a reconciled LHV PDF parse."""
    if statement.parser != "lhv_pdf" or not statement.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="Only reconciled PDF statements can become authoritative")

    quality = statement.quality
    if quality.get("status") != "reconciled":
        raise HTTPException(status_code=422, detail="Only reconciled statements can become authoritative")

    if quality.get("statement_end_date") is None:
        raise HTTPException(status_code=422, detail="Reconciled statement metadata is incomplete")

    raw_statement_end_date = quality["statement_end_date"]
    try:
        statement_end_date = (
            date.fromisoformat(raw_statement_end_date).isoformat()
            if isinstance(raw_statement_end_date, str)
            else None
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Reconciled statement metadata is invalid") from exc
    if statement_end_date is None or statement_end_date != raw_statement_end_date:
        raise HTTPException(status_code=422, detail="Reconciled statement metadata is invalid")

    def finite_number(field: str, *, optional: bool = False) -> float | None:
        value = quality.get(field)
        if value is None and optional:
            return None
        if isinstance(value, bool):
            raise HTTPException(status_code=422, detail=f"{field} must be a finite numeric value")
        try:
            normalized = float(value)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=422,
                detail=f"{field} must be a finite numeric value",
            ) from exc
        if not math.isfinite(normalized):
            raise HTTPException(status_code=422, detail=f"{field} must be a finite numeric value")
        return normalized

    opening_balance = finite_number("opening_balance_eur", optional=True)
    closing_balance = finite_number("closing_balance_eur")
    raw_difference = quality.get("balance_difference_eur")
    if isinstance(raw_difference, bool):
        raise HTTPException(status_code=422, detail="Statement balance difference must be exactly zero")
    try:
        decimal_difference = Decimal(str(raw_difference))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail="Statement balance difference must be exactly zero",
        ) from exc
    if not decimal_difference.is_finite() or decimal_difference != Decimal("0"):
        raise HTTPException(status_code=422, detail="Statement balance difference must be exactly zero")
    balance_difference = 0.0

    def row_count(field: str) -> int:
        value = quality.get(field)
        if type(value) is not int or value < 0:
            raise HTTPException(status_code=422, detail=f"{field} must be a non-negative integer")
        return value

    statement_rows = row_count("statement_rows")
    parsed_rows = row_count("parsed_rows")

    normalized_filename = unicodedata.normalize("NFC", statement.filename).strip()
    if not normalized_filename:
        raise HTTPException(status_code=422, detail="Statement filename is required")

    return {
        "statement_end_date": statement_end_date,
        "opening_balance_eur": opening_balance,
        "closing_balance_eur": closing_balance,
        "parser": statement.parser,
        "quality_status": quality["status"],
        "statement_rows": statement_rows,
        "parsed_rows": parsed_rows,
        "balance_difference_eur": balance_difference,
        "filename_hash": hashlib.sha256(normalized_filename.encode("utf-8")).hexdigest(),
    }


def _clean_merchant(value: str) -> str:
    merchant = _clean_statement_text(value)
    merchant = re.sub(r"\(\.\.\d+\).*$", "", merchant).strip()
    merchant = re.sub(r"\b[A-Z]{2}\d{2}[A-Z0-9]{10,}\b.*$", "", merchant).strip()
    merchant = re.sub(r"\s+\(from account$", "", merchant).strip()
    return _clean_statement_text(merchant) or "Unknown"


_MEMORY_RULE_UNSET = object()


def _categorise_lhv_transaction(
    merchant: str,
    description: str,
    is_income: int,
    profile: dict | None = None,
    memory_rule: dict | None | object = _MEMORY_RULE_UNSET,
) -> str:
    text = f"{merchant} {description}".lower()
    if memory_rule is _MEMORY_RULE_UNSET:
        memory_rule = _budget_memory_rule_for_transaction(merchant, description, profile)
    memory_rule = _direction_compatible_memory_rule(memory_rule, is_income)
    if memory_rule:
        return _extract_category_from_rule(memory_rule, "Income" if is_income else "Other")

    if is_income:
        if any(token in text for token in ["töötasu", "tootasu", "salary", "wage", "payroll"]):
            return "Income"
        if any(token in text for token in ["cash deposit", "from account", "own account", "transfer from account"]):
            return "Transfers"
        return "Income"
    if any(token in text for token in ["emergency fund"]):
        return "Emergency Fund"
    if any(token in text for token in ["rent", "utilities", "electricity", "internet", "alexela", "elisa", "pärnu mnt 131", "parnu mnt 131"]):
        return "Housing"
    if any(token in text for token in ["selver", "rimi", "prisma", "maxima", "lidl", "toidupood"]):
        return "Food & Groceries"
    if any(token in text for token in [
        "wolt", "uber *eats", "uber eats", "vapiano", "restaurant", "restoran", "caffeine", "coffee", "kohvik",
        "mcdonald", "burger king", "dominos", "domino's", "hesburger", "bistro", "soogituba", "churrascaria", "la muu",
        "kivi paber", "om house", "vegan restoran",
    ]):
        return "Eating Out"
    if any(token in text for token in ["bolt.eu", "uber", "pilet.ee", "toilet service paygo", "parking"]):
        return "Transport"
    if any(token in text for token in [
        "spotify", "netflix", "adobe", "apple", "google", "github", "anthropic",
        "openai", "elevenlabs", "microsoft 365", "supercell",
    ]):
        return "Subscriptions"
    if any(token in text for token in ["fitness", "gym", "aptee", "linnaapteek", "pulse wrld"]):
        return "Health & Sport"
    if any(token in text for token in ["microinvestment", "growth account", "crypto", "lightyear"]):
        return "Investment"
    if any(token in text for token in ["card monthly fee", "monthly fee", "conversion fee"]):
        return "Banking & Fees"
    if any(token in text for token in ["sinsay", "euronics", "ikea", "airbaltic"]):
        return "Shopping"
    return "Other"


def _salary_income_belongs_to_next_budget_month(date_value: str, rule: dict | None, category: str, is_income: int, profile: dict | None = None) -> bool:
    if category != "Income" or not is_income:
        return False
    budget_profile = profile or _budget_memory_profile()
    if isinstance(rule, dict) and rule.get("budget_month") == "salary_next_month":
        pass
    elif not budget_profile.get("salary_next_month", True):
        return False
    else:
        return False
    try:
        day = int(date_value[-2:])
    except Exception:
        return False
    cutoff = int(budget_profile.get("salary_day_cutoff") or 25)
    return day >= cutoff


def _next_budget_month(date_value: str) -> str:
    dt = datetime.strptime(date_value, "%Y-%m-%d")
    year = dt.year + (1 if dt.month == 12 else 0)
    month = 1 if dt.month == 12 else dt.month + 1
    return f"{year:04d}-{month:02d}"


def _budget_month_for_lhv_transaction(date_value: str, category: str, is_income: int, rule: dict | None, profile: dict | None = None) -> str:
    if _salary_income_belongs_to_next_budget_month(date_value, rule, category, is_income, profile):
        return _next_budget_month(date_value)
    return date_value[:7]


def _parse_lhv_statement_transactions(raw_text: str, source: str = "pdf") -> list[dict]:
    """Parse LHV account statement rows deterministically.

    LHV PDF text extraction is already structured enough to parse locally. This
    avoids sending long statements to the AI gateway where large outputs can be
    truncated or fail when AI credentials are missing.
    """
    iban_re = re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{10,}\b")
    rows = _lhv_statement_rows(raw_text)

    transactions: list[dict] = []
    seen_rows: set[tuple[str, str, str]] = set()
    for row in rows:
        if "Starting balance" in row or "Final balance" in row:
            continue
        tail = _LHV_TAIL_RE.search(row)
        if not tail:
            continue

        bank_reference = tail.group("bank_reference")
        row_identity = (bank_reference, tail.group("bank_amount"), tail.group("balance"))
        if row_identity in seen_rows:
            continue
        seen_rows.add(row_identity)

        date = datetime.strptime(row[:10], "%d.%m.%Y").strftime("%Y-%m-%d")
        bank_amount = _parse_statement_money(tail.group("bank_amount"))
        bank_is_credit = 1 if bank_amount > 0 else 0
        amount_eur = round(abs(bank_amount), 2)
        body = _clean_statement_text(row[10:tail.start()])

        description = ""
        if "(.." in body:
            merchant = _clean_merchant(body.split("(..", 1)[0])
            description = body
        else:
            iban = iban_re.search(body)
            if iban:
                merchant = _clean_merchant(body[: iban.start()])
                description = _clean_statement_text(body[iban.end() :])
            else:
                merchant = _clean_merchant(body)
                description = body

        if not description:
            description = body
        memory_rule = _direction_compatible_memory_rule(
            _budget_memory_rule_for_transaction(merchant, description), bank_is_credit
        )
        category = _categorise_lhv_transaction(
            merchant, description, bank_is_credit, memory_rule=memory_rule
        )
        is_income = int(bank_is_credit and category == "Income")
        budget_month = _budget_month_for_lhv_transaction(date, category, is_income, memory_rule)
        transactions.append(
            {
                "date": date,
                "merchant": merchant,
                "amount_eur": amount_eur,
                "category": category,
                "is_income": is_income,
                "description": description[:240],
                "month": budget_month,
                "source": source,
            }
        )

    return transactions

def _parse_transactions_with_claude(raw_text: str, source: str = "text") -> list[dict]:
    prompt = f"""Extract all transactions from this LHV bank statement text.

For each transaction return a JSON object with:
- date: "YYYY-MM-DD"
- merchant: clean merchant name (remove codes, addresses, terminal IDs)
- amount_eur: float (positive = expense, negative = income/refund)
- category: one of exactly: "Housing", "Food & Groceries", "Eating Out", "Transport", "Subscriptions", "Health & Sport", "Shopping", "Investment", "Emergency Fund", "Transfers", "Income", "Banking & Fees", "Other"
- is_income: 1 if this is income/salary, 0 if expense
- description: one sentence explaining the transaction

Return ONLY a JSON array, no other text.

Categorisation rules:
- Selver, Rimi, Prisma, Maxima, Lidl = Food & Groceries
- Bolt Food, Wolt, restaurants, cafes = Eating Out
- Bolt, Uber, Tallinn Linnatranspordi, parking = Transport
- Spotify, Netflix, Adobe, Apple, Google, GitHub, Anthropic, OpenAI = Subscriptions
- LHV investment transfers, stocks, ETF = Investment
- Salary, freelance, performance fees = Income
- LHV fees, conversion fees, bank charges = Banking & Fees
- Pharmacy, gym, sports shop = Health & Sport
- Rent, utilities, internet = Housing
- Clothes, electronics, Amazon = Shopping

Raw text:
{raw_text}"""

    result = ai_gateway.generate_text(
        system_prompt="You extract bank transactions. Return only strict JSON.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
    )
    if not result.ok:
        raise RuntimeError(result.text)
    text = result.text.strip()
    text = text.replace("```json", "").replace("```", "").strip()
    transactions = json.loads(text)
    for t in transactions:
        merchant = str(t.get("merchant") or "")
        description = str(t.get("description") or "")
        raw_amount = float(t.get("amount_eur") or 0)
        bank_is_credit = int(bool(t.get("is_income")) or raw_amount < 0)
        rule = _direction_compatible_memory_rule(
            _budget_memory_rule_for_transaction(merchant, description), bank_is_credit
        )
        default_category = str(t.get("category") or "Other")
        if bank_is_credit and default_category not in {"Income", "Transfers"}:
            default_category = "Income"
        elif not bank_is_credit and default_category == "Income":
            default_category = "Other"
        category = _extract_category_from_rule(rule, default_category)
        is_income = int(bank_is_credit and category == "Income")
        t["amount_eur"] = round(abs(raw_amount), 2)
        t["category"] = category
        t["is_income"] = is_income
        t["month"] = _budget_month_for_lhv_transaction(t["date"], category, is_income, rule)
        t["source"] = source
    return transactions


def _month_label(month: str) -> str:
    try:
        year, month_number = month.split("-", 1)
        return clock.date(int(year), int(month_number), 1).strftime("%B %Y")
    except Exception:
        return month or "this month"


def _brief_amount(value: float) -> str:
    euros = int(abs(value))
    cents = int(round((abs(value) - euros) * 100))
    if cents == 100:
        euros += 1
        cents = 0
    euro_word = "euro" if euros == 1 else "euros"
    if cents == 0:
        return f"{euros} {euro_word}"
    cent_word = "cent" if cents == 1 else "cents"
    return f"{euros} {euro_word} and {cents} {cent_word}"


def _cut_suggestion(category: str) -> str:
    suggestions = {
        "Eating Out": "cut one restaurant or delivery order this week",
        "Transport": "replace one short ride with walking or public transport",
        "Food & Groceries": "plan one grocery trip before buying extras",
        "Subscriptions": "pause or cancel one subscription you do not need this month",
        "Shopping": "delay one nonessential purchase for a week",
        "Health & Sport": "review small fitness or pharmacy extras before buying more",
        "Housing": "keep fixed housing bills visible, but focus cuts on flexible spending",
        "Banking & Fees": "avoid one avoidable card, bank, or conversion fee",
        "Other": "review the largest uncategorised transaction and classify it",
    }
    return suggestions.get(category, "review the largest flexible expense before spending more")


def _generate_budget_insight(summary: dict, month: str) -> str:
    """Return a deterministic PHOENIX budget brief.

    This used to call the AI gateway, but budget summary is a critical UI card
    and voice surface. Deterministic text prevents prompt/reasoning leakage into
    the UI while keeping the answer concise and stable.
    """
    savings_rate = float(summary.get("savings_rate") or 0)
    profile = _budget_memory_profile()
    target = int(profile.get("savings_target_pct") or 25)
    relation = "above" if savings_rate >= target else "below"
    by_category = summary.get("by_category") or {}
    spending_categories = [
        (category, data)
        for category, data in by_category.items()
        if category not in NON_SPENDING_CATEGORIES | FIXED_COST_CATEGORIES and float(data.get("total") or 0) > 0
    ]
    spending_categories.sort(key=lambda item: float(item[1].get("total") or 0), reverse=True)

    month_label = _month_label(month)
    first = f"Sir, your {month_label} savings rate is {savings_rate:.0f} percent, {relation} the {target} percent target."

    if not spending_categories:
        return f"{first} There is no flexible spending category to cut yet. Keep importing transactions so Phoenix can give a sharper recommendation."

    top_category, top_data = spending_categories[0]
    amount = _brief_amount(float(top_data.get("total") or 0))
    second = f"Your highest flexible spending category is {top_category} at {amount}."
    third = f"To improve this month, {_cut_suggestion(top_category)}."
    return f"{first} {second} {third}"


@router.get("/memory")
def budget_memory() -> dict:
    return _budget_memory_editor_payload()


@router.post("/memory")
def save_budget_memory(request: BudgetMemoryRequest) -> dict:
    try:
        profile = _validated_budget_memory_for_save(request.profile)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    saved = database.save_budget_memory_profile(profile)
    return {"profile": saved}


@router.post("/parse")
def parse_transactions(request: ParseRequest) -> dict:
    transactions = _parse_transactions_with_claude(request.raw_text, request.source)
    return {"transactions": transactions, "count": len(transactions)}


@router.post("/parse-pdf")
async def parse_pdf_transactions(file: UploadFile = File(...)) -> dict:
    filename = file.filename or "statement.pdf"
    content_type = (file.content_type or "").lower()
    if not filename.lower().endswith(".pdf") and "pdf" not in content_type:
        raise HTTPException(status_code=400, detail="Please upload a PDF file")

    pdf_bytes = await file.read(MAX_PDF_BYTES + 1)
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="PDF is too large. Maximum size is 8 MB")

    raw_text = _extract_pdf_text(pdf_bytes)
    transactions = _parse_lhv_statement_transactions(raw_text, source="pdf")
    lhv_quality = _lhv_statement_quality(raw_text, len(transactions))
    parser = "lhv_pdf"
    if not transactions:
        transactions = _parse_transactions_with_claude(raw_text, source="pdf")
        parser = "ai_fallback"
    quality = lhv_quality if parser == "lhv_pdf" else {
        "status": "review_required",
        "statement_rows": None,
        "parsed_rows": len(transactions),
        "opening_balance_eur": None,
        "closing_balance_eur": None,
        "statement_end_date": None,
        "net_movement_eur": None,
        "balance_difference_eur": None,
        "warnings": ["AI fallback results require manual review."],
        "unmatched_rows": lhv_quality["unmatched_rows"],
    }
    response = {
        "transactions": transactions,
        "count": len(transactions),
        "filename": filename,
        "extracted_chars": len(raw_text),
        "parser": parser,
        "quality": quality,
    }
    if parser == "lhv_pdf" and quality.get("status") == "reconciled":
        # Statement authority originates only from this trusted server PDF parse path.
        snapshot = _validated_statement_snapshot(
            StatementSavePayload(filename=filename, parser=parser, quality=quality)
        )
        receipt = database._create_budget_statement_parse_receipt(
            transactions, snapshot
        )
        response["receipt_id"] = receipt["receipt_id"]
    return response


@router.post("/save")
def save_transactions(request: SaveRequest) -> dict:
    if request.statement_receipt_id is None:
        return {"saved": database.save_budget_transactions(request.transactions)}
    try:
        saved = database._save_budget_statement_receipt_import(
            request.transactions, request.statement_receipt_id
        )
    except database.BudgetStatementReceiptError as exc:
        raise HTTPException(status_code=422, detail=STATEMENT_RECEIPT_INVALID) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"saved": saved}


@router.get("/summary")
def budget_summary(month: str = "") -> dict:
    if not month:
        month = clock.today().strftime("%Y-%m")
    summary = database.get_budget_summary(month)
    insight = ""
    if summary["income_total"] > 0 or summary["expenses_total"] > 0:
        try:
            insight = _generate_budget_insight(summary, month)
        except Exception:
            pass
    summary["insight"] = insight
    summary["memory"] = {
        "savings_target_pct": _budget_memory_profile().get("savings_target_pct", 25),
        "fixed_categories": sorted(FIXED_COST_CATEGORIES),
        "non_spending_categories": sorted(NON_SPENDING_CATEGORIES),
    }
    return summary


@router.get("/category-review")
def budget_category_review(month: str) -> dict:
    try:
        return _budget_category_review_payload(month)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/category-corrections")
def apply_category_correction(request: CategoryCorrectionRequest) -> dict:
    selected_rows = [
        row
        for row in database.get_effective_budget_statement_transactions(
            request.statement_import_id
        )
        if row.get("ordinal") in request.ordinals
    ]
    selected_months = {row.get("month") for row in selected_rows}
    if len(selected_rows) != len(request.ordinals) or len(selected_months) != 1:
        raise HTTPException(
            status_code=422,
            detail="Correction ordinals must belong to one statement month",
        )
    month = selected_months.pop()
    if not isinstance(month, str):
        raise HTTPException(
            status_code=422,
            detail="Correction ordinals must belong to one statement month",
        )
    try:
        database.apply_budget_category_correction(
            statement_import_id=request.statement_import_id,
            expected_revision=request.expected_revision,
            merchant_key=request.merchant_key,
            ordinals=request.ordinals,
            corrected_category=request.corrected_category,
            remember_merchant=request.remember_merchant,
        )
    except database.BudgetCorrectionConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {
        "review": _budget_category_review_payload(month),
        "summary": database.get_budget_statement_import_summary(
            request.statement_import_id, month
        ),
        "authority": _build_cashflow_authority(month),
    }


@router.delete("/learned-merchants/{rule_id}")
def forget_learned_merchant(rule_id: int) -> dict:
    if not database.deactivate_budget_learned_merchant_rule(rule_id):
        raise HTTPException(status_code=404, detail="Learned merchant rule not found")
    return {"learned_merchants": database.get_active_budget_learned_merchant_rules()}


@router.get("/investment-capacity")
def budget_investment_capacity(month: str = "") -> dict:
    today = clock.today()
    target_month = month or today.strftime("%Y-%m")
    return _build_cashflow_authority(target_month, today=today)


@router.get("/transactions")
def budget_transactions(month: str = "") -> dict:
    if not month:
        month = clock.today().strftime("%Y-%m")
    transactions = database.get_budget_transactions(month)
    return {"transactions": transactions, "month": month}


@router.get("/months")
def budget_months() -> dict:
    months = database.get_budget_months()
    return {"months": months}
