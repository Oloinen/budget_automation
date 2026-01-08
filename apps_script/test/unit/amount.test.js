const { parseAmount } = require("../../src/utils");

describe("parseAmount", () => {
  test("basic formats", () => {
    expect(parseAmount("10")).toBe(10);
    expect(parseAmount("10.50")).toBeCloseTo(10.5);
    expect(parseAmount("10,50")).toBeCloseTo(10.5);
  });

  test("spaces", () => {
    expect(parseAmount("1 234,56")).toBeCloseTo(1234.56);
  });

  test("both comma and dot", () => {
    expect(parseAmount("1,234.56")).toBeCloseTo(1234.56);
    expect(parseAmount("1.234,56")).toBeCloseTo(1234.56);
  });

  test("negatives", () => {
    expect(parseAmount("-0.99")).toBeCloseTo(-0.99);
    expect(parseAmount("-0,99")).toBeCloseTo(-0.99);
  });

  test("empty and invalid", () => {
    expect(Number.isNaN(parseAmount(""))).toBe(true);
    expect(Number.isNaN(parseAmount("abc"))).toBe(true);
  });
});
