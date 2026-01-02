function parseCsv(text) {
  const values = Utilities.parseCsv(text);
  if (!values || values.length < 2) return { header: [], records: [] };
  const header = values[0].map(h => String(h).trim());
  return { header, records: values.slice(1) };
}

function roundValue(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
