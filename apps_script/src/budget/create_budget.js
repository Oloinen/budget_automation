const TEMPLATE_ID = "";
const FOLDER_ID = "";

// Optional: enforce the required sheet names
const REQUIRED_SHEETS = [
  "config",
  "categories",
  "transactions",
  "planned_budget",
  "monthly_actuals",
  "monthly_review",
];

// ====== MENU ======
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Budget")
    .addItem("Create new year...", "createBudgetPrompt")
    .addToUi();
}

// ====== ENTRYPOINT ======
function createBudgetPrompt() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt("Create budget file", "Enter year (e.g. 2026):", ui.ButtonSet.OK_CANCEL);

  if (res.getSelectedButton() !== ui.Button.OK) return;

  const yearStr = (res.getResponseText() || "").trim();
  const year = Number(yearStr);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    ui.alert("Invalid year. Use something like 2026.");
    return;
  }

  const newFileId = createBudgetForYear(year);
  const url = `https://docs.google.com/spreadsheets/d/${newFileId}/edit`;
  ui.alert(`Created Budget_${year}\n\nOpen:\n${url}`);
}

// ====== CORE LOGIC ======
function createBudgetForYear(year) {
  // Copy template into folder
  const templateFile = DriveApp.getFileById(TEMPLATE_ID);
  const folder = DriveApp.getFolderById(FOLDER_ID);

  // Avoid duplicates (optional but helpful)
  const desiredName = `Budget_${year}`;
  const existing = folder.getFilesByName(desiredName);
  if (existing.hasNext()) {
    throw new Error(`A file named ${desiredName} already exists in the target folder.`);
  }

  const copy = templateFile.makeCopy(desiredName, folder);
  const ss = SpreadsheetApp.open(copy);
  assertTemplateLooksRight(ss);

  // Set year
  const configSheet = ss.getSheetByName("config");
  configSheet.getRange("B1").setValue(year);

  // Populate planned budget rows from Categories
  populatePlannedBudget(ss);

  // Optional: make Transactions month column formula-friendly by leaving it empty
  // (you can also add an ARRAYFORMULA in the template if you want)

  return ss.getId();
}

function assertTemplateLooksRight(ss) {
  const names = ss.getSheets().map(s => s.getName());
  const missing = REQUIRED_SHEETS.filter(n => !names.includes(n));
  if (missing.length) {
    throw new Error(`Template is missing required sheets: ${missing.join(", ")}`);
  }
}

function populatePlannedBudget(ss) {
  const categoriesSheet = ss.getSheetByName("categories");
  const budgetSheet = ss.getSheetByName("planned_budget");

  const values = categoriesSheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0].map(h => String(h).trim().toLowerCase());
  const idx = (name) => headers.indexOf(name);

  const iGroup = idx("group");
  const iCategory = idx("category");
  const iSub = idx("subcategory");
  const iActive = idx("active");

  if ([iGroup, iCategory, iSub, iActive].some(i => i === -1)) {
    throw new Error("Categories sheet must have headers: group, category, subcategory, active");
  }

  const rows = values
    .slice(1)
    .filter(r => r[iActive] === true)
    .map(r => ([
      r[iGroup] || "",
      r[iCategory] || "",
      r[iSub] || "",
      "", "", "", "", "", "", "", "", "", "", // Jan-Dec (12)
      "", // yearly
    ]));

  // Clear old rows (keep header row)
  const lastRow = budgetSheet.getLastRow();
  if (lastRow > 1) {
    budgetSheet.getRange(2, 1, lastRow - 1, budgetSheet.getMaxColumns()).clearContent();
  }

  if (rows.length === 0) return;

  // Write starting at row 2, col 1; width = 3 + 12 + 1 = 16
  budgetSheet.getRange(2, 1, rows.length, 16).setValues(rows);

  // Optional: freeze header
  budgetSheet.setFrozenRows(1);
  budgetSheet.getRange(1, 1, 1, 16).setFontWeight("bold");
}
