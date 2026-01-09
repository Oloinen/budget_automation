// Lightweight mock of googleapis for local dry-run E2E tests
const mockGoogle = {
  auth: {
    GoogleAuth: class {
      constructor() {}
      async getClient() {
        return {}; // dummy auth client
      }
    },
  },
  sheets: ({ version, auth } = {}) => ({
    spreadsheets: {
      values: {
        get: async (opts) => ({ data: { values: [] } }),
        update: async (opts) => ({ data: {} }),
        append: async (opts) => ({ data: {} }),
      },
    },
  }),
  drive: ({ version, auth } = {}) => ({
    files: {
      copy: async (opts) => ({ data: { id: `mock-copy-${Date.now()}` } }),
      create: async (opts) => ({ data: { id: `mock-create-${Date.now()}` } }),
      delete: async (opts) => ({ data: {} }),
    },
  }),
  script: ({ version, auth } = {}) => ({
    scripts: {
      run: async (request) => ({ data: { response: { result: { success: true } } } }),
    },
  }),
};

module.exports = { google: mockGoogle };
