const { processCreditCardRecords } = require("../src/credit_card/credit_card_import");

test("processCreditCardRecords maps expenses to ready when rule auto", () => {
  const records = [{ dateRaw: "2026-01-02", merchantRaw: "Foo Store", amountRaw: -12.34 }];

  const rules = [
    { merchant: "foo", group: "Groceries", category: "Food", mode: "auto", pattern: "foo" },
  ];

  const opts = {
    tz: "UTC",
    budgetYear: 2026,
    rules,
    parseDate: (s) => new Date(s + "T00:00:00Z"),
    parseAmount: (v) => (typeof v === "number" ? v : Number(String(v).replace(/,/g, "."))),
    makeTxId: (s) => `TX:${s}`,
    normaliseForMatch: (s) => String(s || "").toLowerCase(),
    findBestRule: (merchantLower, rulesList) =>
      rulesList.find((r) => merchantLower.includes(r.pattern)),
    roundValue: (x) => Math.round(x * 100) / 100,
    formatDate: (date, tz, pattern) => {
      const d = new Date(date);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      if (pattern === "yyyy") return String(yyyy);
      if (pattern === "yyyy-MM") return `${yyyy}-${mm}`;
      if (pattern === "yyyy-MM-dd") return `${yyyy}-${mm}-${dd}`;
      return d.toISOString();
    },
  };

  const out = processCreditCardRecords(records, opts);
  expect(out.rowsToReady.length).toBe(1);
  expect(out.rowsToStaging.length).toBe(0);
  const row = out.rowsToReady[0];
  expect(row.merchant).toBe("Foo Store");
  expect(row.group).toBe("Groceries");
});
