const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeName, dedupeArray, wordsFor, findUnmatched } = require('./category-admin');

test('normalizes category names and rejects empty values', () => {
  assert.equal(normalizeName('  Wine   &  Spirits '), 'Wine & Spirits');
  assert.throws(() => normalizeName('  '), { status: 400 });
});

test('dedupes case-insensitively while preserving first spelling', () => {
  assert.deepEqual(dedupeArray(['Art', 'art', ' Wine ', 'WINE']), ['Art', ' Wine ']);
});

test('extracts searchable words of at least three characters', () => {
  assert.deepEqual(wordsFor('Wine & Spirits'), ['wine', 'spirits']);
  assert.deepEqual(wordsFor('&'), []);
});

test('finds unmatched lot and preference categories case-insensitively', () => {
  const report = findUnmatched(
    ['Art', 'Wine'],
    [{ id: 1, title: 'One', category: 'art' }, { id: 2, title: 'Two', category: 'Cars' }],
    [{ user_id: 3, categories: ['WINE', 'Retired'] }, { user_id: 4, categories: [] }]
  );
  assert.deepEqual(report, {
    unmatchedLots: [{ id: 2, title: 'Two', category: 'Cars' }],
    unmatchedPreferences: [{ user_id: 3, name: 'Retired' }]
  });
});
