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

test('fromCentralInput accepts a space separator and seconds', () => {
  assert.equal(fromCentralInput('2026-09-15 10:00:30').toISOString(), '2026-09-15T15:00:30.000Z');
  assert.equal(fromCentralInput(' 2026-09-15T10:00 ').toISOString(), '2026-09-15T15:00:00.000Z');
});

test('fromCentralInput rejects partial or empty input', () => {
  for (const text of ['', null, undefined, '2026-09-15', '2026-09-15T10', '10:00']) {
    assert.ok(Number.isNaN(fromCentralInput(text).getTime()), `expected ${JSON.stringify(text)} to be invalid`);
  }
});

test('fromCentralInput follows daylight-saving transitions', () => {
  // 2026: CDT starts 8 Mar 02:00, CST resumes 1 Nov 02:00.
  assert.equal(fromCentralInput('2026-03-07T12:00').toISOString(), '2026-03-07T18:00:00.000Z');
  assert.equal(fromCentralInput('2026-03-08T12:00').toISOString(), '2026-03-08T17:00:00.000Z');
  assert.equal(fromCentralInput('2026-10-31T12:00').toISOString(), '2026-10-31T17:00:00.000Z');
  assert.equal(fromCentralInput('2026-11-01T12:00').toISOString(), '2026-11-01T18:00:00.000Z');
});

test('toCentralInput and fromCentralInput round-trip', () => {
  for (const iso of ['2026-01-01T06:00:00.000Z', '2026-07-04T04:59:00.000Z', '2026-12-31T23:30:00.000Z']) {
    assert.equal(fromCentralInput(toCentralInput(iso)).toISOString(), iso);
  }
});

test('toCentralInput returns an empty string for invalid dates', () => {
  assert.equal(toCentralInput('garbage'), '');
  assert.equal(toCentralInput(undefined), '');
});

test('formatCentral pads day and hour', () => {
  assert.equal(formatCentral('2026-03-05T14:05:00Z'), '05 Mar 2026, 08:05 CST');
});
