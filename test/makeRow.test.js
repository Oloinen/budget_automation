const { makeRow } = require('../src/utils');

describe('makeRow', () => {
  test('fills correct columns and leaves others blank', () => {
    const colMap = { tx_id: 1, date: 2, amount: 3 };
    const row = makeRow(colMap, { tx_id: 'T1', amount: 12.3 });
    expect(row).toEqual(['T1', '', 12.3]);
  });

  test('ignores keys not present in colMap', () => {
    const colMap = { a: 1, b: 2 };
    const row = makeRow(colMap, { a: 'X', b: 'Y', extra: 'Z' });
    expect(row).toEqual(['X', 'Y']);
  });

  test('handles sparse colMap (missing middle columns)', () => {
    const colMap = { first: 1, third: 3 };
    const row = makeRow(colMap, { first: 'F', third: 'T' });
    expect(row).toEqual(['F', '', 'T']);
  });
});
