const { getHeaders, readColumnValues, appendRows, getTabByName } = require('../../src/utils');

describe('sheet utils', () => {
  describe('getHeaders', () => {
    test('trims header strings, ignores empty headers, returns 1-based indexes', () => {
      const tab = {
        getLastColumn: () => 3,
        getRange: (r, c, nr, nc) => ({ getValues: () => [[" tx_id ", "", "amount"]] })
      };

      const map = getHeaders(tab);
      expect(map).toEqual({ tx_id: 1, amount: 3 });
    });
  });

  describe('readColumnValues', () => {
    test('returns [] if header missing', () => {
      const tab = {
        getLastColumn: () => 1,
        getRange: (r, c, nr, nc) => ({ getValues: () => [["only"]] }),
        getLastRow: () => 1
      };
      expect(readColumnValues(tab, 'nope')).toEqual([]);
    });

    test('returns [] if only header row exists', () => {
      const tab = {
        getLastColumn: () => 2,
        getRange: (r, c, nr, nc) => ({ getValues: () => [["a", "b"]] }),
        getLastRow: () => 1
      };
      expect(readColumnValues(tab, 'a')).toEqual([]);
    });

    test('returns column values excluding header and flattens correctly', () => {
      // Header row + 3 data rows in col 2
      const calls = [];
      const tab = {
        getLastColumn: () => 2,
        getRange: (r, c, nr, nc) => {
          calls.push({ r, c, nr, nc });
          if (r === 1) return { getValues: () => [["h1", "h2"]] };
          // data range starting at row 2
          return { getValues: () => [["v1"], ["v2"], ["v3"]] };
        },
        getLastRow: () => 4
      };

      const values = readColumnValues(tab, 'h2');
      expect(values).toEqual(["v1", "v2", "v3"]);
      // ensure getRange was called for header and for data
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('appendRows', () => {
    test('does nothing when rows empty', () => {
      let called = false;
      const tab = {
        getLastRow: () => { called = true; return 1; },
        getRange: () => { throw new Error('should not be called'); }
      };
      appendRows(tab, []);
      // appendRows returns early; getLastRow should not be used and getRange must not be called
      expect(called).toBe(false);
    });

    test('appends at lastRow + 1 and writes correct dimensions', () => {
      const ops = [];
      const tab = {
        getLastRow: () => 5,
        getRange: (startRow, startCol, numRows, numCols) => ({
          setValues: (rows) => ops.push({ startRow, startCol, numRows, numCols, rows })
        })
      };

      const rows = [[1, 2, 3], [4, 5, 6]];
      appendRows(tab, rows);
      expect(ops.length).toBe(1);
      expect(ops[0].startRow).toBe(6);
      expect(ops[0].startCol).toBe(1);
      expect(ops[0].numRows).toBe(2);
      expect(ops[0].numCols).toBe(3);
      expect(ops[0].rows).toBe(rows);
    });
  });

  describe('getTabByName', () => {
    test('returns tab if exists', () => {
      const tab = {};
      const sheet = { getSheetByName: (name) => name === 'OK' ? tab : null };
      expect(getTabByName(sheet, 'OK')).toBe(tab);
    });

    test('throws with clear message if missing', () => {
      const sheet = { getSheetByName: () => null };
      expect(() => getTabByName(sheet, 'MISSING')).toThrow(/Missing tab: MISSING/);
    });
  });
});
