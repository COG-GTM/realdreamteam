const test = require('node:test');
const assert = require('node:assert/strict');
const { splitList, asArray } = require('./preferences');

test('splitList trims entries and drops empty ones', () => {
  assert.deepEqual(splitList('Yayoi Kusama, Banksy , ,'), ['Yayoi Kusama', 'Banksy']);
  assert.deepEqual(splitList('  single  '), ['single']);
});

test('splitList returns an empty list for missing or blank input', () => {
  assert.deepEqual(splitList(''), []);
  assert.deepEqual(splitList(null), []);
  assert.deepEqual(splitList(undefined), []);
  assert.deepEqual(splitList(' , , '), []);
});

test('splitList keeps internal spaces and punctuation', () => {
  assert.deepEqual(splitList('Wine & Spirits, Books & Manuscripts'), ['Wine & Spirits', 'Books & Manuscripts']);
});

test('asArray normalises checkbox values', () => {
  assert.deepEqual(asArray(undefined), []);
  assert.deepEqual(asArray('Cars'), ['Cars']);
  assert.deepEqual(asArray(['Cars', 'Watches']), ['Cars', 'Watches']);
});

test('asArray wraps other scalar values instead of dropping them', () => {
  assert.deepEqual(asArray(''), ['']);
  assert.deepEqual(asArray(0), [0]);
});
