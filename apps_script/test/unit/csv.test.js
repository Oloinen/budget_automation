const { parseCsv } = require("../../src/csv");

describe("CSV parser edge cases", () => {
  test("quoted fields with commas", () => {
    const text = 'a,b,c\n"1,one",2,3\n"4,"quoted"",5,6\n';
    const { header, records } = parseCsv(text);
    expect(header).toEqual(["a", "b", "c"]);
    expect(records[0][0]).toBe("1,one");
    expect(records[1][0]).toBe("4,quoted");
  });

  test("empty fields and trimming", () => {
    const text = "x,y,z\n  a  , ,c\n";
    const { records } = parseCsv(text);
    expect(records[0][0]).toBe("a");
    expect(records[0][1]).toBe("");
    expect(records[0][2]).toBe("c");
  });
});
