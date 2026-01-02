// OCR and Drive IO helpers for receipts
function ocrPdfToText(pdfFile) {
  // Requires Advanced Google Service "Drive" enabled (v2)
  const resource = {
    title: `OCR_${pdfFile.getName()}_${pdfFile.getId()}`,
    mimeType: "application/vnd.google-apps.document"
  };

  const docFile = Drive.Files.insert(resource, pdfFile.getBlob(), { ocr: true });
  const doc = DocumentApp.openById(docFile.id);
  const text = doc.getBody().getText() || "";

  // Clean up OCR doc
  DriveApp.getFileById(docFile.id).setTrashed(true);
  return text;
}

function makeReceiptId(file) {
  // stable per file content version: fileId + lastUpdated
  const payload = `${file.getId()}|${file.getLastUpdated().toISOString()}`;
  // reuse shared makeTxId from utils and take first 20 chars
  return makeTxId(payload).slice(0, 20);
}
