const { makeMockAdapter } = require('./sheetsAdapterMock');

const adapter = makeMockAdapter({
  transactions_ready: [],
  credit_card_staging: [],
  unknown_merchants: [],
  merchant_rules: [
    ["s-market","Food","Groceries","skip"],
    ["JIAHE OY","Food","Groceries","auto"],
    ["niskane","","","skip"],
    ["VR.FI","Travel","Essential","review"],
    ["FIDA","Clothing","Extra","auto"],
    ["alepa","Food","Groceries","skip"],
    ["HESBURGER","Food","Extra foods","auto"]
  ],
  credit_card_skipped: [],
  receipt_staging: [],
  receipt_files: [],
  item_rules: [
    ["kermajäät","Food","Extra foods","auto"],
    ["suolapähkinä","Food","Extra foods","auto"],
    ["Fanta sitruuna zero","Food","Groceries","auto"],
    ["Pullopantti","Food","Groceries","review"],
    ["cola","Social","Gifts & Hosting","auto"],
    ["kurkku","Food","Groceries","auto"],
    ["vessapaperi","Household","Essentials","auto"],
    ["hammasharja","Personal care","Essentials","auto"]
  ],
  unknown_items: []
});

module.exports = { adapter };
