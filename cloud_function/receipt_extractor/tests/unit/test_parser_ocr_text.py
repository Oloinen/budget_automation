from pathlib import Path
from ...parser import parse_receipt_text_

FIXTURES = Path(__file__).parent.parent / "fixtures"

def test_parse_ocr_text_kmarket_1744():
    text = (FIXTURES / "ocr_expected_k_market.txt").read_text(encoding="utf-8")
    out = parse_receipt_text_(text)

    # Expected exact values
    assert out["merchant"] == "K-market Töölöntori Tykistönkatu 7", f"Expected 'K-market Töölöntori Tykistönkatu 7', got '{out['merchant']}'"
    assert out["date"] == "2026-01-01", f"Expected '2026-01-01', got '{out['date']}'"
    assert out["total"] == 15.01, f"Expected 15.01, got {out['total']}"
    assert out["currency"] == "EUR", f"Expected 'EUR', got '{out['currency']}'"
    assert len(out["items"]) == 6, f"Expected 6 items, got {len(out['items'])}"
    
    # Expected items
    expected_items = [
        {"name": "Fanta Sitruuna Zero", "amount": 2.19},
        {"name": "Pullopantti KMP", "amount": 0.20},
        {"name": "Classic jäätelö 80g kerrossukl", "amount": 2.38},
        {"name": "Cornichos pikku kurkut 350/190", "amount": 7.25},
        {"name": "Fanta Sitruuna Zero", "amount": 2.59},
        {"name": "Pullopantti KMP", "amount": 0.40}
    ]
    
    for i, expected in enumerate(expected_items):
        assert out["items"][i]["name"] == expected["name"], \
            f"Item {i+1} name: expected '{expected['name']}', got '{out['items'][i]['name']}'"
        assert out["items"][i]["amount"] == expected["amount"], \
            f"Item {i+1} amount: expected {expected['amount']}, got {out['items'][i]['amount']}"

def test_parse_ocr_text_kmarket_1745():
    text = (FIXTURES / "ocr_expected_k_supermarket.txt").read_text(encoding="utf-8")
    out = parse_receipt_text_(text)

    # Expected exact values
    assert out["merchant"] == "K-Supermarket Kamppi Urho Kekkosen katu 1 A 24", f"Expected 'K-Supermarket Kamppi Urho Kekkosen katu 1 A 24', got '{out['merchant']}'"
    assert out["date"] == "2025-12-31", f"Expected '2025-12-31', got '{out['date']}'"
    assert out["total"] == 12.47, f"Expected 12.47, got {out['total']}"
    assert out["currency"] == "EUR", f"Expected 'EUR', got '{out['currency']}'"
    assert len(out["items"]) == 5, f"Expected 5 items, got {len(out['items'])}"
    
    # Expected items
    expected_items = [
        {"name": "Wotkins Henalan salami 100g", "amount": 3.95},
        {"name": "Nongshim pikanuudeli 120g shin", "amount": 5.18},
        {"name": "Candyking irtomakeinen", "amount": 0.95},
        {"name": "Fanta Sitruuna Zero", "amount": 2.19},
        {"name": "Pullopantti KMP", "amount": 0.20}
    ]
    
    for i, expected in enumerate(expected_items):
        assert out["items"][i]["name"] == expected["name"], \
            f"Item {i+1} name: expected '{expected['name']}', got '{out['items'][i]['name']}'"
        assert out["items"][i]["amount"] == expected["amount"], \
            f"Item {i+1} amount: expected {expected['amount']}, got {out['items'][i]['amount']}"
