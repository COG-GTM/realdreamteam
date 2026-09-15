const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRng } = require('./rng');
const { nextHouseRef, driftEstimate, selectSoldLots, pickBankLots } = require('./recycle');

test.describe('nextHouseRef', () => {
  test.it('bumps the season suffix', () => {
    assert.equal(nextHouseRef('L26021', ['L26021']), 'L26021-S2');
    assert.equal(nextHouseRef('L26021', ['L26021', 'L26021-S2']), 'L26021-S3');
    assert.equal(nextHouseRef('L26021-S2', ['L26021', 'L26021-S2', 'L26021-S3']), 'L26021-S4');
    assert.equal(nextHouseRef(null, []), 'sale-S2');
  });
});

test.describe('driftEstimate', () => {
  test.it('drifts ±10% and rounds coarsely', () => {
    assert.equal(driftEstimate(50000, 1.0), 50000);
    assert.equal(driftEstimate(50000, 1.1), 55000);
    assert.equal(driftEstimate(500, 1.1), 550); // small values round to nearest 1
    assert.equal(driftEstimate(2000, 0.95), 1900); // >= 1000 drifts to nearest 10
    assert.equal(driftEstimate(null, 1.1), null);
  });
});

test.describe('selectSoldLots', () => {
  test.it('keeps roughly 30% with a seeded rng', () => {
    const sold = Array.from({ length: 30 }, (_, i) => ({ id: i }));
    const kept = selectSoldLots(sold, makeRng(4));
    assert.ok(kept.length > 0 && kept.length < 20, kept.length);
    assert.ok(kept.every((lot) => lot.id != null));
  });
});

test.describe('pickBankLots', () => {
  const bank = [
    { source_url: 'a' }, { source_url: 'b' }, { source_url: 'c' }, { source_url: 'd' }, {}
  ];

  test.it('skips live urls and url-less rows, longest-unseen first', () => {
    const lastSeen = new Map([['b', 300], ['d', 100], ['c', 200]]);
    const picked = pickBankLots(bank, new Set(['d']), lastSeen, 10);
    assert.deepEqual(picked.map((lot) => lot.source_url), ['a', 'c', 'b']);
  });

  test.it('respects the count', () => {
    assert.equal(pickBankLots(bank, new Set(), new Map(), 2).length, 2);
  });
});
