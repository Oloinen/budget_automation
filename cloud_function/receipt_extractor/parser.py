"""
Receipt parser for Finnish grocery receipts.
Extracts merchant, date, total, and line items from OCR text.
"""
import re
from datetime import date

# Regex patterns
DATE_RE = re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{4})")
TOTAL_RE = re.compile(r"^YHTEENSÄ\s+(\d+[.,]\d{2})", re.I)
ITEM_PRICE_RE = re.compile(r"(.*?)(\d+[.,]\d{2})$")

# Text preprocessing
def normalize_text(text: str) -> list[str]:
    """Split text into non-empty trimmed lines."""
    return [
        l.strip()
        for l in text.replace("\r", "\n").split("\n")
        if l.strip()
    ]

# Field extractors
def extract_merchant(lines):
    """Extract merchant name from first lines (heuristic-based)."""
    for l in lines[:10]:
        if "market" in l.lower():
            return l
        if l.isupper() and len(l) > 5:
            return l
    return lines[0] if lines else ""

def extract_date(lines):
    """Extract date in YYYY-MM-DD format from Finnish DD.MM.YYYY pattern."""
    for l in lines[:20]:
        m = DATE_RE.search(l)
        if m:
            d, mth, y = m.groups()
            return f"{y}-{mth.zfill(2)}-{d.zfill(2)}"
    return ""

def extract_total(lines):
    """Extract total amount from YHTEENSÄ line."""
    for l in lines:
        m = TOTAL_RE.search(l)
        if m:
            return float(m.group(1).replace(",", "."))
    return None

def extract_items(lines):
    """Extract line items with names and amounts."""
    items = []
    for l in lines:
        if l.startswith("YHTEENSÄ"):
            break
        if set(l) == {"-"}:
            continue
        if "CARD TRANSACTION" in l:
            break

        m = ITEM_PRICE_RE.match(l)
        if not m:
            continue

        name = m.group(1).strip()
        amount = float(m.group(2).replace(",", "."))

        # Skip obvious non-items
        if name.upper().startswith(("ALV", "KORTTI", "PLUSSA", "BONUS")):
            continue

        items.append({
            "name": name,
            "amount": amount,
            "quantity": None,
            "unit_price": None
        })
    return items

# Main parser
def parse_receipt_text_(raw_text: str) -> dict:
    """
    Parse receipt text into structured data.
    
    Args:
        raw_text: Raw OCR or extracted text from receipt
        
    Returns:
        dict with keys: merchant, date, total, currency, items
    """
    lines = normalize_text(raw_text)

    merchant = extract_merchant(lines)
    date = extract_date(lines)
    total = extract_total(lines)
    items = extract_items(lines)

    return {
        "merchant": merchant,
        "date": date,
        "total": total,
        "currency": "EUR",
        "items": items
    }
