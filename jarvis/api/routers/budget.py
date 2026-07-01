"""Budget API — parse, save, and summarise personal bank transactions."""

import io
import json

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
    "Income", "Banking & Fees", "Other",
]


class ParseRequest(BaseModel):
    raw_text: str
    source: str = "text"


class SaveRequest(BaseModel):
    transactions: list[dict]


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


def _parse_transactions_with_claude(raw_text: str, source: str = "text") -> list[dict]:
    prompt = f"""Extract all transactions from this LHV bank statement text.

For each transaction return a JSON object with:
- date: "YYYY-MM-DD"
- merchant: clean merchant name (remove codes, addresses, terminal IDs)
- amount_eur: float (positive = expense, negative = income/refund)
- category: one of exactly: "Housing", "Food & Groceries", "Eating Out", "Transport", "Subscriptions", "Health & Sport", "Shopping", "Investment", "Income", "Banking & Fees", "Other"
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
        t["month"] = t["date"][:7]
        t["source"] = source
    return transactions


def _generate_budget_insight(summary: dict, month: str) -> str:
    prompt = f"""Budget summary for {month}:
{json.dumps(summary, indent=2)}

Generate a spoken PHOENIX budget brief for Sir.
Maximum 3 sentences. Be concise. Cover: savings rate vs 25% target,
top spending category, one specific thing to cut.
No markdown, no symbols, natural spoken sentences.
Address the user as Sir."""
    result = ai_gateway.generate_text(
        system_prompt="You are PHOENIX. Return concise budget insight only.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=200,
    )
    if not result.ok:
        return ""
    return result.text.strip()


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
    transactions = _parse_transactions_with_claude(raw_text, source="pdf")
    return {
        "transactions": transactions,
        "count": len(transactions),
        "filename": filename,
        "extracted_chars": len(raw_text),
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
