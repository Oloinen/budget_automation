const { roundValue } = require("../../src/utils");

describe("roundValue", () => {
  test("rounds ties correctly", () => {
    expect(roundValue(1.005)).toBe(1.01);
    expect(roundValue(2.675)).toBe(2.68);
  });

  test("negative values", () => {
    // Verify current implementation behaviour and lock expected value
    expect(roundValue(-1.235)).toBe(-1.23);
  });

  test("NaN input returns NaN", () => {
    expect(Number.isNaN(roundValue(NaN))).toBe(true);
  });
});
