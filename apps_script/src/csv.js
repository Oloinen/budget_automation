// Shared CSV parser used in Node tests and as a fallback in Apps Script runtime.
function parseCsvFallback(text) {
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < (text || '').length; i++) {
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
        // ignore
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
  if (field !== '' || inQuotes || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }

  const cleaned = rows.map(r => r.map(c => String(c || '').trim()));
  if (cleaned.length === 0) return { header: [], records: [] };
  return { header: cleaned[0], records: cleaned.slice(1) };
}

function parseCsv(text) {
  if (typeof Utilities !== 'undefined' && Utilities.parseCsv) {
    const values = Utilities.parseCsv(text);
    if (!values || values.length < 1) return { header: [], records: [] };
    const header = values[0].map(h => String(h).trim());
    return { header, records: values.slice(1) };
  }
  return parseCsvFallback(text);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { parseCsv };
