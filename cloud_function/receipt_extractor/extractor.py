import io
from datetime import datetime, timezone
import google.auth
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

import fitz  # PyMuPDF
from google.cloud import vision

from .parser import parse_receipt_text_

# Tune these based on your receipts
MIN_TEXT_CHARS_FOR_TEXT_PDF = 200
MAX_OCR_PAGES = 3          # receipts are usually 1, sometimes 2
OCR_DPI = 200              # 200–300 is fine; 300 increases cost/latency

_vision_client = None

def get_vision_client():
    """Lazy-initialize Vision client to avoid auth errors during imports."""
    global _vision_client
    if _vision_client is None:
        _vision_client = vision.ImageAnnotatorClient()
    return _vision_client

def process_drive_file(file_id: str) -> dict:
    creds, _ = google.auth.default()
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)

    # 1) Read metadata (also useful for returning in result)
    meta = drive.files().get(
        fileId=file_id,
        fields="id,name,mimeType,size"
    ).execute()

    mime_type = meta.get("mimeType", "")
    file_name = meta.get("name", "")

    # 2) Download bytes
    data = download_drive_file_bytes_(drive, file_id)

    extracted_at = datetime.now(timezone.utc).isoformat()

    # 3) Extract text depending on type
    warnings = []
    raw_text = ""

    if mime_type == "application/pdf":
        raw_text = extract_text_from_pdf_bytes_(data)
        if len(raw_text.strip()) < MIN_TEXT_CHARS_FOR_TEXT_PDF:
            warnings.append("PDF text layer empty/short; treating as scanned and OCRing pages.")
            raw_text = ocr_scanned_pdf_bytes_(data, warnings=warnings)

    elif mime_type.startswith("image/"):
        raw_text = ocr_image_bytes_(data)

    else:
        raise ValueError(f"Unsupported mimeType: {mime_type}")

    # 4) Parse into your desired JSON (placeholder)
    parsed = parse_receipt_text_(raw_text)

    # 5) Shape the response to your schema (v1)
    # Keep it strict and predictable.
    return {
        "receipt_id": parsed.get("receipt_id") or "",  # you can set this upstream if you want
        "source": {
            "file_id": meta.get("id", ""),
            "file_name": file_name,
            "mime_type": mime_type,
        },
        "extracted_at": extracted_at,
        "merchant": parsed.get("merchant", "") or "",
        "date": parsed.get("date", "") or "",
        "total": parsed.get("total", None),
        "currency": parsed.get("currency", "EUR"),
        "items": parsed.get("items", []) or [],
        "raw_text": raw_text or "",
        "warnings": warnings,
    }


def download_drive_file_bytes_(drive, file_id: str) -> bytes:
    request = drive.files().get_media(fileId=file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return fh.getvalue()


def extract_text_from_pdf_bytes_(pdf_bytes: bytes) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    parts = []
    for i in range(doc.page_count):
        page = doc.load_page(i)
        parts.append(page.get_text("text"))
    doc.close()
    return "\n".join(parts)


def ocr_scanned_pdf_bytes_(pdf_bytes: bytes, warnings=None) -> str:
    warnings = warnings if warnings is not None else []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    pages = min(doc.page_count, MAX_OCR_PAGES)
    if doc.page_count > MAX_OCR_PAGES:
        warnings.append(f"PDF has {doc.page_count} pages; OCR limited to first {MAX_OCR_PAGES}.")

    parts = []
    zoom = OCR_DPI / 72.0  # PDF points are 72 DPI
    mat = fitz.Matrix(zoom, zoom)

    for i in range(pages):
        page = doc.load_page(i)
        pix = page.get_pixmap(matrix=mat, alpha=False)  # RGB
        img_bytes = pix.tobytes("png")
        parts.append(ocr_image_bytes_(img_bytes))

    doc.close()
    return "\n".join(parts)


def ocr_image_bytes_(img_bytes: bytes) -> str:
    image = vision.Image(content=img_bytes)
    resp = get_vision_client().text_detection(image=image, image_context={"language_hints": ["fi", "en"]})
    if resp.error and resp.error.message:
        raise RuntimeError(f"Vision OCR error: {resp.error.message}")
    return resp.full_text_annotation.text or ""
