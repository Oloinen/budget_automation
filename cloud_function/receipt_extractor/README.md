# Receipt Extractor Cloud Function

A Google Cloud Function that extracts structured data from Finnish grocery receipt images and PDFs using OCR and text parsing.

## Features

- **PDF text extraction**: Extracts text directly from text-based PDFs using PyMuPDF
- **OCR for images**: Uses Google Cloud Vision API for scanned receipts and images
- **Finnish receipt parsing**: Specialized parser for Finnish grocery stores (K-market, S-market, etc.)
- **Structured output**: Extracts merchant, date, total, currency, and line items

## Architecture

```
receipt_extractor/
├── extractor.py       # File handling, PDF extraction, OCR orchestration
├── parser.py          # Receipt text parsing logic
├── main.py            # Cloud Function entry point
├── requirements.txt   # Python dependencies
└── tests/
    ├── unit/         # Unit tests (no external dependencies)
    └── integration/  # Integration tests (requires Vision API credentials)
```

### Key Components

**extractor.py**
- `process_drive_file(file_id)` - Main entry point for processing a Drive file
- `extract_text_from_pdf_bytes_()` - Extracts text from text-based PDFs
- `ocr_scanned_pdf_bytes_()` - OCRs scanned PDF pages
- `ocr_image_bytes_()` - OCRs image files (JPG, PNG)
- `get_vision_client()` - Lazy-initialized Vision API client

**parser.py**
- `parse_receipt_text_(text)` - Parses receipt text into structured data
- `extract_merchant()` - Extracts and cleans merchant name
- `extract_date()` - Converts DD.MM.YYYY to YYYY-MM-DD
- `extract_total()` - Finds "YHTEENSÄ" marker and total amount
- `extract_items()` - Extracts line items with prices

## Dependencies

### Core Libraries
- **PyMuPDF (fitz)**: PDF text extraction
- **google-cloud-vision**: OCR for images
- **google-api-python-client**: Google Drive API access
- **Pillow (PIL)**: Image processing for OCR

### Test Libraries
- **pytest**: Test framework
- **pytest-mock**: Mocking support

## Local Development

### Setup

1. **Create virtual environment**:
   ```bash
   cd cloud_function/receipt_extractor
   python3 -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

2. **Install dependencies**:
   ```bash
   # Install production dependencies
   pip install -r requirements.txt
   
   # Install development dependencies (includes pytest)
   pip install -r requirements-dev.txt
   ```

3. **Configure Python environment** (if using VS Code):
   - Select interpreter: `.venv/bin/python`
   - Pylance will handle imports automatically

### Virtual Environment for Testing

The virtual environment is required for running tests locally. If you don't have it set up:

```bash
# Create and activate venv
python3 -m venv .venv
source .venv/bin/activate

# Install all dependencies
pip install -r requirements-dev.txt

# Verify installation
pytest --version
```

The `.venv` directory is git-ignored and should not be committed.

## Testing

### Unit Tests

Unit tests run without external dependencies (no API credentials needed). They use mocks and test fixtures.

**Run all unit tests**:
```bash
pytest tests/unit/ -v
```

**Run specific test file**:
```bash
pytest tests/unit/test_parser_pdf.py -v
```

**Run with coverage**:
```bash
pytest tests/unit/ --cov=. --cov-report=html
```

**What's tested**:
- PDF text parsing (3 tests)
- OCR text parsing (2 tests)
- Vision API integration with mocks (1 test)

### Integration Tests

Integration tests require Google Cloud credentials and make real API calls to Vision API.

**Prerequisites**:
1. Authenticate with Google Cloud:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

2. Verify credentials are working:
   ```bash
   gcloud auth application-default print-access-token >/dev/null && echo OK
   ```

3. Ensure your user account has:
   - Access to the Drive folder/files used in tests
   - Permission to call Vision API (or is in a project that has it enabled)

**Run integration tests**:
```bash
pytest tests/integration/ -v
```

**What's tested**:
- Real OCR on actual receipt images (JPG files)
- End-to-end parsing of OCR results
- Vision API response handling

**Note**: Integration tests are automatically skipped if user is not authenticated

### Run All Tests

**Excluding integration** (for CI/CD):
```bash
pytest -v -m "not integration"
```

**Including integration** (with credentials):
```bash
pytest -v
```

## Parser Behavior

### OCR Format Handling

OCR text often has items split across multiple lines:
```
Fanta Sitruuna Zero 0,51    <- Item name + volume indicator
2.19                         <- Actual price
```

The parser:
- Detects standalone amounts on following lines
- Strips volume indicators (0,51, 1,51 - misread "0,5l", "1,5l")
- Uses the next line amount as the actual price
- Preserves weight info (80g, 100g, 350/190)

### Merchant Name Cleaning

Removes unwanted details from merchant names:
- Postal codes (5-digit format)
- Phone numbers (Puh./Tel. patterns)
- City names at end of line

Example:
```
Input:  "K-market Töölöntori Tykistönkatu 7, 00260 Helsinki Puh. (09) 4342630"
Output: "K-market Töölöntori Tykistönkatu 7"
```

### Date Format

Converts Finnish date format to ISO:
```
Input:  "1.1.2026"
Output: "2026-01-01"
```

### Multi-line Totals

Handles cases where "YHTEENSÄ" and amount are on separate lines:
```
YHTEENSÄ
15.01
```

## Deployment

### Google Cloud Function

**Prerequisites**:
- Google Cloud project with Cloud Functions API enabled
- Vision API enabled
- Service account with necessary permissions

**Deploy using gcloud CLI**:
```bash
gcloud functions deploy receipt-extractor \
  --runtime python310 \
  --trigger-http \
  --allow-unauthenticated \
  --entry-point process_drive_file \
  --region europe-west1 \
  --memory 512MB \
  --timeout 60s
```

**Deploy with environment variables**:
```bash
gcloud functions deploy receipt-extractor \
  --runtime python310 \
  --trigger-http \
  --entry-point process_drive_file \
  --region europe-west1 \
  --set-env-vars GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

**Test deployment**:
```bash
curl -X POST https://europe-west1-PROJECT_ID.cloudfunctions.net/receipt-extractor \
  -H "Content-Type: application/json" \
  -d '{"file_id": "DRIVE_FILE_ID"}'
```

### Configuration

**Environment Variables**:
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account key (optional in GCP)

**Runtime**: Python 3.10+
**Memory**: 512MB recommended (handles PDF rendering)
**Timeout**: 60s (for OCR processing)

## Test Fixtures

Located in `tests/fixtures/`:
- **PDF files**: `pdf_test_k_market1.pdf`, `pdf_test_k_market2.pdf`, `pdf_test_s_market.pdf`
- **OCR text files**: `ocr_expected_k_market.txt`, `ocr_expected_k_supermarket.txt`
- **Image files**: `Scanned_20260104-1744.jpg`, `Scanned_20260104-1745.jpg`

## CI/CD

GitHub Actions workflow runs unit tests automatically on push/PR:

```yaml
- name: Run tests (excluding integration)
  run: pytest -v -m "not integration"
```

Integration tests are skipped in CI since credentials aren't available.

## Troubleshooting

**Import errors during tests**:
- Ensure `__init__.py` exists in all test directories
- Use relative imports: `from ...parser import parse_receipt_text_`

**Vision API authentication errors**:
- Check `GOOGLE_APPLICATION_CREDENTIALS` is set correctly
- Verify service account has Vision API permissions
- Use lazy initialization to avoid auth errors during imports

**PDF extraction returns empty text**:
- File may be scanned (image-based) - use OCR instead
- Check PDF isn't password-protected

**OCR not finding items**:
- Verify Finnish language hints: `language_hints=['fi', 'en']`
- Check image quality and resolution
- Review OCR output text structure

## Future Improvements

- [ ] Support for more receipt formats (restaurants, services)
- [ ] Batch processing for multiple receipts
- [ ] Caching parsed results
- [ ] Additional language support
- [ ] Enhanced item categorization
- [ ] Receipt validation (checksum, totals)
