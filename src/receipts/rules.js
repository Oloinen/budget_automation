// Merchant/item rules loader and matcher
function loadItemRules(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h).trim());
  const iPattern = headers.indexOf("pattern");
  const iGroup = headers.indexOf("group");
  const iCategory = headers.indexOf("category");
  const iMode = headers.indexOf("mode");

  if (iPattern === -1 || iGroup === -1 || iCategory === -1 || iMode === -1) {
    throw new Error(`item_rules must have headers: pattern, group, category, mode`);
  }

  const rules = [];
  for (const r of values.slice(1)) {
    const patRaw = String(r[iPattern] || "").trim();
    if (!patRaw) continue;

    const pattern = normaliseForMatch(patRaw);
    const group = String(r[iGroup] || "").trim();
    const category = String(r[iCategory] || "").trim();
    const mode = String(r[iMode] || "").trim().toLowerCase() || "auto";

    rules.push({ pattern, group, category, mode });
  }

  rules.sort((a, b) => b.pattern.length - a.pattern.length);
  return rules;
}

function findBestRule(itemLower, rules) {
  for (const r of rules) {
    if (itemLower.includes(r.pattern)) return r;
  }
  return null;
}
