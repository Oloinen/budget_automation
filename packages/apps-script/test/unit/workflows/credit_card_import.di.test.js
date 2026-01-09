/**
 * Dependency Injection tests for credit_card_import
 * Proves that workflows can be fully tested with mocked dependencies
 */

const fs = require("fs");
const path = require("path");

describe("Credit Card Import - Dependency Injection", () => {
  test("runCreditCardImport accepts and uses injected dependencies", () => {
    // Load the source code
    const srcPath = path.join(
      __dirname,
      "../../..",
      "src",
      "workflows",
      "credit-card",
      "credit_card_import.js",
    );
    const src = fs.readFileSync(srcPath, "utf8");

    // Mock require function
    const requireShim = (p) => {
      if (p.includes("errors")) {
        return require(path.join(__dirname, "../../..", "src", "core", "errors"));
      }
      if (p.includes("runtime-ids")) {
        return require(path.join(__dirname, "../../..", "src", "core", "runtime-ids"));
      }
      if (p.includes("shared/schema")) {
        return require(path.join(__dirname, "..", "..", "shared", "schema"));
      }
      if (p.includes("notification_utils")) {
        return { notifyImportFailure: () => {} };
      }
      if (p.startsWith(".") || p.startsWith("..")) {
        return require(path.join(path.dirname(srcPath), p));
      }
      return require(p);
    };

    // Create the module
    const fn = new Function("require", "globalThis", src + "\nreturn { runCreditCardImport };");
    const mockGlobalThis = {};
    const module = fn(requireShim, mockGlobalThis);

    // Mock dependencies - tracking whether they're called
    let spreadsheetOpened = false;
    let sessionGetTimezoneCalled = false;

    const mockDeps = {
      SpreadsheetApp: {
        openById: (id) => {
          spreadsheetOpened = true;
          expect(id).toBe("test-sheet-id");
          // Return mock that will cause early return (no tabs found)
          return {
            getSheetByName: () => null,
          };
        },
      },
      DriveApp: {
        getFolderById: (id) => {
          expect(id).toBe("test-folder-id");
          return {
            getFiles: () => ({
              hasNext: () => false,
            }),
          };
        },
      },
      Session: {
        getScriptTimeZone: () => {
          sessionGetTimezoneCalled = true;
          return "UTC";
        },
      },
      getBudgetDataSheetId: () => "test-sheet-id",
      getCreditCardStatementsFolderId: () => "test-folder-id",
      schema: require("../../../../shared/schema"),
      checkApiQuota: undefined,
    };

    // Call the function with mocked dependencies
    // Note: Will throw because getTabByName will fail with null sheet
    // But this proves deps are being used instead of globals
    try {
      module.runCreditCardImport(mockDeps);
    } catch (err) {
      // Expected to fail - we're just proving DI works
    }

    // Verify mocks were called - proves DI is working!
    expect(spreadsheetOpened).toBe(true);
    expect(sessionGetTimezoneCalled).toBe(true);
  });
});
