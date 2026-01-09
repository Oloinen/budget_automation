const { findBestRule } = require("../../../src/core/sheets/rules");

describe("findBestRule", () => {
  test("returns null when multiple rules match (ambiguous)", () => {
    const rules = [
      { pattern: "market", group: "M" },
      { pattern: "s-market", group: "S" },
    ];
    const needle = "s-market kauppa";
    const r = findBestRule(needle, rules);
    expect(r).toBeNull();
  });

  test("returns single unambiguous match", () => {
    const rules = [
      { pattern: "unique", group: "U" },
      { pattern: "other", group: "O" },
    ];
    const needle = "this is unique offer";
    const r = findBestRule(needle, rules);
    expect(r).not.toBeNull();
    expect(r.group).toBe("U");
  });

  test("ignores rules without pattern", () => {
    const rules = [
      { noPattern: true },
      { pattern: "", group: "X" },
      { pattern: "shop", group: "Shop" },
    ];
    const r = findBestRule("my shop here", rules);
    expect(r).not.toBeNull();
    expect(r.group).toBe("Shop");
  });

  test("returns null if no match", () => {
    const rules = [{ pattern: "foo" }, { pattern: "bar" }];
    expect(findBestRule("nothing here", rules)).toBeNull();
  });
});
