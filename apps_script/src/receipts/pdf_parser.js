function parseKMarketReceiptText(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);

  const merchant = lines[0] || "";

  // Date/time line example: "K003 M062265/9949 15.55 4.1.2026"
  let date = "";
  for (const l of lines.slice(0, 15)) {
    const m = l.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
    if (m) {
      const dd = m[1].padStart(2, "0");
      const mm = m[2].padStart(2, "0");
      const yyyy = m[3];
      date = `${yyyy}-${mm}-${dd}`;
      break;
    }
  }

  // Total line: "YHTEENSÄ 11,62"
  let total = null;
  for (const l of lines) {
    const m = l.match(/^YHTEENSÄ\s+(\d{1,4}[.,]\d{2})\b/i);
    if (m) {
      total = Number(m[1].replace(",", "."));
      break;
    }
  }

  // Items: from after header until separator or YHTEENSÄ
  const items = [];
  const priceAtEnd = /(\d{1,4}[.,]\d{2})\s*$/;

  // Find first plausible item line index: after date line
  let startIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    if (/\b\d{1,2}\.\d{1,2}\.\d{4}\b/.test(lines[i])) {
      startIdx = i + 1;
      break;
    }
  }

  for (let i = startIdx; i < lines.length; i++) {
    const l = lines[i];
    if (/^-{5,}$/.test(l)) break;
    if (/^YHTEENSÄ\b/i.test(l)) break;

    const pm = l.match(priceAtEnd);
    if (!pm) continue;

    const amount = Number(pm[1].replace(",", "."));
    const name = l.replace(priceAtEnd, "").trim();

    // Basic guard: ignore payment/VAT lines even if they end in a number
    if (/^(CARD TRANSACTION|ALV|KORTTI:|PLUSSA|Payee\/business:)/i.test(name)) continue;
    if (!name) continue;

    items.push({ name, amount });
  }

  return { merchant, date, amount: total, items, rawText };
}