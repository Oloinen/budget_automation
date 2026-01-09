/**
 * Data parsing utilities - amounts, dates, normalization
 */

function parseAmount(value) {
  const string = String(value ?? "")
    .trim()
    .replace(/\s+/g, "");
  if (!string) return NaN;
  // Handle both '1 234,56' and '1,234.56' formats:
  if (string.includes(",") && string.includes(".")) {
    // Decide which separator is the decimal based on which occurs last.
    const lastDot = string.lastIndexOf(".");
    const lastComma = string.lastIndexOf(",");
    if (lastComma > lastDot) {
      // comma is decimal, dots are thousand separators: remove dots, replace comma with dot
      return Number(string.replace(/\./g, "").replace(",", "."));
    } else {
      // dot is decimal, commas are thousand separators: remove commas
      return Number(string.replace(/,/g, ""));
    }
  }
  if (string.includes(",")) return Number(string.replace(",", "."));
  return Number(string);
}

function parseDate(dateString) {
  const string = String(dateString).trim();

  // YYYY-MM-DD or YYYY/MM/DD
  let m = string.match(new RegExp("^(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})$"));
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));

  // DD.MM.YYYY
  m = string.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));

  const d = new Date(string);
  return isNaN(d.getTime()) ? null : d;
}

function normaliseForMatch(string) {
  // Keep hyphens. Just lowercase + collapse spaces.
  return String(string || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

module.exports = {
  parseAmount,
  parseDate,
  normaliseForMatch,
};
