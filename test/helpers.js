const fs = require('fs');
const path = require('path');

// Minimal reimplementations of pure helpers from the Apps Script project
function parseCsv(text) {
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cur.push(field);
        field = '';
      } else if (ch === '\r') {
        // ignore, will handle on \n
      } else if (ch === '\n') {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  // push last
  if (field !== '' || inQuotes || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }

  const cleaned = rows.map(r => r.map(c => String(c || '').trim()));
  if (cleaned.length === 0) return { header: [], records: [] };
  const header = cleaned[0];
  return { header, records: cleaned.slice(1) };
}
module.exports = { parseCsv };