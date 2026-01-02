const { parseCsv, parseAmount, roundValue, normaliseForMatch, makeTxId, classifyAmount } = require('./helpers');

describe('amount and refund cases', () => {
  test('quoted merchant trailing spaces parsed and normalised', () => {
    const text = 'Date of payment,Location of purchase,Transaction amount\n2025-12-12,"S-MARKET TULLINPUOMI ",-0.99\n';
    const { header, records } = parseCsv(text);
    expect(records[0][1]).toBe('S-MARKET TULLINPUOMI');
    expect(normaliseForMatch(records[0][1])).toBe('s-market tullinpuomi');
  });

  test('refunds classified and staged', () => {
    expect(classifyAmount(12.34)).toBe('refund');
    expect(classifyAmount(-5)).toBe('expense');
  });

  test('negative rounding, abs stored', () => {
    const amt = parseAmount('-8.505');
    expect(amt).toBeCloseTo(-8.505);
    const absRounded = roundValue(Math.abs(amt));
    expect(absRounded).toBe(8.51);
  });

  test('duplicate txId detection (idempotency)', () => {
    const id1 = makeTxId('2025-12-12','Merchant', 2.5, 'credit_card');
    const id2 = makeTxId('2025-12-12','Merchant', 2.5, 'credit_card');
    expect(id1).toBe(id2);
  });

  test('missing merchant or amount leads to invalid parse', () => {
    const text = 'Date of payment,Location of purchase,Transaction amount\n2025-12-12,, -\n';
    const { records } = parseCsv(text);
    expect(records[0][1]).toBe('');
    const amt = parseAmount(records[0][2]);
    expect(Number.isNaN(amt)).toBe(true);
  });

  test('amount formatting variants', () => {
    expect(parseAmount('1 234,56')).toBeCloseTo(1234.56);
    expect(parseAmount('1,234.56')).toBeCloseTo(1234.56);
  });
});
