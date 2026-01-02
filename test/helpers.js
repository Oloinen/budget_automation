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

function parseAmount(value) {
  const string = String(value ?? '').trim().replace(/\s+/g, '');
  if (!string) return NaN;
  // Handle both '1 234,56' and '1,234.56' formats:
  if (string.includes(',') && string.includes('.')) {
    // assume commas are thousand separators -> remove commas
    return Number(string.replace(/,/g, ''));
  }
  if (string.includes(',')) return Number(string.replace(',', '.'));
  return Number(string);
}

function normaliseForMatch(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function roundValue(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function findBestRule(merchantStatementLower, rules) {
  if (!rules || rules.length === 0) return null;
  const sorted = [...rules].sort((a, b) => b.pattern.length - a.pattern.length);
  for (const rule of sorted) if (merchantStatementLower.includes(rule.pattern)) return rule;
  return null;
}

function makeTxId(dateStr, merchantRaw, amount, source) {
  // lightweight deterministic id for tests: hex of utf8 payload truncated to 24 chars
  const payload = `${dateStr}|${merchantRaw}|${amount}|${source}`;
  return Buffer.from(String(payload), 'utf8').toString('hex').slice(0, 24);
}

function makeRow(colMap, data) {
  const width = Math.max(...Object.values(colMap));
  const row = new Array(width).fill('');
  for (const [key, val] of Object.entries(data)) {
    const col = colMap[key];
    if (!col) continue;
    row[col - 1] = val;
  }
  return row;
}

function classifyAmount(amountRaw) {
  if (!isFinite(amountRaw)) return 'invalid';
  if (amountRaw > 0) return 'refund';
  if (amountRaw < 0) return 'expense';
  return 'zero';
}

module.exports = { parseCsv, parseAmount, normaliseForMatch, roundValue, findBestRule, makeTxId, makeRow, classifyAmount };