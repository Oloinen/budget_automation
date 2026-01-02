const fs = require('fs');
const path = require('path');

// Minimal reimplementations of pure helpers from the Apps Script project
function parseCsv(text) {
  const rows = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(r => r.split(','));
  const header = rows[0].map(h => String(h).trim());
  return { header, records: rows.slice(1) };
}

function parseAmount(value) {
  const string = String(value ?? '').trim().replace(/\s+/g, '');
  if (!string) return NaN;
  return Number(string.replace(',', '.'));
}

function normaliseForMatch(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function roundValue(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function findBestRule(merchantStatementLower, rules) {
  for (const rule of rules) if (merchantStatementLower.includes(rule.pattern)) return rule;
  return null;
}

module.exports = { parseCsv, parseAmount, normaliseForMatch, roundValue, findBestRule };