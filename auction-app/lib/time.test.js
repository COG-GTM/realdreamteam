const test = require('node:test');
const assert = require('node:assert/strict');
const { formatUtc } = require('./time');

test('formats timestamps in UTC', () => {
  assert.equal(formatUtc('2026-09-15T06:43:12.000Z'), '2026-09-15 06:43 UTC');
  assert.equal(formatUtc(new Date('2026-01-01T23:59:00Z')), '2026-01-01 23:59 UTC');
});

test('returns an empty string for missing or invalid values', () => {
  assert.equal(formatUtc(null), '');
  assert.equal(formatUtc('not a date'), '');
});
