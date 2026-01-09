const { loadConfig } = require("./load_config");
const { google } = require("./googleapis-wrapper");

async function setupClients(cfg = loadConfig()) {
  if (!cfg.keyJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_JSON is required to setup clients");
  }

  const credentials = JSON.parse(cfg.keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/script.projects",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });
  const drive = google.drive({ version: "v3", auth: client });
  const script = google.script({ version: "v1", auth: client });

  return { auth, sheets, drive, script };
}

async function createTestSpreadsheet(drive, cfg = loadConfig()) {
  if (!cfg.templateSheetId || !cfg.testFolderId) {
    throw new Error("TEST_TEMPLATE_SHEET_ID and TEST_FOLDER_ID are required to create test spreadsheet");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const testName = `E2E_Test_${timestamp}`;

  const res = await drive.files.copy({
    fileId: cfg.templateSheetId,
    requestBody: { name: testName, parents: [cfg.testFolderId] },
  });

  return res.data.id;
}

async function cleanup(drive, ids = []) {
  const filesToDelete = ids.filter(Boolean);
  for (const fileId of filesToDelete) {
    try {
      await drive.files.delete({ fileId });
    } catch (err) {
      console.warn(`⚠️  Failed to delete ${fileId}: ${err.message}`);
    }
  }
}

module.exports = { setupClients, createTestSpreadsheet, cleanup };
