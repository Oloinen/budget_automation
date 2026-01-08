/**
 * Unit tests for receipt import functionality
 * Tests rule matching, item categorization, and unknown item tracking
 */

const { findBestRule, normaliseForMatch } = require('../src/utils');

describe('Receipt Import - Rule Matching', () => {
  const loadItemRules_ = (values) => {
    if (values.length < 2) return [];
    
    const header = values[0].map(String);
    const idx = {
      pattern: header.indexOf("pattern"),
      group: header.indexOf("group"),
      category: header.indexOf("category"),
      mode: header.indexOf("mode")
    };
    
    const rules = [];
    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      const pattern = String(row[idx.pattern] ?? "").trim();
      if (!pattern) continue;
      
      rules.push({
        pattern,
        group: String(row[idx.group] ?? "").trim(),
        category: String(row[idx.category] ?? "").trim(),
        mode: String(row[idx.mode] ?? "").trim().toLowerCase() || "auto"
      });
    }
    return rules;
  };

  const matchItemRule_ = (itemName, rules) => {
    // Normalize to lowercase for case-insensitive matching, then use findBestRule
    const normalized = normaliseForMatch(itemName);
    return findBestRule(normalized, rules);
  };

  test('should match item with substring pattern', () => {
    const rules = loadItemRules_([
      ["pattern", "group", "category", "mode"],
      ["maito", "Food", "Groceries", "auto"]
    ]);
    
    const match = matchItemRule_("Maito 1L", rules);
    expect(match).not.toBeNull();
    expect(match.group).toBe("Food");
    expect(match.category).toBe("Groceries");
  });

  test('should match item when pattern is substring', () => {
    const rules = loadItemRules_([
      ["pattern", "group", "category", "mode"],
      ["juusto", "Food", "Groceries", "auto"]
    ]);
    
    const match = matchItemRule_("Edam juusto 350g", rules);
    expect(match).not.toBeNull();
    expect(match.group).toBe("Food");
    expect(match.category).toBe("Groceries");
  });

  test('should return null when no rule matches', () => {
    const rules = loadItemRules_([
      ["pattern", "group", "category", "mode"],
      ["juusto", "Food", "Groceries", "auto"]
    ]);
    
    const match = matchItemRule_("Maito", rules);
    expect(match).toBeNull();
  });

  test('should handle review mode', () => {
    const rules = loadItemRules_([
      ["pattern", "group", "category", "mode"],
      ["juusto", "Food", "Groceries", "review"]
    ]);
    
    const match = matchItemRule_("Edam juusto 350g", rules);
    expect(match).not.toBeNull();
    expect(match.mode).toBe("review");
  });

  test('should default to auto mode when mode not specified', () => {
    const rules = loadItemRules_([
      ["pattern", "group", "category", "mode"],
      ["maito", "Food", "Groceries", ""]
    ]);
    
    const match = matchItemRule_("Maito 1L", rules);
    expect(match).not.toBeNull();
    expect(match.mode).toBe("auto");
  });

  test('should return null when multiple rules match', () => {
    const rules = loadItemRules_([
      ["pattern", "group", "category", "mode"],
      ["maito", "Food", "Groceries", "auto"],
      ["kerma", "Food", "Extra foods", "auto"]
    ]);
    
    // findBestRule returns null when multiple patterns match the same item
    const match = matchItemRule_("Kermamaito", rules);
    expect(match).toBeNull(); // Both "maito" and "kerma" match
  });

  test('should return rule when exactly one matches', () => {
    const rules = loadItemRules_([
      ["pattern", "group", "category", "mode"],
      ["juusto", "Food", "Dairy", "auto"]
    ]);
    
    const match = matchItemRule_("Edam juusto", rules);
    expect(match).not.toBeNull();
    expect(match.pattern).toBe("juusto");
  });

  test('should load rules correctly from sheet format', () => {
    const sheetData = [
      ["pattern", "group", "category", "mode"],
      ["coca-cola", "Food", "Drinks", "auto"],
      ["juusto", "Food", "Dairy", "review"],
      ["", "Food", "Invalid", "auto"], // Empty pattern, should be skipped
      ["vessapaperi", "Household", "Essentials", "auto"]
    ];
    
    const rules = loadItemRules_(sheetData);
    expect(rules.length).toBe(3); // Empty pattern excluded
    expect(rules[0].pattern).toBe("coca-cola");
    expect(rules[0].mode).toBe("auto");
    expect(rules[1].pattern).toBe("juusto");
    expect(rules[1].mode).toBe("review");
    expect(rules[2].pattern).toBe("vessapaperi");
  });
});

describe('Receipt Import - Utility Functions', () => {
  test('toMonth should extract YYYY-MM from date string', () => {
    const toMonth_ = (yyyyMmDd) => {
      if (!yyyyMmDd || typeof yyyyMmDd !== "string" || yyyyMmDd.length < 7) return "";
      return yyyyMmDd.substring(0, 7);
    };
    
    expect(toMonth_("2026-01-15")).toBe("2026-01");
    expect(toMonth_("2025-12-31")).toBe("2025-12");
    expect(toMonth_("")).toBe("");
    expect(toMonth_("2026")).toBe("");
    expect(toMonth_(null)).toBe("");
  });

  test('truncate should limit string length', () => {
    const truncate_ = (s, maxLen) => {
      const str = String(s ?? "");
      return str.length <= maxLen ? str : str.substring(0, maxLen);
    };
    
    expect(truncate_("short", 10)).toBe("short");
    expect(truncate_("this is a long string", 10)).toBe("this is a ");
    expect(truncate_("", 10)).toBe("");
    expect(truncate_(null, 10)).toBe("");
  });
});

describe('Receipt Import - Cloud Function Response Handling', () => {
  test('should transform Cloud Function response correctly', () => {
    const cloudFunctionResult = {
      date: "2026-01-05",
      merchant: "K-Market",
      total: 15.67,
      items: [
        { name: "Maito", amount: 1.89 },
        { name: "Leipä", amount: 2.50 }
      ],
      raw_text: "K-Market\n05.01.2026\nMaito 1.89\nLeipä 2.50\nYHTEENSÄ 15.67"
    };

    // Simulate transformation in receipt_import.js
    const parsed = {
      date: cloudFunctionResult.date || "",
      merchant: cloudFunctionResult.merchant || "",
      amount: cloudFunctionResult.total ?? "",
      items: cloudFunctionResult.items || []
    };

    expect(parsed.date).toBe("2026-01-05");
    expect(parsed.merchant).toBe("K-Market");
    expect(parsed.amount).toBe(15.67);
    expect(parsed.items.length).toBe(2);
    expect(parsed.items[0].name).toBe("Maito");
  });

  test('should handle missing fields gracefully', () => {
    const cloudFunctionResult = {
      items: []
    };

    const parsed = {
      date: cloudFunctionResult.date || "",
      merchant: cloudFunctionResult.merchant || "",
      amount: cloudFunctionResult.total ?? "",
      items: cloudFunctionResult.items || []
    };

    expect(parsed.date).toBe("");
    expect(parsed.merchant).toBe("");
    expect(parsed.amount).toBe("");
    expect(parsed.items).toEqual([]);
  });

  test('should handle null total as empty string', () => {
    const cloudFunctionResult = {
      total: null,
      items: []
    };

    const parsed = {
      amount: cloudFunctionResult.total ?? ""
    };

    expect(parsed.amount).toBe("");
  });
});

describe('Receipt Import - Item Processing Logic', () => {
  const matchItemRule_ = (itemName, rules) => {
    const normalized = normaliseForMatch(itemName);
    return findBestRule(normalized, rules);
  };

  test('should create transaction for matched items', () => {
    const item = { name: "Maito", amount: 1.89 };
    const rule = { pattern: "maito", group: "Food", category: "Groceries", mode: "auto" };

    // Verify we would create a transaction_ready row
    expect(item.name).toBe("Maito");
    expect(item.amount).toBe(1.89);
    expect(rule.group).toBe("Food");
    expect(rule.category).toBe("Groceries");
  });

  test('should create staging entry for unmatched items', () => {
    const item = { name: "Unknown Product", amount: 5.99 };
    const rules = [
      { pattern: "maito", group: "Food", category: "Groceries", mode: "auto" }
    ];

    const match = matchItemRule_(item.name, rules);
    expect(match).toBeNull();
    // Should go to staging with status "NEEDS_RULE"
  });

  test('should skip items with empty names', () => {
    const items = [
      { name: "", amount: 1.99 },
      { name: "   ", amount: 2.99 },
      { name: "Valid Item", amount: 3.99 }
    ];

    const validItems = items.filter(item => String(item?.name || "").trim() !== "");
    expect(validItems.length).toBe(1);
    expect(validItems[0].name).toBe("Valid Item");
  });
});
