// Minimal Sheets/Drive/Apps Script adapter
// Factory returns an object with methods used by importers.

const { google } = (() => {
  try { return require('googleapis'); } catch (e) { return {}; }
})();

function createSheetsAdapter(clients = null) {
  const g = clients && clients.google ? clients.google : (google && google.google ? google.google : google);
  const authClient = (clients && clients.auth) || null;

  async function getValues(spreadsheetId, range) {
    if (!g || !g.sheets) throw new Error('googleapis not available');
    const sheets = g.sheets({ version: 'v4', auth: authClient });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return (res && res.data && res.data.values) || [];
  }

  async function appendRows(spreadsheetId, range, rows) {
    if (!g || !g.sheets) throw new Error('googleapis not available');
    const sheets = g.sheets({ version: 'v4', auth: authClient });
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows }
    });
    return res.data;
  }

  async function updateValues(spreadsheetId, range, rows) {
    if (!g || !g.sheets) throw new Error('googleapis not available');
    const sheets = g.sheets({ version: 'v4', auth: authClient });
    const res = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows }
    });
    return res.data;
  }

  async function copyFile(fileId, destName) {
    if (!g || !g.drive) throw new Error('googleapis not available');
    const drive = g.drive({ version: 'v3', auth: authClient });
    const res = await drive.files.copy({ fileId, requestBody: { name: destName } });
    return res.data;
  }

  async function runScript(scriptId, functionName, parameters = []) {
    if (!g || !g.script) throw new Error('googleapis not available');
    const script = g.script({ version: 'v1', auth: authClient });
    const res = await script.scripts.run({ scriptId, requestBody: { function: functionName, parameters } });
    return (res && res.data) || {};
  }

  return { getValues, appendRows, updateValues, copyFile, runScript };
}

module.exports = { createSheetsAdapter };
