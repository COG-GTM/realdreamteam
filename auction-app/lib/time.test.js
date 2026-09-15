const test = require('node:test');
const assert = require('node:assert/strict');
const { formatCentral, toCentralInput, fromCentralInput } = require('./time');

test('formats timestamps in US Central', () => {
  assert.equal(formatCentral('2026-09-15T15:00:00.000Z'), '15 Sep 2026, 10:00 CDT');
  assert.equal(formatCentral(new Date('2026-01-15T23:59:00Z')), '15 Jan 2026, 17:59 CST');
});

test('returns an empty string for missing or invalid values', () => {
  assert.equal(formatCentral(null), '');
  assert.equal(formatCentral('not a date'), '');
});

test('toCentralInput renders Central wall-clock for datetime-local', () => {
  assert.equal(toCentralInput('2026-09-15T15:00:00Z'), '2026-09-15T10:00');
  assert.equal(toCentralInput(null), '');
});

test('fromCentralInput reads datetime-local text as US Central', () => {
  assert.equal(fromCentralInput('2026-09-15T10:00').toISOString(), '2026-09-15T15:00:00.000Z');
  assert.equal(fromCentralInput('2026-01-15T17:59').toISOString(), '2026-01-15T23:59:00.000Z');
  assert.ok(Number.isNaN(fromCentralInput('garbage').getTime()));
});
