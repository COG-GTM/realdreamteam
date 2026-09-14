const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesPreferences } = require('../lib/matching');

const item = {
  title: 'Untitled (Blue)',
  artist: 'Yayoi Kusama',
  category: 'Contemporary Art',
  estimateLow: 40000,
  estimateHigh: 60000
};

const prices = { minPrice: 10000, maxPrice: 100000 };

test('matches a category preference', () => {
  assert.equal(matchesPreferences(item, {
    ...prices,
    categories: ['Contemporary Art'],
    artists: [],
    keywords: []
  }), true);
});

test('matches an artist preference case-insensitively', () => {
  assert.equal(matchesPreferences(item, {
    ...prices,
    categories: [],
    artists: ['yayoi kusama'],
    keywords: []
  }), true);
});

test('matches a keyword in the title case-insensitively', () => {
  assert.equal(matchesPreferences(item, {
    ...prices,
    categories: [],
    artists: [],
    keywords: ['BLUE']
  }), true);
});

test('rejects an item with no matching preference', () => {
  assert.equal(matchesPreferences(item, {
    ...prices,
    categories: ['Photography'],
    artists: ['Banksy'],
    keywords: ['red']
  }), false);
});

test('rejects an item outside the preferred price range', () => {
  assert.equal(matchesPreferences(item, {
    minPrice: 70000,
    maxPrice: 90000,
    categories: ['Contemporary Art'],
    artists: [],
    keywords: []
  }), false);
});

test('treats null price bounds as unbounded', () => {
  assert.equal(matchesPreferences(item, {
    minPrice: null,
    maxPrice: null,
    categories: ['Contemporary Art'],
    artists: [],
    keywords: []
  }), true);
});
