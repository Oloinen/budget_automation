const path = require('path');
const { extractPdfRaw } = require('../../src/receipts/pdf_io');

describe('pdf_io extractor', () => {
  jest.setTimeout(20000);

  test('extracts text and items from fixture PDF (direct)', async () => {
    const fixture = path.join(__dirname, '..', 'fixtures', 'receipt.pdf');
    const out = await extractPdfRaw(fixture);

    expect(out).toBeDefined();
    expect(out.numPages).toBeGreaterThanOrEqual(1);
    expect(typeof out.text).toBe('string');
    expect(out.text.length).toBeGreaterThan(10);

    // basic content checks
    const lower = out.text.toLowerCase();
    expect(lower).toEqual(expect.stringContaining('k-market') || expect.stringContaining('kmarket') || expect.stringContaining('k supermarket'));
    expect(lower).toEqual(expect.stringContaining('yhteens') || expect.stringContaining('yhteensä') || expect.stringContaining('yhteensa'));

    expect(Array.isArray(out.pages)).toBe(true);
    expect(out.pages.length).toBe(out.numPages);
    expect(out.pages[0].items.length).toBeGreaterThan(0);

    const joined = out.pages[0].items.map(i => i.str).join(' ');
    expect(joined.toLowerCase()).toEqual(expect.stringContaining('fanta') || expect.stringContaining('pullopantti') || expect.stringContaining('yhteens'));
  });
});
