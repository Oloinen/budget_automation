// Parser helpers for receipts
function splitLines(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
}

function parseReceiptItemLines(lines) {
  // Extremely pragmatic:
  // - take lines that end with an amount like 2,39 or -1,00 or 2.39
  // - treat everything before the amount as the item name
  // - skip obvious junk lines (totals/vat/card/address-ish)
  const junkContains = [
    "yhteensä", "summa", "loppusumma", "subtotal", "total",
    "alv", "vat",
    "kortti", "visa", "mastercard", "debit", "credit",
    "kiitos", "thanks",
    "kassa", "kuitti", "receipt",
    "puh", "tel", "phone",
    "osoite", "address"
  ];

  const items = [];

  for (const line of lines) {
    const low = line.toLowerCase();
    if (junkContains.some(j => low.includes(j))) continue;

    // Trailing money: -0,99 or 10,00 or 10.00
    const m = line.match(/(-?\d+[,.]\d{2})\s*$/);
    if (!m) continue;

    const amount = parseAmount(m[1]);
    if (!isFinite(amount)) continue;

    const name = line.slice(0, m.index).trim();
    if (!name) continue;

    // skip lines that are basically quantities/price-per-kg with no meaningful name
    if (/^(\d+[,.]?\d*)\s*(kg|kpl|g|l|dl)\b/i.test(name)) continue;

    items.push({ line, name, amount });
  }

  return { items };
}

function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
