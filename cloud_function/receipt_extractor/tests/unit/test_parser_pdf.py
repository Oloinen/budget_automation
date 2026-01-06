from pathlib import Path
import fitz
from ...parser import parse_receipt_text_

FIXTURES = Path(__file__).parent.parent / "fixtures"

def extract_pdf_text(path: Path) -> str:
    doc = fitz.open(str(path))
    parts = []
    for i in range(doc.page_count):
        parts.append(doc.load_page(i).get_text("text"))
    doc.close()
    return "\n".join(parts)

def test_parse_text_pdf_k_market1():
    text = extract_pdf_text(FIXTURES / "pdf_test_k_market1.pdf")
    out = parse_receipt_text_(text)

    # Expected exact values
    assert out["merchant"] == "K-market Töölöntori", f"Expected 'K-market Töölöntori', got '{out['merchant']}'"
    assert out["date"] == "2026-01-04", f"Expected '2026-01-04', got '{out['date']}'"
    assert out["total"] == 11.62, f"Expected 11.62, got {out['total']}"
    assert out["currency"] == "EUR", f"Expected 'EUR', got '{out['currency']}'"
    assert len(out["items"]) == 6, f"Expected 6 items, got {len(out['items'])}"
    
    # Expected items
    expected_items = [
        {"name": "Malaco BisBis 14g", "amount": 0.39},
        {"name": "Fazer Original patukka 20g", "amount": 0.45},
        {"name": "Grahns Salty Skulls 60g", "amount": 1.25},
        {"name": "Urtekram musta riisi 375g luom", "amount": 4.95},
        {"name": "Kismet suklaapatukka 55g", "amount": 1.64},
        {"name": "Nongshim pikanuudeli 120g shin", "amount": 2.94}
    ]
    
    for i, expected in enumerate(expected_items):
        assert out["items"][i]["name"] == expected["name"], \
            f"Item {i+1} name: expected '{expected['name']}', got '{out['items'][i]['name']}'"
        assert out["items"][i]["amount"] == expected["amount"], \
            f"Item {i+1} amount: expected {expected['amount']}, got {out['items'][i]['amount']}"

def test_parse_text_pdf_k_market2_pdf():
    text = extract_pdf_text(FIXTURES / "pdf_test_k_market2.pdf")
    out = parse_receipt_text_(text)

    # Expected exact values
    assert out["merchant"] == "K-market Töölöntori", f"Expected 'K-market Töölöntori', got '{out['merchant']}'"
    assert out["date"] == "2026-01-03", f"Expected '2026-01-03', got '{out['date']}'"
    assert out["total"] == 7.66, f"Expected 7.66, got {out['total']}"
    assert out["currency"] == "EUR", f"Expected 'EUR', got '{out['currency']}'"
    assert len(out["items"]) == 3, f"Expected 3 items, got {len(out['items'])}"
    
    # Expected items
    expected_items = [
        {"name": "Fanta Sitruuna Zero 0,5l", "amount": 2.19},
        {"name": "Pullopantti KMP 0,20 0,35L-1L", "amount": 0.20},
        {"name": "Pirkka choco grande 6x80g whit", "amount": 5.27}
    ]
    
    for i, expected in enumerate(expected_items):
        assert out["items"][i]["name"] == expected["name"], \
            f"Item {i+1} name: expected '{expected['name']}', got '{out['items'][i]['name']}'"
        assert out["items"][i]["amount"] == expected["amount"], \
            f"Item {i+1} amount: expected {expected['amount']}, got {out['items'][i]['amount']}"

def test_parse_text_pdf_smarket_pdf():
    text = extract_pdf_text(FIXTURES / "pdf_test_s_market.pdf")
    out = parse_receipt_text_(text)

    # Expected exact values
    assert out["merchant"] == "S-MARKET SOKOS HELSINKI", f"Expected 'S-MARKET SOKOS HELSINKI', got '{out['merchant']}'"
    assert out["date"] == "2026-01-05", f"Expected '2026-01-05', got '{out['date']}'"
    assert out["total"] == 4.78, f"Expected 4.78, got {out['total']}"
    assert out["currency"] == "EUR", f"Expected 'EUR', got '{out['currency']}'"
    assert len(out["items"]) == 2, f"Expected 2 items, got {len(out['items'])}"
    
    # Expected items
    expected_items = [
        {"name": "RAEJUUSTO MAUSTAMATON", "amount": 3.34},
        {"name": "VANILJAMAITOVALM. 125G SKYR AIR", "amount": 1.44}
    ]
    
    for i, expected in enumerate(expected_items):
        assert out["items"][i]["name"] == expected["name"], \
            f"Item {i+1} name: expected '{expected['name']}', got '{out['items'][i]['name']}'"
        assert out["items"][i]["amount"] == expected["amount"], \
            f"Item {i+1} amount: expected {expected['amount']}, got {out['items'][i]['amount']}"
