const { makeTxId, makeRow } = require('./helpers');

describe('txId and makeRow', () => {
  test('makeTxId deterministic and length', () => {
    const id1 = makeTxId('2025-01-01','merchant', 12.34, 'credit_card');
    const id2 = makeTxId('2025-01-01','merchant', 12.34, 'credit_card');
    expect(id1).toHaveLength(24);
    expect(id1).toBe(id2);
  });

  test('makeRow fills correct columns', () => {
    const colMap = { tx_id: 1, date: 2, merchant: 4 };
    const row = makeRow(colMap, { tx_id: 'x', merchant: 'M' });
    expect(row[0]).toBe('x');
    expect(row[1]).toBe('');
    expect(row[3]).toBe('M');
  });
});
