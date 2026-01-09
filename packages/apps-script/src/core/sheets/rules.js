/**
 * Rule loading and matching utilities
 */

const { normaliseForMatch } = require("../parsers/data");

function findBestRule(needle, rules) {
  if (!rules || rules.length === 0) return null;
  const n = String(needle || "");
  const matches = [];
  for (const r of rules) {
    if (!r || !r.pattern) continue;
    const p = String(r.pattern);
    if (p && n.includes(p)) matches.push(r);
  }
  if (matches.length === 1) return matches[0];
  return null;
}

/**
 * Load rules from a sheet with flexible column names
 * Patterns are always normalized for consistent matching.
 * @param {Sheet} tab - The sheet to read from
 * @param {string} patternColumn - Name of the column containing the pattern (e.g., "merchant" or "pattern")
 * @param {Object} options - Optional configuration
 * @param {boolean} options.sortByLength - Whether to sort rules by pattern length descending (default: false)
 * @returns {Array} Array of rule objects with {pattern, group, category, mode}
 */
function loadRules(tab, patternColumn, options = {}) {
  const { sortByLength = false } = options;

  const values = tab.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map((h) => String(h).trim());
  const iPattern = headers.indexOf(patternColumn);
  const iGroup = headers.indexOf("group");
  const iCategory = headers.indexOf("category");
  const iMode = headers.indexOf("mode");

  if (iPattern === -1 || iGroup === -1 || iCategory === -1 || iMode === -1) {
    throw new Error(`Rules sheet must have headers: ${patternColumn}, group, category, mode`);
  }

  const rules = [];
  for (const value of values.slice(1)) {
    const rawPattern = String(value[iPattern] || "").trim();
    if (!rawPattern) continue;

    const pattern = normaliseForMatch(rawPattern);
    const group = String(value[iGroup] || "").trim();
    const category = String(value[iCategory] || "").trim();
    const mode =
      String(value[iMode] || "")
        .trim()
        .toLowerCase() || "auto";

    rules.push({ pattern, group, category, mode });
  }

  if (sortByLength) {
    rules.sort((a, b) => b.pattern.length - a.pattern.length);
  }

  return rules;
}

module.exports = {
  findBestRule,
  loadRules,
};
