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

const { isCategory, canonicalName } = require('./categories');

test('isCategory matches case-insensitively with surrounding whitespace', () => {
  assert.equal(isCategory('contemporary art'), true);
  assert.equal(isCategory('  WATCHES '), true);
  assert.equal(isCategory('Paintings'), false);
  assert.equal(isCategory(''), false);
  assert.equal(isCategory(null), false);
});

test('isCategory and canonicalName accept database rows as the list', () => {
  const rows = [{ id: 1, name: 'Wine & Spirits' }, { id: 2, name: 'Cars' }];
  assert.equal(isCategory('cars', rows), true);
  assert.equal(canonicalName('wine & spirits', rows), 'Wine & Spirits');
  assert.equal(canonicalName('Boats', rows), null);
});

test('canonicalName returns the canonical spelling from the default list', () => {
  assert.equal(canonicalName('modern british art'), 'Modern British Art');
  assert.equal(canonicalName(undefined), null);
});

test('listCategories excludes inactive rows unless asked', async () => {
  const seen = [];
  const client = { query: async (sql) => { seen.push(sql); return { rows: [{ id: 1, name: 'X', active: false }] }; } };
  await listCategories(client);
  assert.match(seen[0], /WHERE active = true/);
  await listCategories(client, { includeInactive: true });
  assert.doesNotMatch(seen[1], /WHERE active/);
});

test('listCategories returns an empty list when every category is inactive', async () => {
  let calls = 0;
  const client = {
    query: async () => {
      calls += 1;
      return calls === 1 ? { rows: [] } : { rows: [{ '?column?': 1 }] };
    }
  };
  assert.deepEqual(await listCategories(client), []);
});

test('listCategories falls back to the built-in list when the table does not exist', async () => {
  const client = { query: async () => { throw Object.assign(new Error('relation "categories" does not exist'), { code: '42P01' }); } };
  const rows = await listCategories(client);
  assert.deepEqual(rows.map((row) => row.name), categories);
  assert.ok(rows.every((row) => row.active && row.id === null));
});

test('listCategories rethrows other database errors', async () => {
  const client = { query: async () => { throw Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }); } };
  await assert.rejects(() => listCategories(client), /connection refused/);
});
