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
            # Clean up: remove postal code, city, phone number
            merchant = l
            # Remove phone numbers (Puh., Tel., etc.)
            merchant = re.sub(r'\s*Puh\.?\s*\(?\d+\)?[\s\d\-]+', '', merchant, flags=re.IGNORECASE)
            merchant = re.sub(r'\s*Tel\.?\s*\(?\d+\)?[\s\d\-]+', '', merchant, flags=re.IGNORECASE)
            # Remove postal code and city (5-digit code followed by city name)
            merchant = re.sub(r',?\s*\d{5}\s+[A-ZÅÄÖa-zåäö\s]+$', '', merchant)
            return merchant.strip()
        if l.isupper() and len(l) > 5:
            # Clean up uppercase merchant names
            merchant = l
            merchant = re.sub(r'\s*Puh\.?\s*\(?\d+\)?[\s\d\-]+', '', merchant, flags=re.IGNORECASE)
            merchant = re.sub(r'\s*Tel\.?\s*\(?\d+\)?[\s\d\-]+', '', merchant, flags=re.IGNORECASE)
            merchant = re.sub(r',?\s*\d{5}\s+[A-ZÅÄÖa-zåäö\s]+$', '', merchant)
            return merchant.strip()
    
    # Fallback: first line with cleanup
    if lines:
        merchant = lines[0]
        merchant = re.sub(r'\s*Puh\.?\s*\(?\d+\)?[\s\d\-]+', '', merchant, flags=re.IGNORECASE)
        merchant = re.sub(r'\s*Tel\.?\s*\(?\d+\)?[\s\d\-]+', '', merchant, flags=re.IGNORECASE)
        merchant = re.sub(r',?\s*\d{5}\s+[A-ZÅÄÖa-zåäö\s]+$', '', merchant)
        return merchant.strip()
    
    return ""

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
    for i, l in enumerate(lines):
        # Check if line contains the total marker
        if "YHTEENSÄ" in l.upper() or "TOTAL" in l.upper() or "SUMMA" in l.upper():
            # Check same line first
            m = TOTAL_RE.search(l)
            if m:
                return float(m.group(1).replace(",", "."))
            # Check next few lines for the amount
            for j in range(i + 1, min(i + 5, len(lines))):
                # Look for standalone amount
                amount_match = re.match(r'^(\d+[.,]\d{2})\s*$', lines[j])
                if amount_match:
                    return float(amount_match.group(1).replace(",", "."))
    return None

def extract_items(lines):
    """Extract line items with names and amounts.
    
    In OCR text, items often span two lines:
    - Line 1: Item name (may have volume like "0,5l" misread as "0,51")
    - Line 2: Actual price as standalone decimal amount
    
    Always uses the next line as price if it's just a decimal amount.
    """
    items = []
    i = 0
    while i < len(lines):
        l = lines[i]
        
        # Stop at total line
        if l.startswith("YHTEENSÄ"):
            break
        if set(l) == {"-"}:
            i += 1
            continue
        if "CARD TRANSACTION" in l:
            break

        # Check if next line is just a standalone amount
        if i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            # Match lines that are just a decimal amount
            standalone_amount = re.match(r'^(\d+[.,]\d{2})$', next_line)
            
            if standalone_amount:
                # This line is the item name, next line is the price
                name = l.strip()
                
                # Skip lines that look like transaction IDs or codes (e.g., "K021 M026356/0554")
                if re.search(r'[A-Z]\d{3,}|M\d{6}', name):
                    i += 2
                    continue
                
                # Remove volume/size indicators like "0,35L-1L" (OCR artifacts)
                name = re.sub(r'\s+\d+[.,]\d+L[^\s]*', '', name, flags=re.IGNORECASE)
                # Remove trailing decimal amounts like "0,51" or "1,51" or "0,20" (misread volumes for bottled drinks)
                name = re.sub(r'\s+\d+[.,]\d{1,2}$', '', name)
                name = name.strip()
                
                # Skip obvious non-items
                if name.upper().startswith(("ALV", "KORTTI", "PLUSSA", "BONUS", "PANTTI")):
                    i += 2
                    continue
                
                amount = float(standalone_amount.group(1).replace(",", "."))
                
                if len(name) >= 3 and amount > 0:
                    items.append({
                        "name": name,
                        "amount": amount
                    })
                
                i += 2  # Skip both current and next line
                continue
        
        # If no standalone amount on next line, try matching current line
        m = ITEM_PRICE_RE.match(l)
        if m:
            name = m.group(1).strip()
            
            # Skip transaction IDs or codes
            if re.search(r'[A-Z]\d{3,}|M\d{6}', name):
                i += 1
                continue
            
            amount = float(m.group(2).replace(",", "."))
            
            # Skip obvious non-items
            if not name.upper().startswith(("ALV", "KORTTI", "PLUSSA", "BONUS")):
                if len(name) >= 3:
                    items.append({
                        "name": name,
                        "amount": amount
                    })
        
        i += 1
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
