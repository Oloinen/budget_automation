/**
 * Receipt importer (Apps Script)
 *
 * What it does:
 * - scans a Drive folder for files (chunked so it can handle many files across multiple runs)
 * - if PDF -> PdfApp.extractText (async)
 * - if JPG/JPEG/PNG -> Google Vision OCR via HTTP (UrlFetchApp)
 * - calls parseReceiptText_ (YOU implement later) to produce a receipt object with items
 * - matches items against item_rules
 *   - matched -> transactions_ready
 *   - unmatched -> receipt_staging + unknown_items
 * - writes one row per processed file to receipt_files
 *
 * Requirements:
 * - Add PDF.gs library so PdfApp is defined.
 * - Set a Vision API key in Script Properties: VISION_API_KEY
 *   (or replace ocrImageWithVision_ with your preferred OCR approach).
 */

/**
 * Entry point: processes up to `maxFilesPerRun` files per execution.
 * Re-run it until it finishes the folder (it stores a cursor in Script Properties).
 */
async function importReceiptsFromFolder() {
  const FOLDER_ID = "PUT_YOUR_FOLDER_ID_HERE";
  const maxFilesPerRun = 40; // keep modest for Apps Script time limits
  const timeBudgetMs = 5.3 * 60 * 1000; // ~5.3 minutes safety

  const ss = SpreadsheetApp.getActive();
  const sheets = ensureSheets_(ss);

  const rules = loadItemRules_(sheets.rulesSheet);

  // Cursor (stable order by filename)
  const props = PropertiesService.getScriptProperties();
  const cursorName = props.getProperty("RECEIPT_IMPORT_CURSOR_NAME") || "";

  const folder = DriveApp.getFolderById(FOLDER_ID);

  // Collect file handles in a stable, deterministic order
  const filesArr = [];
  const it = folder.getFiles();
  while (it.hasNext()) filesArr.push(it.next());
  filesArr.sort((a, b) => (a.getName() || "").localeCompare(b.getName() || ""));

  const start = Date.now();
  let processed = 0;
  let lastNameProcessed = cursorName;
  let started = cursorName === ""; // if no cursor, start immediately

  for (const file of filesArr) {
    // time budget guard
    if (Date.now() - start > timeBudgetMs) break;
    if (processed >= maxFilesPerRun) break;

    const name = file.getName() || "";
    if (!started) {
      if (name > cursorName) started = true; // resume after the cursor
      else continue;
    }

    // Skip non-supported types quickly
    const mt = file.getMimeType() || "";
    const isPdf = mt === MimeType.PDF || mt === "application/pdf";
    const isImage = mt.startsWith("image/") && (/\.(jpe?g|png)$/i.test(name) || mt.includes("jpeg") || mt.includes("png"));

    if (!isPdf && !isImage) {
      // ignore other files
      lastNameProcessed = name;
      continue;
    }

    processed++;
    lastNameProcessed = name;

    const receiptId = Utilities.getUuid();
    const importedAt = new Date();
    const importedAtIso = toIso_(importedAt);

    try {
      // 1) get raw text (pdf extract or image OCR)
      let rawText = "";
      let status = "IMPORTED";

      if (isPdf) {
        rawText = await extractPdfText_(file);
      } else {
        rawText = ocrImageWithVision_(file); // sync HTTP call
      }

      // 2) parse receipt (YOU implement later)
      // Expected shape (example):
      // {
      //   date: "2026-01-03", merchant: "LIDL", amount: 12.45,
      //   items: [{ name: "MILK", amount: 1.89 }, ...]
      // }
      const parsed = parseReceiptText_(rawText, { fileId: file.getId(), fileName: name, receiptId });

      // Defensive fallbacks
      const detectedDate = parsed?.date || "";
      const detectedMerchant = parsed?.merchant || "";
      const detectedAmount = parsed?.amount ?? "";
      const items = Array.isArray(parsed?.items) ? parsed.items : [];

      // 3) compare items to rules and write rows
      const postedAtIso = importedAtIso;

      // Write receipt_files row (one per file)
      appendRow_(sheets.filesSheet, HEADERS_RECEIPT_FILES, [
        receiptId,
        file.getId(),
        name,
        importedAtIso,
        "PROCESSED",
        detectedDate,
        detectedMerchant,
        detectedAmount,
        false,
        ""
      ]);

      // If no items, stage whole receipt for review
      if (items.length === 0) {
        const txId = Utilities.getUuid();
        appendRow_(sheets.stagingSheet, HEADERS_RECEIPT_STAGING, [
          txId,
          detectedDate,
          receiptId,
          detectedMerchant,
          detectedAmount,
          truncate_(rawText, 45000),
          "",
          "",
          postedAtIso,
          "NO_ITEMS_PARSED"
        ]);
        continue;
      }

      // For each item: match rules
      for (const item of items) {
        const itemName = String(item?.name || "").trim();
        const itemAmount = item?.amount ?? item?.price ?? "";

        if (!itemName) continue;

        const match = matchItemRule_(itemName, rules);

        if (match) {
          // matched -> transactions_ready
          const txId = Utilities.getUuid();
          const month = toMonth_(detectedDate);
          appendRow_(sheets.readySheet, HEADERS_TRANSACTIONS_READY, [
            txId,
            detectedDate,
            month,
            detectedMerchant,
            itemAmount,
            match.group,
            match.category,
            postedAtIso,
            `receipt:${receiptId}`
          ]);
        } else {
          // unmatched -> receipt_staging + unknown_items
          const txId = Utilities.getUuid();
          appendRow_(sheets.stagingSheet, HEADERS_RECEIPT_STAGING, [
            txId,
            detectedDate,
            receiptId,
            detectedMerchant,
            itemAmount,
            truncate_(rawText, 45000),
            "",
            "",
            postedAtIso,
            "NEEDS_RULE"
          ]);

          upsertUnknownItem_(sheets.unknownSheet, itemName);
        }
      }

    } catch (err) {
      // Write receipt_files row with error status
      appendRow_(sheets.filesSheet, HEADERS_RECEIPT_FILES, [
        receiptId,
        file.getId(),
        name,
        importedAtIso,
        "ERROR",
        "",
        "",
        "",
        false,
        String(err && err.message ? err.message : err)
      ]);
    }
  }

  // Update cursor
  props.setProperty("RECEIPT_IMPORT_CURSOR_NAME", lastNameProcessed);

  console.log(`Processed this run: ${processed}. Cursor now: ${lastNameProcessed || "(none)"}`);
}

/* ---------------------------
 * PDF direct extraction (async)
 * --------------------------- */
async function extractPdfText_(file) {
  const bytes = file.getBlob().getBytes();
  const binary = Uint8Array.from(bytes);
  const text = await PdfApp.extractText(binary); // requires PDF.gs
  return (typeof text === "string") ? text : String(text ?? "");
}

/* ---------------------------
 * Vision OCR for images (sync)
 * --------------------------- */
function ocrImageWithVision_(file) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("VISION_API_KEY");
  if (!apiKey) throw new Error("Missing Script Property: VISION_API_KEY");

  const blob = file.getBlob();
  const b64 = Utilities.base64Encode(blob.getBytes());

  const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
  const payload = {
    requests: [{
      image: { content: b64 },
      features: [{ type: "TEXT_DETECTION" }],
      imageContext: { languageHints: ["fi", "en"] }
    }]
  };

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const body = res.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(`Vision OCR error HTTP ${code}: ${body.substring(0, 1000)}`);
  }

  const json = JSON.parse(body);
  const text = json?.responses?.[0]?.fullTextAnnotation?.text || "";
  return String(text);
}

/* ---------------------------
 * YOU will implement this later
 * --------------------------- */
function parseReceiptText_(rawText, meta) {
  // Implement this yourself.
  // Must return { date, merchant, amount, items: [{name, amount}] }
  // For now: throw so you remember to replace it.
  throw new Error("parseReceiptText_ is not implemented yet.");
}

/* ---------------------------
 * Rules: load + match
 * --------------------------- */
function loadItemRules_(rulesSheet) {
  const values = rulesSheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const header = values[0].map(String);
  const idx = {
    pattern: header.indexOf("pattern"),
    group: header.indexOf("group"),
    category: header.indexOf("category"),
    mode: header.indexOf("mode")
  };

  const rules = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const pattern = String(row[idx.pattern] ?? "").trim();
    if (!pattern) continue;

    rules.push({
      pattern,
      group: String(row[idx.group] ?? "").trim(),
      category: String(row[idx.category] ?? "").trim(),
      mode: String(row[idx.mode] ?? "").trim().toLowerCase() || "regex"
    });
  }
  return rules;
}

function matchItemRule_(itemName, rules) {
  const s = itemName.trim();

  for (const rule of rules) {
    const mode = rule.mode || "regex";

    if (mode === "equals") {
      if (s.toLowerCase() === rule.pattern.toLowerCase()) return rule;
    } else if (mode === "contains") {
      if (s.toLowerCase().includes(rule.pattern.toLowerCase())) return rule;
    } else {
      // regex (default)
      try {
        const re = new RegExp(rule.pattern, "i");
        if (re.test(s)) return rule;
      } catch (e) {
        // invalid regex in sheet -> ignore this rule
        continue;
      }
    }
  }
  return null;
}

/* ---------------------------
 * Unknown items upsert
 * --------------------------- */
function upsertUnknownItem_(unknownSheet, itemName) {
  // Unknown items are tracked by exact itemName as "pattern"
  const nowIso = toIso_(new Date());

  const data = unknownSheet.getDataRange().getValues();
  const header = data[0].map(String);

  const iPattern = header.indexOf("pattern");
  const iCount = header.indexOf("count");
  const iFirst = header.indexOf("first_seen");
  const iLast = header.indexOf("last_seen");
  const iGroup = header.indexOf("group");
  const iCategory = header.indexOf("category");
  const iMode = header.indexOf("mode");

  // Linear scan is fine at your scale; optimize later if needed
  for (let r = 1; r < data.length; r++) {
    const existing = String(data[r][iPattern] ?? "");
    if (existing === itemName) {
      const rowNum = r + 1;
      const count = Number(data[r][iCount] ?? 0) + 1;
      unknownSheet.getRange(rowNum, iCount + 1).setValue(count);
      unknownSheet.getRange(rowNum, iLast + 1).setValue(nowIso);
      return;
    }
  }

  // Insert new unknown item row
  appendRow_(unknownSheet, HEADERS_UNKNOWN_ITEMS, [
    itemName,
    "", // group
    "", // category
    "equals",
    1,
    nowIso,
    nowIso
  ]);
}

/* ---------------------------
 * Sheet helpers
 * --------------------------- */
function ensureSheets_(ss) {
  const readySheet = getOrCreateSheet_(ss, TAB_TRANSACTIONS_READY, HEADERS_TRANSACTIONS_READY);
  const stagingSheet = getOrCreateSheet_(ss, TAB_RECEIPT_STAGING, HEADERS_RECEIPT_STAGING);
  const filesSheet = getOrCreateSheet_(ss, TAB_RECEIPT_FILES, HEADERS_RECEIPT_FILES);
  const rulesSheet = getOrCreateSheet_(ss, TAB_ITEM_RULES, HEADERS_ITEM_RULES);
  const unknownSheet = getOrCreateSheet_(ss, TAB_UNKNOWN_ITEMS, HEADERS_UNKNOWN_ITEMS);

  return { readySheet, stagingSheet, filesSheet, rulesSheet, unknownSheet };
}

function getOrCreateSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  ensureHeaders_(sh, headers);
  return sh;
}

function ensureHeaders_(sh, headers) {
  const range = sh.getRange(1, 1, 1, headers.length);
  const existing = range.getValues()[0].map(String);

  const same = headers.every((h, i) => (existing[i] || "") === h);
  if (!same) {
    range.setValues([headers]);
    sh.setFrozenRows(1);
  }
}

function appendRow_(sh, headers, row) {
  // Assumes headers already present
  sh.appendRow(row);
}

/* ---------------------------
 * Utility
 * --------------------------- */
function toIso_(d) {
  // Apps Script Date -> ISO-like string in spreadsheet-friendly format
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

function toMonth_(yyyyMmDd) {
  // expects "YYYY-MM-DD"
  if (!yyyyMmDd || typeof yyyyMmDd !== "string" || yyyyMmDd.length < 7) return "";
  return yyyyMmDd.substring(0, 7); // "YYYY-MM"
}

function truncate_(s, maxLen) {
  const str = String(s ?? "");
  return str.length <= maxLen ? str : str.substring(0, maxLen);
}
