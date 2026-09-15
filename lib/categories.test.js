const test = require('node:test');
const assert = require('node:assert/strict');
const { categories, listCategories } = require('./categories');

test('listCategories runs queries through a supplied client', async () => {
  const row = { id: 1, name: 'X', position: 1, active: true };
  const client = { query: async () => ({ rows: [row] }) };
  assert.deepEqual(await listCategories(client), [row]);
});

test('listCategories falls back when the categories table is empty', async () => {
  const client = { query: async () => ({ rows: [] }) };
  const rows = await listCategories(client);
  assert.equal(rows.length, categories.length);
  assert.deepEqual(rows.map((row) => row.name), categories);
});
