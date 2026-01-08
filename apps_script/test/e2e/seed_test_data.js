/**
 * Test Data Seeding Utilities
 * 
 * Helper functions to seed test data into spreadsheets for E2E testing.
 */

/**
 * Seeds basic test data (categories and merchant rules)
 */
async function seedTestData(sheets, spreadsheetId) {
  console.log('🌱 Seeding test data (categories, rules)...');
  
  // Seed categories
  const categories = [
    ['group', 'category', 'subcategory', 'active'],
    ['Food', 'Groceries', 'Supermarket', true],
    ['Food', 'Restaurants', 'Dining Out', true],
    ['Transport', 'Gas', 'Fuel', true],
    ['Shopping', 'Online', 'E-commerce', true],
  ];
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'categories!A1:D5',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: categories }
  });
  
  // Seed merchant rules
  const merchantRules = [
    ['merchant', 'group', 'category', 'mode'],
    ['GROCERY STORE', 'Food', 'Groceries', 'auto'],
    ['GAS STATION', 'Transport', 'Gas', 'auto'],
    ['AMAZON', 'Shopping', 'Online', 'review'],
  ];
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'merchant_rules!A1:D4',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: merchantRules }
  });
  
  console.log('✅ Test data seeded\n');
}

/**
 * Seeds credit_card_staging entries for merchant approval testing
 */
async function seedStagingEntries(sheets, spreadsheetId) {
  console.log('🌱 Seeding credit_card_staging entries for approval test...');
  
  // Add manually categorized staging entries
  const stagingEntries = [
    ['tx_id', 'date', 'month', 'merchant', 'amount', 'group', 'category', 'notes', 'source'],
    ['cc-test-001', '2026-01-05', '2026-01', 'TEST COFFEE SHOP', -4.50, 'Food', 'Restaurants', 'Manual categorization', 'credit_card'],
    ['cc-test-002', '2026-01-06', '2026-01', 'TEST BOOKSTORE', -25.00, 'Shopping', 'Online', 'Manual categorization', 'credit_card'],
  ];
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'credit_card_staging!A1:I3',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: stagingEntries }
  });
  
  console.log('✅ Staging entries seeded\n');
}

/**
 * Seeds unknown_merchants for unknown merchants approval testing
 */
async function seedUnknownMerchants(sheets, spreadsheetId) {
  console.log('🌱 Seeding unknown_merchants for approval test...');
  
  // Add unknown merchants with rules to create
  const unknownMerchants = [
    ['merchant', 'first_seen', 'last_seen', 'count', 'group', 'category', 'mode', 'notes'],
    ['NEW RESTAURANT', '2026-01-01', '2026-01-05', 3, 'Food', 'Restaurants', 'auto', 'Ready to approve'],
    ['UNKNOWN SHOP', '2026-01-02', '2026-01-04', 2, 'Shopping', 'Online', 'review', 'Ready to approve'],
  ];
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'unknown_merchants!A1:H3',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: unknownMerchants }
  });
  
  console.log('✅ Unknown merchants seeded\n');
}

/**
 * Seeds receipt_staging entries for item approval testing
 */
async function seedReceiptStagingEntries(sheets, spreadsheetId) {
  console.log('🌱 Seeding receipt_staging entries for approval test...');
  
  // Add manually categorized receipt items
  const receiptEntries = [
    ['tx_id', 'date', 'month', 'item_description', 'amount', 'group', 'category', 'notes', 'source', 'receipt_id'],
    ['rcpt-test-001', '2026-01-05', '2026-01', 'Coffee and pastry', -8.50, 'Food', 'Restaurants', 'Manual categorization', 'receipt', 'receipt_001'],
    ['rcpt-test-002', '2026-01-06', '2026-01', 'Office supplies', -32.00, 'Shopping', 'Online', 'Manual categorization', 'receipt', 'receipt_002'],
  ];
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'receipt_staging!A1:J3',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: receiptEntries }
  });
  
  console.log('✅ Receipt staging entries seeded\n');
}

/**
 * Seeds unknown_items for item rules approval testing
 */
async function seedUnknownItems(sheets, spreadsheetId) {
  console.log('🌱 Seeding unknown_items for approval test...');
  
  // Add unknown items with rules to create
  const unknownItems = [
    ['item_pattern', 'first_seen', 'last_seen', 'count', 'group', 'category', 'mode', 'notes'],
    ['CAFE LATTE', '2026-01-01', '2026-01-05', 5, 'Food', 'Restaurants', 'auto', 'Ready to approve'],
    ['PRINTER PAPER', '2026-01-02', '2026-01-04', 3, 'Shopping', 'Online', 'review', 'Ready to approve'],
  ];
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'unknown_items!A1:H3',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: unknownItems }
  });
  
  console.log('✅ Unknown items seeded\n');
}

/**
 * Seeds item_rules for receipt import testing
 */
async function seedItemRules(sheets, spreadsheetId) {
  console.log('🌱 Seeding item_rules for receipt import test...');
  
  // Add item rules for matching receipt items
  const itemRules = [
    ['pattern', 'group', 'category', 'mode'],
    ['COFFEE', 'Food', 'Restaurants', 'auto'],
    ['SANDWICH', 'Food', 'Restaurants', 'auto'],
    ['NOTEBOOK', 'Shopping', 'Online', 'review'],
  ];
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'item_rules!A1:D4',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: itemRules }
  });
  
  console.log('✅ Item rules seeded\n');
}

module.exports = {
  seedTestData,
  seedStagingEntries,
  seedUnknownMerchants,
  seedReceiptStagingEntries,
  seedUnknownItems,
  seedItemRules,
};
