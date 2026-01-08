const fs = require("fs");
const path = require("path");
const { adapter } = require("./mocks/tableMock");

// This is an example test showing how to inject the mock adapter into your importer.
// The real importer should be refactored to accept an `adapter` parameter; this test
// uses `test.skip` until importers are updated to accept DI.

test.skip("example: parse CSV and write to staging using mock adapter", async () => {
  const csv = fs.readFileSync(
    path.join(__dirname, "fixtures", "credit_card_csvs", "sample.csv"),
    "utf8",
  );
  const mock = adapter;

  // Example usage assuming importer exposes `importCreditCard({ csvText, spreadsheetId, adapter })`
  const importer = require("../src/credit_card/credit_card_import");
  if (typeof importer.importCreditCard !== "function") {
    throw new Error("importer.importCreditCard not found; please refactor to accept adapter");
  }

  await importer.importCreditCard({ csvText: csv, spreadsheetId: "TST", adapter: mock });

  // Assert that rows were appended to staging
  expect(mock.state.appended.length).toBeGreaterThan(0);
  const firstAppend = mock.state.appended[0];
  expect(firstAppend.range).toBeDefined();
  expect(firstAppend.rows.length).toBeGreaterThan(0);
});
