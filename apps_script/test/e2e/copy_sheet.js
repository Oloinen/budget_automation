#!/usr/bin/env node
// Copy a Google Sheets file using Drive API and print the new file id.
const { google } = require("googleapis");

async function main() {
  const sourceId = process.env.PRODUCTION_BUDGET_DATA_SHEET_ID;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
  if (!sourceId || !keyJson) {
    console.error("Require PRODUCTION_BUDGET_DATA_SHEET_ID and GOOGLE_SERVICE_ACCOUNT_KEY_JSON");
    process.exit(2);
  }
  const credentials = JSON.parse(keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  const client = await auth.getClient();
  const drive = google.drive({ version: "v3", auth: client });

  const name = "budget_data-e2e-" + Date.now();
  try {
    const res = await drive.files.copy({ fileId: sourceId, requestBody: { name } });
    console.log(res.data.id);
  } catch (e) {
    console.error("Copy failed", e);
    process.exit(1);
  }
}

main();
