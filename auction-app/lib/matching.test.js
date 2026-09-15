const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesPreferences, matchReasons } = require('./matching');

const item = {
  title: 'Pumpkin (Blue)',
  artist: 'Yayoi Kusama',
  category: 'Contemporary Art',
  estimate_low: 50000
};

test('matches an artist preference', () => {
  assert.equal(matchesPreferences(item, { artists: ['Yayoi Kusama'] }), true);
  assert.deepEqual(matchReasons(item, { artists: ['Yayoi Kusama'] }), ['artist']);
});

test('matches a category preference', () => {
  assert.deepEqual(matchReasons(item, { categories: ['Contemporary Art'] }), ['category']);
});

test('matches a case-insensitive title keyword', () => {
  assert.deepEqual(matchReasons(item, { keywords: ['blue'] }), ['"blue"']);
});

test('matches an estimate in the price range', () => {
  assert.deepEqual(matchReasons(item, { minPrice: 40000, maxPrice: 60000 }), ['price range']);
});

test('returns all matching reasons', () => {
  assert.deepEqual(matchReasons(item, {
    artists: ['Yayoi Kusama'],
    categories: ['Contemporary Art'],
    keywords: ['blue'],
    minPrice: 40000,
    maxPrice: 60000
  }), ['artist', 'category', '"blue"', 'price range']);
});

test('does not match unrelated preferences', () => {
  assert.equal(matchesPreferences(item, {
    artists: ['Banksy'], categories: ['Photography'], keywords: ['green'],
    minPrice: 1000, maxPrice: 2000
  }), false);
});
