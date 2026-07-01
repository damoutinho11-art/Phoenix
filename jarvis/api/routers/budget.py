"""Budget API — parse, save, and summarise personal bank transactions."""

import io
import json
import re
from datetime import datetime

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel
from pypdf import PdfReader

from jarvis.api import ai_gateway
from jarvis.core import clock
from jarvis.data import database

router = APIRouter()

MAX_PDF_BYTES = 8 * 1024 * 1024
MAX_PDF_PAGES = 40

CATEGORIES = [
    "Housing", "Food & Groceries", "Eating Out", "Transport",
    "Subscriptions", "Health & Sport", "Shopping", "Investment",
    "Emergency Fund", "Transfers", "Income", "Banking & Fees", "Other",
]

NON_SPENDING_CATEGORIES = {"Income", "Investment", "Emergency Fund", "Transfers"}
FIXED_COST_CATEGORIES = {"Housing"}

DEFAULT_BUDGET_MEMORY = {
    "version": 1,
    "savings_target_pct": 25,
    "salary_day_cutoff": 25,
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


class ParseRequest(BaseModel):
    raw_text: str
    source: str = "text"


class SaveRequest(BaseModel):
    transactions: list[dict]


class BudgetMemoryRequest(BaseModel):
    profile: dict


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


def _text_matches_rule(text: str, rule: dict) -> bool:
    tokens = [str(token).lower() for token in rule.get("contains", []) if str(token).strip()]
    return bool(tokens) and any(token in text for token in tokens)


def _budget_memory_rule_for_transaction(merchant: str, description: str, profile: dict | None = None) -> dict | None:
    budget_profile = profile or _budget_memory_profile()
    text = f"{merchant} {description}".lower()
    for rule in budget_profile.get("merchant_rules", []):
        if isinstance(rule, dict) and _text_matches_rule(text, rule):
            return rule
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


def _clean_merchant(value: str) -> str:
    merchant = _clean_statement_text(value)
    merchant = re.sub(r"\(\.\.\d+\).*$", "", merchant).strip()
    merchant = re.sub(r"\b[A-Z]{2}\d{2}[A-Z0-9]{10,}\b.*$", "", merchant).strip()
    merchant = re.sub(r"\s+\(from account$", "", merchant).strip()
    return _clean_statement_text(merchant) or "Unknown"


def _categorise_lhv_transaction(merchant: str, description: str, is_income: int, profile: dict | None = None) -> str:
    text = f"{merchant} {description}".lower()
    memory_rule = _budget_memory_rule_for_transaction(merchant, description, profile)
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
        "wolt", "vapiano", "restaurant", "restoran", "caffeine", "coffee", "kohvik",
        "mcdonald", "hesburger", "bistro", "soogituba", "churrascaria", "la muu",
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
    date_re = re.compile(r"^\d{2}\.\d{2}\.\d{4}\b")
    money_re = r"-?\d[\d ]*\.\d{2}"
    tail_re = re.compile(
        rf"(?P<bank_reference>\d{{10}})\s+(?P<bank_amount>{money_re})\s+(?P<balance>{money_re})(?=\s|$)"
    )
    iban_re = re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{10,}\b")

    rows: list[str] = []
    current: list[str] = []
    for raw_line in raw_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if date_re.match(line):
            if current:
                rows.append(" ".join(current))
            current = [line]
        elif current:
            current.append(line)
    if current:
        rows.append(" ".join(current))

    transactions: list[dict] = []
    seen_refs: set[str] = set()
    for row in rows:
        if "Starting balance" in row or "Final balance" in row:
            continue
        tail = tail_re.search(row)
        if not tail:
            continue

        bank_reference = tail.group("bank_reference")
        if bank_reference in seen_refs:
            continue
        seen_refs.add(bank_reference)

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
        memory_rule = _budget_memory_rule_for_transaction(merchant, description)
        category = _categorise_lhv_transaction(merchant, description, bank_is_credit)
        is_income = _extract_income_flag_from_rule(memory_rule, bank_is_credit if category == "Income" else 0)
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
        rule = _budget_memory_rule_for_transaction(merchant, description)
        category = _extract_category_from_rule(rule, str(t.get("category") or "Other"))
        is_income = _extract_income_flag_from_rule(rule, int(t.get("is_income") or 0))
        t["amount_eur"] = round(abs(float(t.get("amount_eur") or 0)), 2)
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
    return {"profile": _budget_memory_profile()}


@router.post("/memory")
def save_budget_memory(request: BudgetMemoryRequest) -> dict:
    profile = _deepcopy_default_budget_memory()
    profile.update(request.profile or {})
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
    parser = "lhv_pdf"
    if not transactions:
        transactions = _parse_transactions_with_claude(raw_text, source="pdf")
        parser = "ai_fallback"
    return {
        "transactions": transactions,
        "count": len(transactions),
        "filename": filename,
        "extracted_chars": len(raw_text),
        "parser": parser,
    }


@router.post("/save")
def save_transactions(request: SaveRequest) -> dict:
    saved = database.save_budget_transactions(request.transactions)
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
