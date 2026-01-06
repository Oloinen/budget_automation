from unittest.mock import Mock
from ...extractor import ocr_image_bytes_

def test_ocr_calls_vision_client(monkeypatch):
    fake_client = Mock()
    fake_resp = Mock()
    fake_resp.error = None
    fake_resp.full_text_annotation.text = "K-market\nYHTEENSÄ 12,47\n"
    fake_client.text_detection.return_value = fake_resp

    # Patch the module-level function to avoid auth
    from ... import extractor
    monkeypatch.setattr(extractor, "get_vision_client", lambda: fake_client)

    out = ocr_image_bytes_(b"fake-bytes")
    assert "YHTEENSÄ" in out
    fake_client.text_detection.assert_called_once()
