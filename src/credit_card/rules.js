function loadMerchantRules(tab) {
  const values = tab.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h).trim());
  const iMerchant = headers.indexOf("merchant");
  const iGroup = headers.indexOf("group");
  const iCategory = headers.indexOf("category");
  const iMode = headers.indexOf("mode");

  if (iMerchant === -1 || iGroup === -1 || iCategory === -1 || iMode === -1) {
    throw new Error(`merchant_rules must have headers: merchant, group, category, mode`);
  }

  const rules = [];
  for (const value of values.slice(1)) {
    const merchantRaw = String(value[iMerchant] || "").trim();
    if (!merchantRaw) continue;

    const pattern = normaliseForMatch(merchantRaw);
    const group = String(value[iGroup] || "").trim();
    const category = String(value[iCategory] || "").trim();
    const mode = String(value[iMode] || "").trim().toLowerCase() || "auto";

    rules.push({ pattern, group, category, mode });
  }

  rules.sort((a, b) => b.pattern.length - a.pattern.length);
  return rules;
}

function findBestRule(merchantStatementLower, rules) {
  for (const rule of rules) {
    if (merchantStatementLower.includes(rule.pattern)) return rule;
  }
  return null;
}

function loadRulesArrayFromRulesSheet() {
  const rulesSs = SpreadsheetApp.openById(RULES_SHEET_ID);
  const sheet = rulesSs.getSheetByName(RULES_TAB_NAME);
  if (!sheet) throw new Error(`Rules sheet missing tab: ${RULES_TAB_NAME}`);
  return loadMerchantRules(sheet);
}
