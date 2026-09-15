const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesPreferences, matchReasons } = require('./matching');

const lot = {
  title: 'Pumpkin (Blue)',
  artist: 'Yayoi Kusama',
  category: 'Contemporary Art',
  description: 'Painted resin sculpture with blue dots.'
};

test('matches an artist preference', () => {
  assert.equal(matchesPreferences(lot, { artists: ['Yayoi Kusama'] }), true);
  assert.deepEqual(matchReasons(lot, { artists: ['Yayoi Kusama'] }), ['artist']);
});

test('matches a category preference', () => {
  assert.deepEqual(matchReasons(lot, { categories: ['Contemporary Art'] }), ['category']);
});

test('matches a keyword in the title case-insensitively', () => {
  assert.deepEqual(matchReasons(lot, { keywords: ['blue'] }), ['"blue"']);
});

test('matches a keyword in the description', () => {
  assert.deepEqual(matchReasons(lot, { keywords: ['RESIN'] }), ['"RESIN"']);
});

test('returns all matching reasons', () => {
  assert.deepEqual(matchReasons(lot, {
    artists: ['Yayoi Kusama'],
    categories: ['Contemporary Art'],
    keywords: ['blue']
  }), ['artist', 'category', '"blue"']);
});

test('does not match unrelated preferences', () => {
  assert.equal(matchesPreferences(lot, {
    artists: ['Banksy'],
    categories: ['Photography'],
    keywords: ['green']
  }), false);
});
