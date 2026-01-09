const { parseDate } = require("../../../src/core/parsers/data");

describe("parseDate", () => {
  test("ISO dash format", () => {
    const d = parseDate("2026-01-03");
    expect(d).not.toBeNull();
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(3);
  });

  test("ISO slash format", () => {
    const d = parseDate("2026/01/03");
    expect(d).not.toBeNull();
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(3);
  });

  test("Finnish formats", () => {
    const d1 = parseDate("3.1.2026");
    expect(d1).not.toBeNull();
    expect(d1.getUTCFullYear()).toBe(2026);
    expect(d1.getUTCMonth()).toBe(0);
    expect(d1.getUTCDate()).toBe(3);

    const d2 = parseDate("03.01.2026");
    expect(d2).not.toBeNull();
    expect(d2.getUTCFullYear()).toBe(2026);
    expect(d2.getUTCMonth()).toBe(0);
    expect(d2.getUTCDate()).toBe(3);
  });

  test("invalid returns null", () => {
    expect(parseDate("nope")).toBeNull();
  });

  test("timezone neutrality", () => {
    const origTZ = process.env.TZ;
    try {
      process.env.TZ = "Europe/Helsinki";
      const d1 = parseDate("2026-01-03");

      process.env.TZ = "America/Los_Angeles";
      const d2 = parseDate("2026-01-03");

      expect(d1.getUTCFullYear()).toBe(d2.getUTCFullYear());
      expect(d1.getUTCMonth()).toBe(d2.getUTCMonth());
      expect(d1.getUTCDate()).toBe(d2.getUTCDate());
    } finally {
      process.env.TZ = origTZ;
    }
  });
});
