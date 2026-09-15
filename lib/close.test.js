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
