const { processReceiptText } = require('../src/receipts/receipt_import');

// Provide minimal globals used by parser
global.parseAmount = s => Number(String(s).replace(',', '.'));
global.makeTxId = s => `TX:${s}`;

test.skip('processReceiptText finds item and applies auto rule', () => {
  const ocrText = `Foo Store\n01.01.2026\nCoffee 3,50\nTotal 3,50`;
  const rules = [ { pattern: 'coffee', group: 'Drinks', category: 'Coffee', mode: 'auto' } ];

  const out = processReceiptText(ocrText, {
    tz: 'UTC',
    budgetYear: 2026,
    rules,
    formatDate: (date, tz, pattern) => {
      const d = (date instanceof Date) ? date : new Date(date);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth()+1).padStart(2,'0');
      const dd = String(d.getUTCDate()).padStart(2,'0');
      if (pattern === 'yyyy') return String(yyyy);
      if (pattern === 'yyyy-MM') return `${yyyy}-${mm}`;
      if (pattern === 'yyyy-MM-dd') return `${yyyy}-${mm}-${dd}`;
      return d.toISOString();
    }
  });

  expect(out.rowsToReady.length).toBe(1);
  expect(out.rowsToStaging.length).toBe(0);
  const r = out.rowsToReady[0];
  expect(r.merchant).toBe('Foo Store');
  expect(r.group).toBe('Drinks');
});
