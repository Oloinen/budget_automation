"""
Integration tests for OCR functionality with real Vision API.

These tests require:
- GOOGLE_APPLICATION_CREDENTIALS environment variable
- Valid GCP credentials with Vision API access
- Internet connection

Run manually with: pytest tests/integration/ -v
Skip in CI with: pytest -m "not integration"
"""
import pytest
import google.auth
from pathlib import Path
from ...extractor import ocr_image_bytes_
from ...parser import parse_receipt_text_

FIXTURES = Path(__file__).parent.parent / "fixtures"

# Skip if credentials not available
def _has_adc_creds() -> bool:
    try:
        google.auth.default()
        return True
    except Exception:
        return False

pytestmark = pytest.mark.skipif(
    not _has_adc_creds(),
    reason="Requires Application Default Credentials (run: gcloud auth application-default login) "
           "or set GOOGLE_APPLICATION_CREDENTIALS."
)

@pytest.mark.integration
def test_ocr_real_kmarket_jpg():
    """Test OCR with real Vision API on K-market receipt."""
    jpg_path = FIXTURES / "scanned_kmarket.jpg"
    if not jpg_path.exists():
        pytest.skip(f"Test fixture not found: {jpg_path}")
    
    img_bytes = jpg_path.read_bytes()
    text = ocr_image_bytes_(img_bytes)
    result = parse_receipt_text_(text)
    
    # Verify extracted data
    assert result["merchant"] == "K-market Töölöntori"
    assert result["date"] == "2026-01-01"
    assert result["total"] == 15.01
    assert result["currency"] == "EUR"
    assert len(result["items"]) == 6
    
    # Expected items (using substring matching for OCR typos)
    expected_items = [
        {"name_contains": "Fanta Sitruuna Zero", "amount": 2.19},
        {"name_contains": "Pullopantti KMP", "amount": 0.20},
        {"name_contains": "Classic jäätelö 80g kerrossu", "amount": 2.38},
        {"name_contains": "Cornichos pikku kurkut", "amount": 7.25},
        {"name_contains": "Fanta Sitruuna Zero", "amount": 2.59},
        {"name_contains": "Pullopantti KMP", "amount": 0.40}
    ]
    
    for i, expected in enumerate(expected_items):
        assert expected["name_contains"] in result["items"][i]["name"], \
            f"Item {i+1} name: expected to contain '{expected['name_contains']}', got '{result['items'][i]['name']}'"
        assert result["items"][i]["amount"] == expected["amount"], \
            f"Item {i+1} amount: expected {expected['amount']}, got {result['items'][i]['amount']}"


@pytest.mark.integration
def test_ocr_real_ksupermarket_jpg():
    """Test OCR with real Vision API on K-Supermarket receipt."""
    jpg_path = FIXTURES / "scanned_ksupermarket.jpg"
    if not jpg_path.exists():
        pytest.skip(f"Test fixture not found: {jpg_path}")
    
    img_bytes = jpg_path.read_bytes()
    text = ocr_image_bytes_(img_bytes)
    result = parse_receipt_text_(text)
    
    # Verify extracted data
    assert result["merchant"] == "K-Supermarket Kamppi"
    assert result["date"] == "2025-12-31"
    assert result["total"] == 12.47
    assert result["currency"] == "EUR"
    assert len(result["items"]) == 5
    
    # Expected items (using substring matching for OCR typos)
    expected_items = [
        {"name_contains": "Wotkins Henalan salami 100g", "amount": 3.95},
        {"name_contains": "Nongshim pikanuudeli 120g shin", "amount": 5.18},
        {"name_contains": "Candyking irtomakeinen", "amount": 0.95},
        {"name_contains": "Fanta Sitruuna Zero", "amount": 2.19},
        {"name_contains": "Pullopantti KMP", "amount": 0.20}
    ]
    
    for i, expected in enumerate(expected_items):
        assert expected["name_contains"] in result["items"][i]["name"], \
            f"Item {i+1} name: expected to contain '{expected['name_contains']}', got '{result['items'][i]['name']}'"
        assert result["items"][i]["amount"] == expected["amount"], \
            f"Item {i+1} amount: expected {expected['amount']}, got {result['items'][i]['amount']}"
