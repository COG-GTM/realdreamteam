const test = require('node:test');
const assert = require('node:assert/strict');
const { pickWinner, soldReason, validateClosesAt } = require('./close');

test('pickWinner returns null with no bids', () => {
  assert.equal(pickWinner([]), null);
});

test('pickWinner takes the highest amount', () => {
  const bids = [
    { user_id: 1, amount: 100, placed_at: '2026-09-15T10:00:00Z' },
    { user_id: 2, amount: 300, placed_at: '2026-09-15T10:02:00Z' },
    { user_id: 1, amount: 200, placed_at: '2026-09-15T10:01:00Z' }
  ];
  assert.equal(pickWinner(bids).user_id, 2);
});

test('pickWinner breaks ties by earliest placed_at', () => {
  const bids = [
    { user_id: 1, amount: 500, placed_at: '2026-09-15T10:05:00Z' },
    { user_id: 2, amount: 500, placed_at: '2026-09-15T10:01:00Z' }
  ];
  assert.equal(pickWinner(bids).user_id, 2);
});

test('soldReason differs for winner and other bidders', () => {
  assert.equal(soldReason('Mark Porter', 55000, 'GBP', true), 'Sold to Mark Porter for £55,000 — congratulations!');
  assert.equal(soldReason('Mark Porter', 55000, 'GBP', false), 'Sold to Mark Porter for £55,000 — better luck next time');
});

test('validateClosesAt reads datetime-local text as US Central', () => {
  const result = validateClosesAt('2026-09-15T11:15', '2026-09-10T09:00:00Z');
  assert.equal(result.value.toISOString(), '2026-09-15T16:15:00.000Z');
});

test('validateClosesAt keeps text with an explicit zone', () => {
  const result = validateClosesAt('2026-09-15T11:15Z', '2026-09-10T09:00:00Z');
  assert.equal(result.value.toISOString(), '2026-09-15T11:15:00.000Z');
});

test('validateClosesAt rejects empty, garbage and times before the start', () => {
  assert.ok(validateClosesAt('', '2026-09-10T09:00:00Z').error);
  assert.ok(validateClosesAt('tomorrow', '2026-09-10T09:00:00Z').error);
  assert.ok(validateClosesAt('2026-09-10T08:00', '2026-09-10T15:00:00Z').error);
  assert.ok(validateClosesAt('2026-09-10T09:00', '2026-09-10T15:00:00Z').error);
});

test('pickWinner ignores bid order and compares numeric strings', () => {
  const bids = [
    { user_id: 1, amount: '900', placed_at: '2026-09-15T10:00:00Z' },
    { user_id: 2, amount: '1000', placed_at: '2026-09-15T10:01:00Z' },
    { user_id: 3, amount: '95', placed_at: '2026-09-15T09:00:00Z' }
  ];
  assert.equal(pickWinner(bids).user_id, 2);
  assert.equal(pickWinner([...bids].reverse()).user_id, 2);
});

test('pickWinner returns the same row object it was given', () => {
  const only = { user_id: 4, amount: 10, placed_at: '2026-09-15T10:00:00Z', name: 'Dee' };
  assert.equal(pickWinner([only]), only);
});

test('soldReason formats other currencies', () => {
  assert.equal(soldReason('Ann', 1200, 'USD', true), 'Sold to Ann for $1,200 — congratulations!');
  assert.equal(soldReason('Ann', 1200, 'EUR', false), 'Sold to Ann for €1,200 — better luck next time');
});

test('validateClosesAt accepts an offset zone and works without a start time', () => {
  assert.equal(validateClosesAt('2026-09-15T11:15+02:00').value.toISOString(), '2026-09-15T09:15:00.000Z');
  assert.equal(validateClosesAt('2026-09-15T11:15-0500', null).value.toISOString(), '2026-09-15T16:15:00.000Z');
});

test('validateClosesAt reports the specific problem', () => {
  assert.equal(validateClosesAt('   ').error, 'Close time is required.');
  assert.equal(validateClosesAt('next tuesday').error, 'Close time must be a valid date and time.');
  assert.equal(validateClosesAt('2026-09-10T08:00', '2026-09-10T15:00:00Z').error, 'Close time must be after the start time.');
});
