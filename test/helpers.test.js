const { parseCsv, parseAmount, normaliseForMatch, roundValue, findBestRule } = require('./helpers');

describe('helpers', () => {
  test('parseCsv basic', () => {
    const text = 'a,b,c\n1,2,3\n4,5,6\n';
    const { header, records } = parseCsv(text);
    expect(header).toEqual(['a','b','c']);
    expect(records.length).toBe(2);
  });

  test('parseAmount formats', () => {
    expect(parseAmount('1,23')).toBeCloseTo(1.23);
    expect(parseAmount('  -45 ')).toBe(-45);
    expect(Number.isNaN(parseAmount(''))).toBe(true);
  });

  test('normaliseForMatch', () => {
    expect(normaliseForMatch('  Hello  World ')).toBe('hello world');
    expect(normaliseForMatch('S-Market')).toBe('s-market');
  });

  test('roundValue', () => {
    expect(roundValue(1.005)).toBe(1.01);
    expect(roundValue(1.234)).toBe(1.23);
  });

  test('findBestRule longest first', () => {
    const rules = [{pattern: 'a', group:1}, {pattern: 'longest', group:2}];
    expect(findBestRule('this has longest match', rules).group).toBe(2);
    expect(findBestRule('contains a', rules).group).toBe(1);
  });
});
