const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBid, bidIncrement, nextBid, maxBid } = require('./bids');

const open = (amount, options = {}) => validateBid({ amount, status: 'open', ...options });

test('accepts a bid at the next increment above the current high bid', () => {
  const result = open('42500', { highBid: 40000, startingBid: 30000 });
  assert.deepEqual(result, { ok: true, amount: 42500, rounded: false });
});

test('rejects a bid equal to or below the minimum above the current high bid', () => {
  const equal = open('40000', { highBid: 40000, startingBid: 30000 });
  assert.equal(equal.ok, false);
  assert.match(equal.error, /at least 42,500 \(current high bid 40,000 \+ 2,500 step\)/);
  const low = open('41000', { highBid: 40000, startingBid: 30000 });
  assert.equal(low.ok, false);
});

test('accepts a bid equal to the starting bid when there are no bids', () => {
  assert.deepEqual(open('40000', { startingBid: 40000 }), { ok: true, amount: 40000, rounded: false });
});

test('rejects a bid below the starting bid when there are no bids', () => {
  const result = open('39999', { startingBid: 40000 });
  assert.equal(result.ok, false);
  assert.match(result.error, /at least the starting bid of 40,000/);
});

test('rejects zero, negative, text and empty amounts', () => {
  for (const amount of ['0', '-5', 'abc', '']) {
    assert.equal(open(amount).ok, false, `expected ${amount} to fail`);
  }
  assert.equal(open('0').error, 'Enter an amount greater than zero.');
});

test('rejects bids when the auction is closed or upcoming', () => {
  for (const status of ['closed', 'upcoming']) {
    const result = validateBid({ amount: '50000', startingBid: 40000, status });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'Bidding is closed for this auction.');
  }
});

test('accepts a whitespace-padded amount', () => {
  const result = open('  440 ', { startingBid: 400 });
  assert.deepEqual(result, { ok: true, amount: 440, rounded: false });
});

test('rejects amounts beyond the safe integer range', () => {
  const result = open('9007199254740993');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'That amount is too large.');
});

test('requires a minimum of 1 when there is no anchor', () => {
  assert.deepEqual(open('1'), { ok: true, amount: 1, rounded: false });
  assert.equal(open('0.99').ok, false);
  assert.equal(open('0.99').error, 'Minimum bid is 1.');
  assert.equal(maxBid({}), null);
});

test('ignores zero-valued anchors', () => {
  for (const field of ['startingBid', 'estimateLow']) {
    const options = { [field]: 0 };
    assert.equal(open('0.01', options).error, 'Minimum bid is 1.');
    assert.deepEqual(open('5', options), { ok: true, amount: 5, rounded: false });
  }
  assert.equal(nextBid({ startingBid: 0, estimateLow: 0 }), null);
  assert.equal(maxBid({ startingBid: 0, estimateLow: 0 }), null);
});

test('prefers the high bid over the starting bid and estimate', () => {
  const result = open('45000', { highBid: 50000, startingBid: 40000, estimateLow: 30000 });
  assert.equal(result.ok, false);
  assert.match(result.error, /at least 55,000 \(current high bid 50,000 \+ 5,000 step\)/);
});

test('uses estimateLow as the opening bid anchor', () => {
  assert.deepEqual(open('120', { estimateLow: 100 }), { ok: true, amount: 120, rounded: false });
  assert.equal(open('99', { estimateLow: 100 }).ok, false);
});

test('rejects self-outbidding', () => {
  const result = open('600', { highBid: 500, userId: '7', highBidderId: 7 });
  assert.deepEqual(result, { ok: false, error: 'You are already the high bidder.' });
});

test('rejects a null or undefined amount', () => {
  assert.equal(open(null).ok, false);
  assert.equal(open(undefined).ok, false);
});

test('returns the increment for every price boundary', () => {
  for (const [price, increment] of [
    [0.99, 0.05], [1, 0.25], [4.99, 0.25], [5, 0.5], [24.99, 0.5], [25, 1],
    [99.99, 1], [100, 10], [499, 10], [500, 25], [999, 25], [1000, 100],
    [2499, 100], [2500, 250], [9999, 500], [10000, 1000], [49999, 2500],
    [50000, 5000], [99999, 5000], [100000, 10000], [500000, 50000]
  ]) {
    assert.equal(bidIncrement(price), increment, `increment at ${price}`);
  }
});

test('computes next bid and cap for representative prices', () => {
  for (const [price, expectedNext, expectedCap] of [
    [50, 51, 100], [100, 110, 130], [1000, 1100, 1300], [55000, 60000, 70000]
  ]) {
    assert.equal(nextBid({ highBid: price }), expectedNext);
    assert.equal(maxBid({ highBid: price }), expectedCap);
  }
});

test('rounds down to the nearest bid step', () => {
  assert.deepEqual(open('1250', { highBid: 1000 }), { ok: true, amount: 1200, rounded: true });
});

test('accepts cents and rounds them using exact minor units', () => {
  assert.deepEqual(open('12.50', { highBid: 12 }), { ok: true, amount: 12.5, rounded: false });
  assert.deepEqual(open('0.10', { highBid: 0.05 }), { ok: true, amount: 0.1, rounded: false });
  assert.equal(open('12.3', { highBid: 12 }).ok, false);
  assert.match(open('12.3', { highBid: 12 }).error, /at least 12.50/);
});

test('validates comma-separated amounts before stripping separators', () => {
  assert.deepEqual(open('1,250'), { ok: true, amount: 1250, rounded: false });
  assert.deepEqual(open('1,250.50'), { ok: true, amount: 1250.5, rounded: false });
  for (const amount of ['1,00', '1,0000']) {
    assert.equal(open(amount).error, 'Enter an amount like 1250 or 1250.50.');
  }
  assert.equal(open('1250.125').error, 'Enter an amount like 1250 or 1250.50.');
});

test('rejects a rounded bid above the cap', () => {
  const result = open('1450', { highBid: 1000 });
  assert.equal(result.ok, false);
  assert.equal(result.error, "Bids can't jump more than that above the current price. Bid up to 1,300.");
});
