/**
 * Receipt importer (Apps Script)
 *
 * What it does:
 * - scans a Drive folder for files (chunked so it can handle many files across multiple runs)
 * - calls Cloud Function receipt-extractor to extract text and parse receipts
 *   - handles both PDFs and images (JPG/PNG)
 *   - returns merchant, date, total, and line items
 * - matches items against item_rules
 *   - matched -> transactions_ready
 *   - unmatched -> receipt_staging + unknown_items
 * - writes one row per processed file to receipt_files
 *
 * Requirements:
 * - Cloud Function receipt-extractor must be deployed and accessible
 * - Apps Script must have permission to call the Cloud Function (uses ScriptApp.getIdentityToken())
 */

// Helpers used from utils.js: findBestRule, normaliseForMatch, readColumnValues, makeTxId, loadRules, toIso, toMonth, truncate

const RAW_TEXT_MAX_LENGTH = 45000; // Maximum length for raw OCR text in staging sheets

/**
 * Entry point: processes unprocessed files in the folder.
 * Safe to run multiple times - skips already processed files (idempotent).
 * Time budget protects against Apps Script execution limits.
 */
function importReceiptsFromFolder() {
  const FOLDER_ID = RECEIPTS_FOLDER_ID;
  const maxFilesPerRun = 40; // keep modest for Apps Script time limits
  const timeBudgetMs = 5.3 * 60 * 1000; // ~5.3 minutes safety

  const ss = SpreadsheetApp.getActive();
  const sheets = ensureSheets(ss);

  const rules = loadRules(sheets.rulesSheet, "pattern");

  // Idempotency: load existing file_ids to avoid reprocessing
  const existingFileIds = new Set(
    readColumnValues(sheets.filesSheet, "file_id").filter(Boolean)
  );

  // Load unknown items index for batch upsert
  const unknownItemsMap = getHeaders(sheets.unknownSheet);
  const unknownItemsIdx = loadUnknownItemsIndex(sheets.unknownSheet, unknownItemsMap);

  const folder = DriveApp.getFolderById(FOLDER_ID);

  // Collect file handles in a stable, deterministic order
  const filesArr = [];
  const it = folder.getFiles();
  while (it.hasNext()) filesArr.push(it.next());
  filesArr.sort((a, b) => (a.getName() || "").localeCompare(b.getName() || ""));

  const start = Date.now();
  let processed = 0;

  for (const file of filesArr) {
    // time budget guard
    if (Date.now() - start > timeBudgetMs) break;
    if (processed >= maxFilesPerRun) break;

    const name = file.getName() || "";

    // Skip non-supported types quickly
    const mt = file.getMimeType() || "";
    const isPdf = mt === "application/pdf";
    const isImage = mt.startsWith("image/") && (/\.(jpe?g|png)$/i.test(name) || mt.includes("jpeg") || mt.includes("png"));

    if (!isPdf && !isImage) {
      // ignore other files
      continue;
    }

    // Skip already processed files (idempotency check)
    const fileId = file.getId();
    if (existingFileIds.has(fileId)) {
      continue;
    }

    processed++;

    const receiptId = `r_${fileId}`;
    const importedAt = new Date();
    const importedAtIso = toIso(importedAt);

    try {
      // Call Cloud Function to extract and parse receipt
      const result = callReceiptExtractor(fileId);

      const rawText = result.raw_text || "";
      const detectedDate = result.date || "";
      const detectedMerchant = result.merchant || "";
      const detectedAmount = result.total ?? "";
      const items = Array.isArray(result.items) ? result.items : [];

      // Write receipt_files row (one per file)
      appendRow(sheets.filesSheet, [
        receiptId,
        fileId,
        name,
        importedAtIso,
        STATUS_PROCESSED,
        detectedDate,
        detectedMerchant,
        detectedAmount,
        false,
        ""
      ]);

      // Process each item: match rules and categorize
      processReceiptItems(sheets, items, detectedDate, detectedMerchant, receiptId, rawText, importedAtIso, rules, unknownItemsIdx);

    } catch (err) {
      // Write receipt_files row with error status
      appendRow(sheets.filesSheet, [
        `r_${fileId}`,
        fileId,
        name,
        importedAtIso,
        STATUS_ERROR,
        "",
        "",
        "",
        false,
        String(err && err.message ? err.message : err)
      ]);
    }
  }

  // Flush unknown items index (batch write)
  flushUnknownItems(sheets.unknownSheet, unknownItemsMap, unknownItemsIdx);

  console.log(`Processed ${processed} files this run.`);
}

/* ---------------------------
 * Process receipt items
 * --------------------------- */
function processReceiptItems(sheets, items, detectedDate, detectedMerchant, receiptId, rawText, importedAtIso, rules, unknownItemsIdx) {
  for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
    const item = items[itemIdx];
    const itemName = String(item?.name || "").trim();
    const itemAmount = item?.amount ?? item?.price ?? "";

    if (!itemName) continue;

    const match = findBestRule(normaliseForMatch(itemName), rules);

    if (match) {
      const txId = makeTxId(`${detectedDate}|${itemName}|${itemAmount}|${receiptId}|${itemIdx}`);
      const month = toMonth(detectedDate);
      
      // Check mode: 'review' goes to staging, 'auto' goes to ready
      if (match.mode === MODE_REVIEW) {
        // matched but needs review -> receipt_staging
        appendRow(sheets.stagingSheet, [
          txId,
          detectedDate,
          receiptId,
          detectedMerchant,
          itemAmount,
          match.group,
          match.category,
          importedAtIso,
          STATUS_NEEDS_REVIEW,
          truncate(rawText, RAW_TEXT_MAX_LENGTH)
        ]);
      } else {
        // matched with auto mode -> transactions_ready
        appendRow(sheets.readySheet, [
          txId,
          detectedDate,
          month,
          detectedMerchant,
          itemAmount,
          match.group,
          match.category,
          importedAtIso,
          `receipt:${receiptId}`
        ]);
      }
    } else {
      // unmatched -> receipt_staging + unknown_items
      const txId = makeTxId(`${detectedDate}|${itemName}|${itemAmount}|${receiptId}|${itemIdx}`);
      appendRow(sheets.stagingSheet, [
        txId,
        detectedDate,
        receiptId,
        detectedMerchant,
        itemAmount,
        "",
        "",
        importedAtIso,
        STATUS_NEEDS_RULE,
        truncate(rawText, RAW_TEXT_MAX_LENGTH)
      ]);

      // Upsert to unknown items index (batch update)
      const itemKey = normaliseForMatch(itemName);
      upsertUnknownItem(unknownItemsIdx, itemKey, itemName, detectedDate);
    }
  }
}

/* ---------------------------
 * Call Cloud Function receipt-extractor
 * --------------------------- */
function callReceiptExtractor(fileId) {
  const url = RECEIPT_EXTRACTOR_URL;
  
  // Get identity token for authentication
  const token = ScriptApp.getIdentityToken();
  
  const payload = { fileId };
  
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      "Authorization": `Bearer ${token}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  
  const code = res.getResponseCode();
  const body = res.getContentText();
  
  if (code < 200 || code >= 300) {
    throw new Error(`Receipt extractor error HTTP ${code}: ${body.substring(0, 1000)}`);
  }
  
  const json = JSON.parse(body);
  
  if (!json.ok) {
    throw new Error(`Receipt extractor returned error: ${json.error || "unknown error"}`);
  }
  
  return json.result;
}

/* Removed: upsertUnknownItem - now using shared unknowns_utils.js */

/* ---------------------------
 * Sheet helpers
 * --------------------------- */
function ensureSheets(ss) {
  const readySheet = getOrCreateSheet(ss, TAB_TRANSACTIONS_READY, HEADERS_TRANSACTIONS_READY);
  const stagingSheet = getOrCreateSheet(ss, TAB_RECEIPT_STAGING, HEADERS_RECEIPT_STAGING);
  const filesSheet = getOrCreateSheet(ss, TAB_RECEIPT_FILES, HEADERS_RECEIPT_FILES);
  const rulesSheet = getOrCreateSheet(ss, TAB_ITEM_RULES, HEADERS_ITEM_RULES);
  const unknownSheet = getOrCreateSheet(ss, TAB_UNKNOWN_ITEMS, HEADERS_UNKNOWN_ITEMS);

  return { readySheet, stagingSheet, filesSheet, rulesSheet, unknownSheet };
}

function getOrCreateSheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  ensureHeaders(sh, headers);
  return sh;
}

function ensureHeaders(sh, headers) {
  const range = sh.getRange(1, 1, 1, headers.length);
  const existing = range.getValues()[0].map(String);

  const same = headers.every((h, i) => (existing[i] || "") === h);
  if (!same) {
    range.setValues([headers]);
    sh.setFrozenRows(1);
  }
}

function appendRow(sh, row) {
  sh.appendRow(row);
}
