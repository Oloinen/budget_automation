const { makeTxId } = require('../src/utils');

describe('makeTxId', () => {
  test('deterministic for same payload', () => {
    const p = 'user:123|2026-01-03|10.00';
    const a = makeTxId(p);
    const b = makeTxId(p);
    expect(a).toBe(b);
    expect(typeof a).toBe('string');
    expect(a.length).toBe(24);
  });

  test('different payloads produce different ids', () => {
    const a = makeTxId('payload-one');
    const b = makeTxId('payload-two');
    expect(typeof a).toBe('string');
    expect(typeof b).toBe('string');
    expect(a.length).toBe(24);
    expect(b.length).toBe(24);
    expect(a).not.toBe(b);
  });
});
