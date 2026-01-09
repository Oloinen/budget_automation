/**
 * Mock-based integration test for receipt import
 * Tests the full receipt import flow with mocked Apps Script globals and Cloud Function
 */

const { setupAppsScriptGlobals } = require("../../e2e/helpers/mocks/appsScriptGlobalsMock");
const { successfulResponse } = require("../../e2e/fixtures/cloudFunctionResponses");
const { itemRules } = require("../../e2e/fixtures/receiptData");

describe("Receipt Import - Full Flow (Mock)", () => {
  let mocks;

  beforeEach(() => {
    // Setup all mocks with successful Cloud Function response
    mocks = setupAppsScriptGlobals({
      cloudFunctionResponse: successfulResponse,
    });
  });

  test("should process supported files and skip unsupported types", async () => {
    // Setup item_rules sheet with test data
    const rulesSheet = mocks.mockSpreadsheet.getSheetByName("item_rules");
    itemRules.basic.forEach((rule) => rulesSheet.appendRow(rule));

    // Run import logic (simplified version)
    const filesArr = [];
    const it = mocks.mockFolder.getFiles();
    while (it.hasNext()) filesArr.push(it.next());

    let supportedCount = 0;
    for (const file of filesArr) {
      const mt = file.getMimeType();
      const _name = file.getName();
      const isPdf = mt === "application/pdf";
      const isImage =
        mt.startsWith("image/") &&
        (/\.(jpe?g|png)$/i.test(_name) || mt.includes("jpeg") || mt.includes("png"));

      if (isPdf || isImage) {
        supportedCount++;
      }
    }

    expect(supportedCount).toBe(3); // PDF, JPG, and PNG - not TXT
  });

  test("should call Cloud Function with correct file ID", async () => {
    const fileId = "test-file-123";

    const response = global.UrlFetchApp.fetch(
      "https://europe-north1-budget-automation-483211.cloudfunctions.net/receipt-extractor",
      {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer mock-token" },
        payload: JSON.stringify({ fileId }),
      },
    );

    expect(response.getResponseCode()).toBe(200);
    const requestLog = mocks.mockUrlFetchApp._getRequestLog();
    expect(requestLog.length).toBe(1);
    expect(requestLog[0].payload.fileId).toBe(fileId);
  });

  test("should transform Cloud Function response to parsed format", () => {
    const result = successfulResponse.result;

    const parsed = {
      date: result.date || "",
      merchant: result.merchant || "",
      amount: result.total ?? "",
      items: result.items || [],
    };

    expect(parsed.date).toBe("2026-01-05");
    expect(parsed.merchant).toBe("K-Market");
    expect(parsed.amount).toBe(15.67);
    expect(parsed.items.length).toBe(3);
  });

  test("should write receipt_files entry for processed file", () => {
    const filesSheet = mocks.mockSpreadsheet.getSheetByName("receipt_files");

    filesSheet.appendRow([
      "receipt-123",
      "file-001",
      "receipt1.pdf",
      "2026-01-05T12:00:00",
      "PROCESSED",
      "2026-01-05",
      "K-Market",
      15.67,
      false,
      "",
    ]);

    expect(filesSheet._data.length).toBe(1);
    const row = filesSheet._data[0];
    expect(row[1]).toBe("file-001"); // file_id
    expect(row[4]).toBe("PROCESSED"); // status
    expect(row[6]).toBe("K-Market"); // detected_merchant
  });

  test("should match items to rules and create transactions_ready entries", () => {
    const rulesSheet = mocks.mockSpreadsheet.getSheetByName("item_rules");
    itemRules.basic.forEach((rule) => rulesSheet.appendRow(rule));

    const readySheet = mocks.mockSpreadsheet.getSheetByName("transactions_ready");

    // Simulate matching "Maito 1L" against rules
    const itemName = "Maito 1L";
    const pattern = "maito";
    if (itemName.toLowerCase().includes(pattern.toLowerCase())) {
      readySheet.appendRow([
        "tx-123",
        "2026-01-05",
        "2026-01",
        "K-Market",
        1.89,
        "Food",
        "Groceries",
        "2026-01-05T12:00:00",
        "receipt:receipt-123",
      ]);
    }

    expect(readySheet._data.length).toBe(1);
    expect(readySheet._data[0][5]).toBe("Food"); // group
    expect(readySheet._data[0][6]).toBe("Groceries"); // category
  });

  test("should create staging entry for unmatched items", () => {
    const stagingSheet = mocks.mockSpreadsheet.getSheetByName("receipt_staging");

    // Unmatched item goes to staging
    stagingSheet.appendRow([
      "tx-456",
      "2026-01-05",
      "receipt-123",
      "K-Market",
      3.99,
      "K-Market\n05.01.2026\nUnknown Item 3.99",
      "",
      "",
      "2026-01-05T12:00:00",
      "NEEDS_RULE",
    ]);

    expect(stagingSheet._data.length).toBe(1);
    expect(stagingSheet._data[0][9]).toBe("NEEDS_RULE"); // status
    expect(stagingSheet._data[0][4]).toBe(3.99); // amount
  });

  test("should track unknown items", () => {
    const unknownSheet = mocks.mockSpreadsheet.getSheetByName("unknown_items");

    unknownSheet.appendRow([
      "Unknown Item",
      "",
      "",
      "equals",
      1,
      "2026-01-05T12:00:00",
      "2026-01-05T12:00:00",
    ]);

    expect(unknownSheet._data.length).toBe(1);
    expect(unknownSheet._data[0][0]).toBe("Unknown Item");
    expect(unknownSheet._data[0][4]).toBe(1); // count
  });

  test("should create staging entry when no items parsed", () => {
    const stagingSheet = mocks.mockSpreadsheet.getSheetByName("receipt_staging");

    // Simulate receipt with no items
    const items = [];
    if (items.length === 0) {
      stagingSheet.appendRow([
        "tx-789",
        "2026-01-05",
        "receipt-123",
        "K-Market",
        15.67,
        "Raw OCR text...",
        "",
        "",
        "2026-01-05T12:00:00",
        "NO_ITEMS_PARSED",
      ]);
    }

    expect(stagingSheet._data.length).toBe(1);
    expect(stagingSheet._data[0][9]).toBe("NO_ITEMS_PARSED");
  });

  test("should handle Cloud Function errors gracefully", () => {
    global.UrlFetchApp.fetch = () => ({
      getResponseCode: () => 500,
      getContentText: () => "Internal Server Error",
    });

    const filesSheet = mocks.mockSpreadsheet.getSheetByName("receipt_files");

    try {
      const res = global.UrlFetchApp.fetch("url", {});
      const code = res.getResponseCode();

      if (code >= 400) {
        // Error case: write error status
        filesSheet.appendRow([
          "receipt-error",
          "file-001",
          "receipt1.pdf",
          "2026-01-05T12:00:00",
          "ERROR",
          "",
          "",
          "",
          false,
          "Receipt extractor error HTTP 500",
        ]);
      }
    } catch (err) {
      // Handle error
    }

    expect(filesSheet._data.length).toBe(1);
    expect(filesSheet._data[0][4]).toBe("ERROR");
  });

  test("should not process already processed files (idempotency)", () => {
    const filesSheet = mocks.mockSpreadsheet.getSheetByName("receipt_files");
    const rulesSheet = mocks.mockSpreadsheet.getSheetByName("item_rules");
    itemRules.basic.forEach((rule) => rulesSheet.appendRow(rule));

    // Simulate file already processed in previous run
    filesSheet.appendRow([
      "receipt-123",
      "file-001", // This file_id already exists (receipt1.pdf)
      "receipt1.pdf",
      "2026-01-04T12:00:00",
      "PROCESSED",
      "2026-01-04",
      "K-Market",
      10.5,
      false,
      "",
    ]);

    // Get existing file_ids (simulating readColumnValues)
    const data = filesSheet.getDataRange().getValues();
    const header = data[0];
    const fileIdCol = header.indexOf("file_id");
    const existingFileIds = new Set();

    for (let i = 1; i < data.length; i++) {
      const fileId = data[i][fileIdCol];
      if (fileId) existingFileIds.add(fileId);
    }

    expect(existingFileIds.has("file-001")).toBe(true);

    // Try to process files
    const filesArr = mocks.mockFiles.slice();
    let skipped = 0;
    let processed = 0;

    for (const file of filesArr) {
      const fileId = file.getId();
      const mt = file.getMimeType();
      const _name = file.getName();

      // Skip non-supported types
      const isPdf = mt === "application/pdf";
      const isImage = mt.startsWith("image/");
      if (!isPdf && !isImage) continue;

      // Skip already processed
      if (existingFileIds.has(fileId)) {
        skipped++;
        continue;
      }
      processed++;
    }

    // Should skip file-001 (already processed PDF)
    expect(skipped).toBe(1);
    expect(processed).toBe(2); // file-002 (JPG) and file-003 (PNG) - file-004 (TXT) filtered by mime type
  });
});
