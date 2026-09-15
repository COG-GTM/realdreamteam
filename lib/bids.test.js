const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBid } = require('./bids');

test('accepts a bid higher than the current high bid', () => {
  const result = validateBid({ amount: '41000', highBid: 40000, startingBid: 30000, status: 'open' });
  assert.equal(result.ok, true);
  assert.equal(result.amount, 41000);
});

test('rejects a bid equal to the current high bid', () => {
  const result = validateBid({ amount: '40000', highBid: 40000, startingBid: 30000, status: 'open' });
  assert.equal(result.ok, false);
  assert.match(result.error, /higher than the current high bid of 40000/);
});

test('rejects a bid lower than the current high bid', () => {
  const result = validateBid({ amount: '35000', highBid: 40000, startingBid: 30000, status: 'open' });
  assert.equal(result.ok, false);
});

test('accepts a bid equal to the starting bid when there are no bids', () => {
  const result = validateBid({ amount: '40000', highBid: null, startingBid: 40000, status: 'open' });
  assert.equal(result.ok, true);
});

test('rejects a bid below the starting bid when there are no bids', () => {
  const result = validateBid({ amount: '39999', highBid: null, startingBid: 40000, status: 'open' });
  assert.equal(result.ok, false);
  assert.match(result.error, /at least the starting bid of 40000/);
});

test('rejects zero, negative, decimal, text and empty amounts', () => {
  for (const amount of ['0', '-5', '12.5', 'abc', '']) {
    const result = validateBid({ amount, highBid: null, startingBid: null, status: 'open' });
    assert.equal(result.ok, false, `expected ${amount} to fail`);
  }
});

test('rejects bids when the auction is closed or upcoming', () => {
  for (const status of ['closed', 'upcoming']) {
    const result = validateBid({ amount: '50000', highBid: null, startingBid: 40000, status });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'Bidding is closed for this auction.');
  }
});

test('accepts a whitespace-padded amount', () => {
  const result = validateBid({ amount: '  500 ', highBid: null, startingBid: 400, status: 'open' });
  assert.equal(result.ok, true);
  assert.equal(result.amount, 500);
});

test('rejects amounts beyond the safe integer range', () => {
  const result = validateBid({ amount: '9007199254740993', highBid: null, startingBid: null, status: 'open' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'That amount is too large.');
});

test('accepts any positive amount when there is neither a high bid nor a starting bid', () => {
  assert.equal(validateBid({ amount: '1', highBid: null, startingBid: null, status: 'open' }).ok, true);
  assert.equal(validateBid({ amount: 25, highBid: null, startingBid: null, status: 'open' }).ok, true);
});

test('prefers the high bid over the starting bid when both are known', () => {
  const result = validateBid({ amount: '45000', highBid: 50000, startingBid: 40000, status: 'open' });
  assert.equal(result.ok, false);
  assert.match(result.error, /higher than the current high bid of 50000/);
});

test('rejects a null or undefined amount', () => {
  assert.equal(validateBid({ amount: null, highBid: null, startingBid: null, status: 'open' }).ok, false);
  assert.equal(validateBid({ amount: undefined, highBid: null, startingBid: null, status: 'open' }).ok, false);
});
