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
import os
from pathlib import Path
from ...extractor import ocr_image_bytes_
from ...parser import parse_receipt_text_

FIXTURES = Path(__file__).parent.parent / "fixtures"

# Skip if credentials not available
pytestmark = pytest.mark.skipif(
    not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
    reason="Requires GOOGLE_APPLICATION_CREDENTIALS environment variable"
)


@pytest.mark.integration
def test_ocr_real_kmarket_jpg():
    """Test OCR with real Vision API on K-market receipt."""
    jpg_path = FIXTURES / "Scanned_20260104-1744.jpg"
    if not jpg_path.exists():
        pytest.skip(f"Test fixture not found: {jpg_path}")
    
    img_bytes = jpg_path.read_bytes()
    text = ocr_image_bytes_(img_bytes)
    result = parse_receipt_text_(text)
    
    # Verify extracted data
    assert result["merchant"] == "K-market Töölöntori Tykistönkatu 7"
    assert result["date"] == "2026-01-01"
    assert result["total"] == 15.01
    assert result["currency"] == "EUR"
    assert len(result["items"]) == 6


@pytest.mark.integration
def test_ocr_real_ksupermarket_jpg():
    """Test OCR with real Vision API on K-Supermarket receipt."""
    jpg_path = FIXTURES / "Scanned_20260104-1745.jpg"
    if not jpg_path.exists():
        pytest.skip(f"Test fixture not found: {jpg_path}")
    
    img_bytes = jpg_path.read_bytes()
    text = ocr_image_bytes_(img_bytes)
    result = parse_receipt_text_(text)
    
    # Verify extracted data
    assert result["merchant"] == "K-Supermarket Kamppi Urho Kekkosen katu 1 A 24"
    assert result["date"] == "2025-12-31"
    assert result["total"] == 12.47
    assert result["currency"] == "EUR"
    assert len(result["items"]) == 5
